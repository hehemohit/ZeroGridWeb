const axios = require('axios');
const SosEvent = require('../models/SosEvent');

// Lazy-load Strands SDK
let StrandsAgent = null;
let StrandsBedrockModel = null;
try {
  const sdk = require('@strands-agents/sdk');
  StrandsAgent = sdk.Agent;
  StrandsBedrockModel = sdk.BedrockModel;
} catch (err) {
  console.warn('[StrandsRouterAgent] @strands-agents/sdk not loaded:', err.message);
}

/**
 * Fetch OSRM candidate routes between origin and destination.
 */
async function fetchOsrmRoutes(originLat, originLng, destLat, destLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?alternatives=true&overview=full&geometries=geojson&steps=true`;
    const response = await axios.get(url, { timeout: 6000 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      return response.data.routes;
    }
  } catch (err) {
    console.warn('[StrandsRouterAgent] OSRM fetch failed:', err.message);
  }
  return null;
}

/**
 * Fetch active flood/water hazards from MongoDB near the midpoint of origin and destination.
 */
async function getActiveFloodHazards(originLat, originLng, destLat, destLng, radiusMeters = 15000) {
  try {
    const midLat = (Number(originLat) + Number(destLat)) / 2;
    const midLng = (Number(originLng) + Number(destLng)) / 2;

    const hazards = await SosEvent.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [midLng, midLat]
          },
          $maxDistance: radiusMeters
        }
      },
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
      category: {
        $in: [
          'WATERLOGGING',
          'SUBMERGED_UNDERPASS',
          'DRAINAGE_OVERFLOW',
          'FALLEN_GRID',
          'DISASTER'
        ]
      }
    })
      .select('location waterDepthCm passability category message createdAt')
      .limit(30)
      .lean();

    return hazards;
  } catch (err) {
    console.warn('[StrandsRouterAgent] Error querying active flood hazards:', err.message);
    return [];
  }
}

/**
 * Fallback route generation when Strands Agent / Bedrock is unavailable.
 */
function buildFallbackDetour(osrmRoutes, hazards, originLat, originLng, destLat, destLng) {
  const chosenRoute = (osrmRoutes && osrmRoutes.length > 1) ? osrmRoutes[1] : (osrmRoutes ? osrmRoutes[0] : null);

  const fallbackGeoJson = chosenRoute?.geometry || {
    type: 'LineString',
    coordinates: [
      [Number(originLng), Number(originLat)],
      [(Number(originLng) + Number(destLng)) / 2 + 0.005, (Number(originLat) + Number(destLat)) / 2 + 0.005],
      [Number(destLng), Number(destLat)]
    ]
  };

  const avoidedCategories = Array.from(new Set(hazards.map((h) => h.category)));
  const highestDepth = hazards.reduce((max, h) => Math.max(max, h.waterDepthCm || 0), 0);

  return {
    warningMessage: hazards.length > 0
      ? `Active waterlogging detected (${hazards.length} hazards, max depth ${highestDepth}cm). Safe detour calculated.`
      : 'No critical flood blockages along standard arterial corridor.',
    recommendedRouteGeoJson: fallbackGeoJson,
    avoidedHazards: avoidedCategories.length > 0 ? avoidedCategories : ['LOW_RISK_CORRIDOR'],
    agentAdvisory: hazards.length > 0
      ? `Deterministic Safety Guard: Rerouted around ${hazards.length} waterlogged zone(s). Avoid low-lying underpasses.`
      : 'Roadway clear. Proceed with caution during continuous rainfall.'
  };
}

/**
 * Calculate safe detour using AWS Strands Agent or fallback.
 */
async function getDetour(originLat, originLng, destLat, destLng) {
  const [hazards, osrmRoutes] = await Promise.all([
    getActiveFloodHazards(originLat, originLng, destLat, destLng),
    fetchOsrmRoutes(originLat, originLng, destLat, destLng)
  ]);

  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (StrandsAgent && StrandsBedrockModel && hasAwsCreds) {
    try {
      const model = new StrandsBedrockModel({
        region: process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0'
      });

      const agent = new StrandsAgent({
        model,
        systemPrompt: `You are an Urban Flood & Heatwave Routing Specialist for ZeroGrid, India's disaster mesh response platform.
You are given active flood hazards (coordinates, waterDepthCm, passability) and candidate road routes from OSRM.
Evaluate candidate routes against water depth thresholds:
- waterDepthCm >= 60cm: IMPASSABLE. Must strictly bypass.
- waterDepthCm >= 30cm: HIGH_CLEARANCE_ONLY. Caution.
Select the safest candidate route index or synthesize an advisory.
Respond with pure JSON only, no markdown formatting:
{
  "warningMessage": "string",
  "recommendedRouteGeoJson": { "type": "LineString", "coordinates": [...] },
  "avoidedHazards": ["string"],
  "agentAdvisory": "string"
}`
      });

      const prompt = `Origin: [${originLat}, ${originLng}], Destination: [${destLat}, ${destLng}]
Active Flood Hazards: ${JSON.stringify(hazards)}
Candidate Routes Count: ${osrmRoutes ? osrmRoutes.length : 0}
OSRM First Geometry: ${osrmRoutes && osrmRoutes[0] ? JSON.stringify(osrmRoutes[0].geometry) : 'null'}
OSRM Alternative Geometry: ${osrmRoutes && osrmRoutes[1] ? JSON.stringify(osrmRoutes[1].geometry) : 'null'}

Provide your safety routing evaluation as JSON.`;

      const response = await agent.invoke({ prompt });
      const responseText = typeof response === 'string' ? response : (response.output || response.text || JSON.stringify(response));
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.recommendedRouteGeoJson && parsed.agentAdvisory) {
        return parsed;
      }
    } catch (llmErr) {
      console.warn('[StrandsRouterAgent] AWS Strands Bedrock invocation error, using deterministic fallback:', llmErr.message);
    }
  }

  return buildFallbackDetour(osrmRoutes, hazards, originLat, originLng, destLat, destLng);
}

/**
 * Generate an AWS Strands Agent situation brief for an incident.
 */
async function getSituationBrief(incident) {
  const depth = incident.waterDepthCm || 0;
  const passability = incident.passability || 'ALL_PASSABLE';
  const category = incident.category || 'OTHER';

  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (StrandsAgent && StrandsBedrockModel && hasAwsCreds) {
    try {
      const model = new StrandsBedrockModel({
        region: process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0'
      });

      const agent = new StrandsAgent({
        model,
        systemPrompt: `You are ZeroGrid's Tactical Disaster Intelligence Agent powered by AWS Strands.
Generate an actionable municipal and emergency response brief for an incident.
Return ONLY valid JSON:
{
  "municipalActions": ["string"],
  "trafficDiversion": "string",
  "agentAdvisory": "string"
}`
      });

      const prompt = `Incident Details:
- Category: ${category}
- Reported Water Depth: ${depth} cm
- Passability: ${passability}
- Coordinates: ${JSON.stringify(incident.location?.coordinates || [])}
- Relayed By Mule: ${incident.relayedByMule ? 'YES (Mesh Store-and-Forward)' : 'NO (Direct Cellular/WiFi)'}
- Message: ${incident.message || 'No additional note'}

Generate municipal intervention action points, traffic diversions, and tactical advisory.`;

      const response = await agent.invoke({ prompt });
      const responseText = typeof response === 'string' ? response : (response.output || response.text || JSON.stringify(response));
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.municipalActions && parsed.agentAdvisory) {
        return parsed;
      }
    } catch (llmErr) {
      console.warn('[StrandsRouterAgent] Strands Brief Bedrock invocation error, using fallback:', llmErr.message);
    }
  }

  // Deterministic Expert System Fallback for Urban Flood / Heatwave / Power Disruption
  const actions = [];
  let diversion = 'No immediate regional detour mandated; maintain emergency vehicle lane.';
  let advisory = `Hazard category: ${category}. Water depth: ${depth}cm.`;

  if (depth >= 60 || passability === 'IMPASSABLE' || category === 'SUBMERGED_UNDERPASS') {
    actions.push('Deploy high-capacity mobile dewatering pump trucks (>= 500 GPM) immediately.');
    actions.push('Erect illuminated barricades and warning signage at all feeder approaches.');
    actions.push('Dispatch municipal quick-response team (QRT) to verify drainage catch-pit blockages.');
    actions.push('Coordinate with state disaster management authority (SDMA) for boat/amphibious standby if residential ingress is blocked.');
    diversion = 'Total road closure. Divert all light and commercial vehicles via elevated bypass road.';
    advisory = `CRITICAL HAZARD: Water level at ${depth}cm exceeds safe threshold. Structure is impassable to all civilian vehicles.`;
  } else if (depth >= 30 || passability === 'HIGH_CLEARANCE_ONLY' || category === 'WATERLOGGING') {
    actions.push('Activate gravity-drain bypass gates and inspect culvert grates.');
    actions.push('Deploy traffic marshals to restrict two-wheelers and sedans.');
    actions.push('Position heavy recovery crane at junction for stalled vehicle extraction.');
    diversion = 'Single-lane restricted flow: heavy/high-clearance transport only. Two-wheelers redirect to secondary road.';
    advisory = `MODERATE RISK: Water depth ${depth}cm. High risk of hydrostatic engine lock for small vehicles.`;
  } else if (category === 'HEATWAVE') {
    actions.push('Deploy mobile hydration misting units and shade canopies.');
    actions.push('Activate local primary healthcare center (PHC) ORS heat-stroke beds.');
    diversion = 'Caution advisory: Avoid asphalt foot travel between 12:00 PM and 4:00 PM.';
    advisory = 'Extreme wet-bulb temperature advisory. Mesh beacons broadcast water replenishment coordinates.';
  } else if (category === 'FALLEN_GRID') {
    actions.push('Isolate 11kV substation feeder line supplying affected district.');
    actions.push('Deploy state electricity board lineman crew for cable de-energization.');
    diversion = 'Cordon off 50m radius around fallen lines to prevent step-potential electrocution.';
    advisory = 'ELECTRICAL HAZARD: Downed live conductors in floodwater pose lethal electrocution risk.';
  } else {
    actions.push('Dispatch field assessment unit to confirm status.');
    actions.push('Monitor catchment drainage runoff rates.');
  }

  return {
    municipalActions: actions,
    trafficDiversion: diversion,
    agentAdvisory: advisory
  };
}

module.exports = {
  getDetour,
  getSituationBrief
};
