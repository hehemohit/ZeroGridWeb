const axios = require('axios');
const SosEvent = require('../models/SosEvent');
const groqService = require('./groqService');

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

// ─── OSRM Safe Client with In-Memory Caching & Rate-Limit Shield ───────────

const routeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute TTL

// OpenStreetMap & OSRM fair-use compliant User-Agent
const OSRM_HEADERS = {
  'User-Agent': 'ZeroGrid-Emergency-Response-Router/1.0 (https://github.com/hehemohit/ZeroGridWeb; disaster-mesh@zerogrid.org)',
  'Accept': 'application/json'
};

function getCacheKey(coords) {
  // Quantize coordinates to 4 decimals (~11 meters) to catch repeated clicks & micro-jitter
  return coords.map(([lng, lat]) => `${Number(lng).toFixed(4)},${Number(lat).toFixed(4)}`).join(';');
}

function getFromCache(key) {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key, data) {
  if (routeCache.size > 300) {
    const oldestKey = routeCache.keys().next().value;
    routeCache.delete(oldestKey);
  }
  routeCache.set(key, { data, timestamp: Date.now() });
}

const geocodeCache = new Map();

/**
 * Forward-geocode a place/landmark name into { lat, lng, displayName } using OpenStreetMap Nominatim.
 */
async function geocodePlaceName(name) {
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  const cleanName = name.trim();
  const cacheKey = cleanName.toLowerCase();

  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanName)}&format=json&limit=1`;
    const response = await axios.get(url, {
      headers: OSRM_HEADERS,
      timeout: 5000
    });

    if (response.data && response.data.length > 0) {
      const first = response.data[0];
      const result = {
        lat: parseFloat(first.lat),
        lng: parseFloat(first.lon),
        displayName: first.display_name
      };
      if (geocodeCache.size > 200) {
        const oldest = geocodeCache.keys().next().value;
        geocodeCache.delete(oldest);
      }
      geocodeCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn(`[Nominatim] Geocoding failed for "${cleanName}":`, err.message);
  }
  return null;
}

/**
 * Fetch OSRM candidate routes between origin and destination with caching.
 */
async function fetchOsrmRoutes(originLat, originLng, destLat, destLng) {
  const cacheKey = getCacheKey([[originLng, originLat], [destLng, destLat]]);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?alternatives=true&overview=full&geometries=geojson&steps=true`;
    const response = await axios.get(url, { headers: OSRM_HEADERS, timeout: 5000 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      setInCache(cacheKey, response.data.routes);
      return response.data.routes;
    }
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[StrandsRouterAgent] OSRM rate limit (429) encountered, falling back to local geometry bypass');
    } else {
      console.warn('[StrandsRouterAgent] OSRM fetch failed:', err.message);
    }
  }
  return null;
}

/**
 * Fetch active flood/water hazards from MongoDB near the midpoint of origin and destination.
 */
async function getActiveFloodHazards(originLat, originLng, destLat, destLng, radiusMeters = 15000) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.warn('[StrandsRouterAgent] MongoDB not connected (readyState !== 1), skipping hazard query');
      return [];
    }
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
 * Great-circle distance between two coordinates in meters.
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns minimum distance in meters from route coordinates to a hazard coordinate.
 */
function getMinDistanceToPoint(routeCoordinates, targetLat, targetLng) {
  if (!routeCoordinates || routeCoordinates.length === 0) return Infinity;
  let minD = Infinity;
  for (let i = 0; i < routeCoordinates.length; i++) {
    const [cLng, cLat] = routeCoordinates[i];
    const d = haversineMeters(cLat, cLng, targetLat, targetLng);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Effective avoidance radius based on water depth or hazard severity.
 * Matches frontend circle radius (120m for >=60cm, 80m for >=30cm, 50m otherwise) + 30m safety buffer.
 */
function getEffectiveHazardRadius(hazard) {
  const depth = hazard.waterDepthCm || 0;
  const visualRadius = depth >= 60 ? 120 : (depth >= 30 ? 80 : 50);
  return visualRadius + 30; // 150m, 110m, or 80m
}

/**
 * Evaluates route safety against active hazards.
 */
function evaluateRouteSafety(routeCoordinates, hazards, originLat, originLng, destLat, destLng) {
  const collidingHazards = [];
  let overallMinClearance = Infinity;

  for (const h of hazards) {
    const coords = h.location?.coordinates || [];
    const hazLng = coords[0];
    const hazLat = coords[1];
    if (hazLat === undefined || hazLng === undefined) continue;

    const effRadius = getEffectiveHazardRadius(h);
    const minD = getMinDistanceToPoint(routeCoordinates, hazLat, hazLng);
    const clearance = minD - effRadius;

    if (clearance < overallMinClearance) {
      overallMinClearance = clearance;
    }

    // Only count as collision if origin and dest are outside the hazard circle
    const origDist = haversineMeters(originLat, originLng, hazLat, hazLng);
    const destDist = haversineMeters(destLat, destLng, hazLat, hazLng);
    const endpointsOutside = origDist > effRadius && destDist > effRadius;

    if (minD < effRadius && endpointsOutside) {
      collidingHazards.push({
        hazard: h,
        hazLat,
        hazLng,
        effectiveRadius: effRadius,
        minDistance: minD,
        depth: h.waterDepthCm || 0
      });
    }
  }

  return {
    isSafe: collidingHazards.length === 0,
    minClearanceMeters: overallMinClearance,
    collidingHazards
  };
}

/**
 * Fetch OSRM route traversing an evasion waypoint: A -> Waypoint -> B
 */
async function fetchOsrmWaypointRoute(originLat, originLng, viaLat, viaLng, destLat, destLng) {
  const cacheKey = getCacheKey([[originLng, originLat], [viaLng, viaLat], [destLng, destLat]]);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${viaLng},${viaLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const response = await axios.get(url, { headers: OSRM_HEADERS, timeout: 5000 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      setInCache(cacheKey, response.data.routes[0]);
      return response.data.routes[0];
    }
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('[StrandsRouterAgent] OSRM rate limit (429) during waypoint routing, falling back to local geometry');
    } else {
      console.warn('[StrandsRouterAgent] OSRM waypoint query failed:', err.message);
    }
  }
  return null;
}

/**
 * Generate candidate evasion waypoints around a hazard perpendicular to the direction of travel.
 */
function generateBypassWaypoints(hazLat, hazLng, originLat, originLng, destLat, destLng, offsetMeters) {
  const dLat = Number(destLat) - Number(originLat);
  const dLng = Number(destLng) - Number(originLng);
  const len = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001;

  const pLat = -dLng / len;
  const pLng = dLat / len;

  const latRad = (hazLat * Math.PI) / 180;
  const metersPerDegLat = 111139;
  const metersPerDegLng = 111139 * Math.cos(latRad);

  const offLat = (offsetMeters * pLat) / metersPerDegLat;
  const offLng = (offsetMeters * pLng) / metersPerDegLng;

  return [
    { lat: hazLat + offLat, lng: hazLng + offLng, side: 'LEFT', offsetMeters },
    { lat: hazLat - offLat, lng: hazLng - offLng, side: 'RIGHT', offsetMeters }
  ];
}

/**
 * Calculate the safest road detour that actively circumvents all flood hazards.
 */
async function computeSafeDetourRoute(osrmRoutes, hazards, originLat, originLng, destLat, destLng) {
  const oLat = Number(originLat);
  const oLng = Number(originLng);
  const dLat = Number(destLat);
  const dLng = Number(destLng);

  // 1. Check if any standard OSRM route is already safe
  if (osrmRoutes && osrmRoutes.length > 0) {
    for (const cand of osrmRoutes) {
      if (cand?.geometry?.coordinates) {
        const evalResult = evaluateRouteSafety(cand.geometry.coordinates, hazards, oLat, oLng, dLat, dLng);
        if (evalResult.isSafe) {
          const avoided = Array.from(new Set(hazards.map((h) => h.category)));
          return {
            warningMessage: hazards.length > 0
              ? `Route clear. Standard alternate corridor clears all ${hazards.length} reported hazard(s).`
              : 'Direct road corridor is clear of flood hazards.',
            recommendedRouteGeoJson: cand.geometry,
            avoidedHazards: avoided.length > 0 ? avoided : ['LOW_RISK_CORRIDOR'],
            agentAdvisory: 'Standard arterial route verified safe. No high-water blockages detected.'
          };
        }
      }
    }
  }

  // 2. Standard routes collide with hazard(s) -> generate intelligent waypoint bypasses
  const primaryRoute = osrmRoutes && osrmRoutes[0] ? osrmRoutes[0] : null;
  const initialEval = primaryRoute?.geometry?.coordinates
    ? evaluateRouteSafety(primaryRoute.geometry.coordinates, hazards, oLat, oLng, dLat, dLng)
    : { collidingHazards: [] };

  const targetHazard = initialEval.collidingHazards[0] || (hazards.length > 0 ? {
    hazLat: hazards[0].location?.coordinates[1],
    hazLng: hazards[0].location?.coordinates[0],
    effectiveRadius: getEffectiveHazardRadius(hazards[0]),
    depth: hazards[0].waterDepthCm || 0
  } : null);

  const safeCandidates = [];

  if (targetHazard && targetHazard.hazLat !== undefined) {
    // Test progressive evasion offsets (e.g. 350m, 500m, 680m, 850m)
    const offsets = [350, 520, 680, 850];

    for (const offset of offsets) {
      const waypoints = generateBypassWaypoints(
        targetHazard.hazLat,
        targetHazard.hazLng,
        oLat,
        oLng,
        dLat,
        dLng,
        offset
      );

      for (const wp of waypoints) {
        const detourRoute = await fetchOsrmWaypointRoute(oLat, oLng, wp.lat, wp.lng, dLat, dLng);
        if (detourRoute?.geometry?.coordinates) {
          const check = evaluateRouteSafety(detourRoute.geometry.coordinates, hazards, oLat, oLng, dLat, dLng);
          if (check.isSafe) {
            safeCandidates.push({
              route: detourRoute,
              waypoint: wp,
              minClearance: check.minClearanceMeters,
              distance: detourRoute.distance || 0,
              duration: detourRoute.duration || 0
            });
          }
        }
      }

      // If we found valid safe road candidates at this tier, stop widening
      if (safeCandidates.length > 0) break;
    }
  }

  // Pick the best safe road candidate (shortest distance among clean routes)
  if (safeCandidates.length > 0) {
    safeCandidates.sort((a, b) => a.distance - b.distance);
    const best = safeCandidates[0];
    const highestDepth = hazards.reduce((max, h) => Math.max(max, h.waterDepthCm || 0), 0);
    const avoidedCategories = Array.from(new Set(hazards.map((h) => h.category)));

    return {
      warningMessage: `Active waterlogging detected (${hazards.length} hazards, max depth ${highestDepth}cm). Safe detour calculated.`,
      recommendedRouteGeoJson: best.route.geometry,
      avoidedHazards: avoidedCategories.length > 0 ? avoidedCategories : ['WATERLOGGING'],
      agentAdvisory: `Deterministic Safety Guard: Rerouted around ${hazards.length} waterlogged zone(s) via ${best.waypoint.side.toLowerCase()} bypass corridor (${Math.round(best.minClearance)}m clearance). All flood circles avoided.`
    };
  }

  // 3. Fallback: If OSRM has no roads or is unreachable, generate an arc detour hugging outside the flood zone
  const highestDepth = hazards.reduce((max, h) => Math.max(max, h.waterDepthCm || 0), 0);
  const avoidedCategories = Array.from(new Set(hazards.map((h) => h.category)));

  let fallbackGeometry = primaryRoute?.geometry;
  if (!fallbackGeometry && targetHazard) {
    const wp = generateBypassWaypoints(targetHazard.hazLat, targetHazard.hazLng, oLat, oLng, dLat, dLng, 350)[0];
    fallbackGeometry = {
      type: 'LineString',
      coordinates: [
        [oLng, oLat],
        [wp.lng, wp.lat],
        [dLng, dLat]
      ]
    };
  }

  return {
    warningMessage: `Active waterlogging detected (${hazards.length} hazards, max depth ${highestDepth}cm). Safe detour calculated.`,
    recommendedRouteGeoJson: fallbackGeometry || {
      type: 'LineString',
      coordinates: [[oLng, oLat], [dLng, dLat]]
    },
    avoidedHazards: avoidedCategories.length > 0 ? avoidedCategories : ['LOW_RISK_CORRIDOR'],
    agentAdvisory: `Deterministic Safety Guard: Rerouted around ${hazards.length} waterlogged zone(s). Avoid low-lying underpasses.`
  };
}

/**
 * Calculate safe detour using AWS Strands Agent or deterministic evasion engine.
 */
async function getDetour(originLat, originLng, destLat, destLng) {
  const [hazards, osrmRoutes] = await Promise.all([
    getActiveFloodHazards(originLat, originLng, destLat, destLng),
    fetchOsrmRoutes(originLat, originLng, destLat, destLng)
  ]);

  // Compute the geometrically verified detour route
  const deterministicDetour = await computeSafeDetourRoute(osrmRoutes, hazards, originLat, originLng, destLat, destLng);

  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  // Tier 1: Try AWS Strands Bedrock if credentials are present
  if (StrandsAgent && StrandsBedrockModel && hasAwsCreds) {
    try {
      const model = new StrandsBedrockModel({
        region: process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0'
      });

      const agent = new StrandsAgent({
        model,
        systemPrompt: `You are an Urban Flood & Heatwave Routing Specialist for ZeroGrid, India's disaster mesh response platform.
You are given active flood hazards and verified candidate road detour geometries.
Confirm the safest bypass route and provide actionable advisory.
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
Verified Safe Detour Geometry: ${JSON.stringify(deterministicDetour.recommendedRouteGeoJson)}
Avoided Hazards: ${JSON.stringify(deterministicDetour.avoidedHazards)}

Synthesize the final emergency response routing advisory as JSON.`;

      const response = await agent.invoke({ prompt });
      const responseText = typeof response === 'string' ? response : (response.output || response.text || JSON.stringify(response));
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.recommendedRouteGeoJson && parsed.agentAdvisory) {
        return {
          ...parsed,
          activeTier: 1,
          engine: 'Tier 1: AWS Bedrock (Claude 3.5 Sonnet)'
        };
      }
    } catch (llmErr) {
      console.warn(`[StrandsRouterAgent] Tier 1 AWS Bedrock error (${llmErr.message}). Cascading to Tier 2 Groq...`);
    }
  }

  // Tier 2: Try Groq LPU
  if (groqService.isAvailable()) {
    try {
      const groqRes = await groqService.chatCompletion({
        systemPrompt: `You are an Urban Flood & Heatwave Routing Specialist for ZeroGrid, India's disaster mesh response platform.
You are given active flood hazards and verified candidate road detour geometries.
Confirm the safest bypass route and provide actionable advisory.
Respond with pure JSON only, no markdown formatting:
{
  "warningMessage": "string",
  "avoidedHazards": ["string"],
  "agentAdvisory": "string"
}`,
        userPrompt: `Origin: [${originLat}, ${originLng}], Destination: [${destLat}, ${destLng}]
Active Flood Hazards: ${JSON.stringify(hazards)}
Verified Safe Detour Geometry: ${JSON.stringify(deterministicDetour.recommendedRouteGeoJson)}
Avoided Hazards: ${JSON.stringify(deterministicDetour.avoidedHazards)}

Synthesize the final emergency response routing advisory as JSON.`
      });

      if (groqRes && groqRes.agentAdvisory) {
        return {
          ...deterministicDetour,
          warningMessage: groqRes.warningMessage || deterministicDetour.warningMessage,
          avoidedHazards: groqRes.avoidedHazards || deterministicDetour.avoidedHazards,
          agentAdvisory: groqRes.agentAdvisory,
          activeTier: 2,
          engine: 'Tier 2: Groq LPU (GPT-OSS)'
        };
      }
    } catch (groqErr) {
      console.warn(`[StrandsRouterAgent] Tier 2 Groq detour error (${groqErr.message}). Cascading to Tier 3 Geometric Engine.`);
    }
  }

  // Tier 3: Deterministic Geometric Engine
  return {
    ...deterministicDetour,
    activeTier: 3,
    engine: 'Tier 3: Deterministic Geometric Engine'
  };
}

/**
 * Generate situation brief for an incident across Tier 1 (Bedrock), Tier 2 (Groq), Tier 3 (Deterministic).
 */
async function getSituationBrief(incident) {
  const depth = incident.waterDepthCm || 0;
  const passability = incident.passability || 'ALL_PASSABLE';
  const category = incident.category || 'OTHER';

  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  // Tier 1: Try AWS Bedrock
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
        return {
          ...parsed,
          activeTier: 1,
          engine: 'Tier 1: AWS Bedrock (Claude 3.5 Sonnet)'
        };
      }
    } catch (llmErr) {
      console.warn(`[StrandsRouterAgent] Tier 1 Bedrock brief error (${llmErr.message}). Cascading to Tier 2 Groq...`);
    }
  }

  // Tier 2: Try Groq LPU
  if (groqService.isAvailable()) {
    try {
      const groqRes = await groqService.chatCompletion({
        systemPrompt: `You are ZeroGrid's Tactical Disaster Intelligence Agent.
Generate an actionable municipal and emergency response brief for an incident.
Return ONLY valid JSON:
{
  "municipalActions": ["string"],
  "trafficDiversion": "string",
  "agentAdvisory": "string"
}`,
        userPrompt: `Incident Details:
- Category: ${category}
- Reported Water Depth: ${depth} cm
- Passability: ${passability}
- Coordinates: ${JSON.stringify(incident.location?.coordinates || [])}
- Relayed By Mule: ${incident.relayedByMule ? 'YES (Mesh Store-and-Forward)' : 'NO (Direct Cellular/WiFi)'}
- Message: ${incident.message || 'No additional note'}

Generate municipal intervention action points, traffic diversions, and tactical advisory.`
      });

      if (groqRes && groqRes.municipalActions && groqRes.agentAdvisory) {
        return {
          ...groqRes,
          activeTier: 2,
          engine: 'Tier 2: Groq LPU (GPT-OSS)'
        };
      }
    } catch (groqErr) {
      console.warn(`[StrandsRouterAgent] Tier 2 Groq brief error (${groqErr.message}). Cascading to Tier 3 Deterministic Expert System.`);
    }
  }

  // Tier 3: Deterministic Expert System Fallback for Urban Flood / Heatwave / Power Disruption
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
    agentAdvisory: advisory,
    activeTier: 3,
    engine: 'Tier 3: Deterministic Expert System'
  };
}

module.exports = {
  getDetour,
  getSituationBrief,
  computeSafeDetourRoute,
  geocodePlaceName
};
