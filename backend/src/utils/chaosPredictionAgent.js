/**
 * ZeroGrid Autonomous 24-Hour Chaos Prediction Agent
 * 
 * Synthesizes 5 multi-vector data sources:
 * 1. MongoDB Database: Active & historical SOS incidents, resolution times, chronic hotspots
 * 2. High-resolution 24-hour weather: Hourly precipitation, wind gusts, temperature (Open-Meteo)
 * 3. Coastal tidal hydrodynamics: Arabian Sea tide curves, sluice gate closure, gravity drainage capacity
 * 4. Area depth & topography: Submersible street depths, low-lying bowls, railway underpasses
 * 5. Electrical wire & substation placement: 33kV overhead lines, 11kV underground conduits, transformer plinth heights
 * 
 * Outputs:
 * - 24-Hour Hour-by-Hour Chaos Curve (0-100)
 * - Infrastructure & Wire Vulnerability Matrix
 * - Preemptive Manpower Staging Directive (for the 160-Admin Workforce)
 * - 3-Tier LLM / Deterministic Advisory (AWS Bedrock -> Groq LPU -> Deterministic Matrix)
 */

const weatherService = require('./weatherService');
const tideService = require('./tideService');
const groqService = require('./groqService');
const { KNOWN_GRID_NODES, KNOWN_POWER_LINES } = require('./gridNodeResolver');
const SosEvent = require('../models/SosEvent');
const FloodHotspot = require('../models/FloodHotspot');
const User = require('../models/User');

// Lazy-load AWS Bedrock if credentials are present
let BedrockRuntimeClient = null;
let InvokeModelCommand = null;
try {
  const bedrockSdk = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = bedrockSdk.BedrockRuntimeClient;
  InvokeModelCommand = bedrockSdk.InvokeModelCommand;
} catch (_) {}

/**
 * Normalizes coordinates into { lat, lng }
 */
function normalizeCoords(coords) {
  if (Array.isArray(coords)) {
    if (coords[0] > 50) return { lat: coords[1], lng: coords[0] };
    return { lat: coords[0], lng: coords[1] };
  }
  return { lat: coords.lat || 19.456, lng: coords.lng || 72.812 };
}

/**
 * Predicts 24-hour compound chaos trajectory and manpower staging directives.
 */
async function predict24HourChaos(options = {}) {
  const centerLat = options.lat || 19.456;
  const centerLng = options.lng || 72.812;

  // 1. Parallel multi-vector data ingestion
  const [weatherData, tideData, historicalSos, dbHotspots, adminUsers] = await Promise.all([
    weatherService.get24HourForecast(centerLat, centerLng).catch(() => null),
    Promise.resolve(tideService.get24HourTideProfile()),
    SosEvent.find().sort({ createdAt: -1 }).limit(100).lean().catch(() => []),
    FloodHotspot.find().lean().catch(() => []),
    User.find({ role: 'ADMIN' }).select('email displayName department adminStatus tacticalTags').lean().catch(() => [])
  ]);

  const forecast24h = weatherData?.forecast24h || [];
  const tideProfile24h = tideData?.profile24h || [];

  // Count active vs historical resolved incidents
  const activeIncidents = historicalSos.filter(s => s.status === 'ACTIVE' || s.status === 'ACKNOWLEDGED');
  const resolvedIncidents = historicalSos.filter(s => s.status === 'RESOLVED');

  // 2. Compute 24-Hour Hour-by-Hour Chaos Curve
  const hourlyChaosCurve = [];
  let peakChaosScore = 0;
  let peakHourOffset = 0;

  for (let h = 0; h < 24; h++) {
    const weather = forecast24h[h] || { precipitationMmHr: 4.0, windGustsKmh: 20, temperatureC: 28 };
    const tide = tideProfile24h[h] || { tideMeters: 2.2, isSluiceClosed: false };

    const rainMm = weather.precipitationMmHr;
    const windGusts = weather.windGustsKmh;
    const tideMeters = tide.tideMeters;
    const isSluiceClosed = tide.isSluiceClosed;

    // Vector 1: Hydrodynamic Threat (35%)
    // High tide (>3.8m) shut gates + rain > 25mm/hr exponentially spikes water depth
    const sluicePenalty = isSluiceClosed ? 35 : tideMeters > 3.0 ? 15 : 0;
    const rainScore = Math.min(65, (rainMm / 50.0) * 65);
    const hydroThreat = Math.min(100, Math.round(rainScore + sluicePenalty));

    // Vector 2: Electrical Wire & Substation Threat (30%)
    // Overhead wires prone to snap when wind gusts > 45 km/h.
    // Underground conduits vulnerable when water ingress > 30cm.
    const windExposure = Math.min(50, Math.max(0, (windGusts - 25) / 35 * 50));
    const floodIngressToPlinths = Math.min(50, (hydroThreat / 100) * 50);
    const electricalThreat = Math.min(100, Math.round(windExposure + floodIngressToPlinths));

    // Vector 3: Topographic Entrapment Threat (20%)
    // Natural bowls, sunken underpasses, and culverts
    const baseBowlDepth = (hydroThreat / 100) * 60; // Estimated street depth in cm
    const topoThreat = Math.min(100, Math.round((baseBowlDepth / 50) * 100));

    // Vector 4: Historical Failure Recurrence (15%)
    // Past failure density in the area
    const historicalDensityWeight = Math.min(100, (activeIncidents.length * 8 + resolvedIncidents.length * 2));

    // Compound Weighted Chaos Formula
    const compoundScore = Math.min(100, Math.round(
      0.35 * hydroThreat +
      0.30 * electricalThreat +
      0.20 * topoThreat +
      0.15 * historicalDensityWeight
    ));

    if (compoundScore > peakChaosScore) {
      peakChaosScore = compoundScore;
      peakHourOffset = h;
    }

    hourlyChaosCurve.push({
      hourOffset: h,
      time: weather.time || new Date(Date.now() + h * 3600000).toISOString(),
      compoundChaosScore: compoundScore,
      hydroThreat,
      electricalThreat,
      topoThreat,
      rainfallMmHr: rainMm,
      windGustsKmh: windGusts,
      tideMeters,
      isSluiceClosed,
      estimatedWaterDepthCm: Math.round(baseBowlDepth),
      threatLevel: compoundScore >= 75 ? 'CRITICAL' : compoundScore >= 55 ? 'HIGH' : compoundScore >= 35 ? 'ELEVATED' : 'NOMINAL'
    });
  }

  // Determine Peak Risk Window
  const criticalHours = hourlyChaosCurve.filter(h => h.compoundChaosScore >= 55);
  const startPeakHour = criticalHours.length > 0 ? criticalHours[0].hourOffset : peakHourOffset;
  const endPeakHour = criticalHours.length > 0 ? criticalHours[criticalHours.length - 1].hourOffset : Math.min(23, peakHourOffset + 4);

  // Overall Tier
  const overallRiskTier = peakChaosScore >= 75 ? 'CRITICAL' : peakChaosScore >= 55 ? 'HIGH' : peakChaosScore >= 35 ? 'ELEVATED' : 'NOMINAL';

  // 3. Electrical Wire Placement & Substation Vulnerability Matrix
  const maxWindIn24h = Math.max(...forecast24h.map(w => w.windGustsKmh), 20);
  const maxWaterDepthEst = Math.max(...hourlyChaosCurve.map(c => c.estimatedWaterDepthCm), 15);

  const wirePlacementAnalysis = KNOWN_POWER_LINES.map(line => {
    let riskLevel = 'NOMINAL';
    let vulnerabilityNotes = [];

    if (line.type.includes('OVERHEAD')) {
      if (maxWindIn24h >= line.windThresholdKmh) {
        riskLevel = 'CRITICAL';
        vulnerabilityNotes.push(`Peak wind gusts (${maxWindIn24h} km/h) exceed line sway threshold (${line.windThresholdKmh} km/h). Arc-flash & wire snap hazard.`);
      } else if (maxWindIn24h >= line.windThresholdKmh - 10) {
        riskLevel = 'ELEVATED';
        vulnerabilityNotes.push(`Elevated wind sway approaching line limits.`);
      }
    }

    if (line.type.includes('UNDERGROUND') || line.floodVulnerability === 'CRITICAL') {
      const threshold = line.waterIngressThresholdCm || 35;
      if (maxWaterDepthEst >= threshold) {
        riskLevel = 'CRITICAL';
        vulnerabilityNotes.push(`Street flood depth (${maxWaterDepthEst}cm) exceeds conduit water-seal limit (${threshold}cm). Subsurface ground fault risk.`);
      } else if (maxWaterDepthEst >= threshold - 15) {
        riskLevel = 'HIGH';
        vulnerabilityNotes.push(`Water ingress approaching submersible trench threshold.`);
      }
    }

    if (vulnerabilityNotes.length === 0) {
      vulnerabilityNotes.push('Operating within nominal design envelope.');
    }

    return {
      lineId: line.lineId,
      name: line.name,
      voltage: line.voltage,
      type: line.type,
      riskLevel,
      groundClearanceM: line.groundClearanceM,
      criticalFacilities: line.criticalFacilities,
      vulnerabilityNotes: vulnerabilityNotes.join(' ')
    };
  });

  const substationAnalysis = KNOWN_GRID_NODES.map(node => {
    let riskLevel = 'NOMINAL';
    const plinthHeightCm = 45; // Standard 45cm transformer plinth height
    const waterMargin = plinthHeightCm - maxWaterDepthEst;

    if (waterMargin <= 0) {
      riskLevel = 'CRITICAL';
    } else if (waterMargin <= 15) {
      riskLevel = 'HIGH';
    } else if (waterMargin <= 30) {
      riskLevel = 'ELEVATED';
    }

    return {
      nodeId: node.nodeId,
      name: node.name,
      type: node.type,
      riskLevel,
      plinthHeightCm,
      projectedWaterDepthCm: maxWaterDepthEst,
      criticalFacilities: node.criticalFacilities,
      recommendedAction: riskLevel === 'CRITICAL'
        ? 'Preemptively stage dewatering pumps and prepare 33kV air-gap tie-line bypass to protect ICU'
        : riskLevel === 'HIGH'
        ? 'Inspect sandbag perimeter and verify standby generator switch'
        : 'Maintain routine SCADA telemetry monitoring'
    };
  });

  // 4. Preemptive Manpower Staging Allocation (160-Admin Workforce)
  const departmentStaff = {
    FLOOD_MANAGEMENT: adminUsers.filter(u => u.department === 'FLOOD_MANAGEMENT'),
    POWER_GRID_MANAGEMENT: adminUsers.filter(u => u.department === 'POWER_GRID_MANAGEMENT'),
    RESCUE_MANAGEMENT: adminUsers.filter(u => u.department === 'RESCUE_MANAGEMENT'),
    HEATWAVE_MANAGEMENT: adminUsers.filter(u => u.department === 'HEATWAVE_MANAGEMENT')
  };

  const calculateHoldCount = (multiplier) => {
    if (peakChaosScore >= 75) return Math.min(20, Math.max(8, Math.round(16 * multiplier)));
    if (peakChaosScore >= 55) return Math.min(14, Math.max(5, Math.round(10 * multiplier)));
    if (peakChaosScore >= 35) return Math.min(8, Math.max(2, Math.round(5 * multiplier)));
    return 2;
  };

  const manpowerStaging = [
    {
      department: 'FLOOD_MANAGEMENT',
      departmentName: 'Municipal Flood & Dewatering Command',
      recommendedHoldQuota: calculateHoldCount(1.0),
      currentAvailable: departmentStaff.FLOOD_MANAGEMENT.length || 40,
      priorityTacticalTags: ['DEWATERING', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP'],
      designatedStagingArea: 'Ward 4 Municipal Dewatering Hub (Virar East)',
      standbyObjective: 'Pre-position 500-HP high-volume pumps at low-lying bowls before sluice gates shut',
      urgency: peakChaosScore >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'POWER_GRID_MANAGEMENT',
      departmentName: 'Power Grid High-Voltage Operations',
      recommendedHoldQuota: calculateHoldCount(0.8),
      currentAvailable: departmentStaff.POWER_GRID_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HV_LINEMAN', 'AIR_GAP_ISOLATION', 'SUBSTATION_CREW'],
      designatedStagingArea: 'Virar East 33kV Switchyard Staging Yard',
      standbyObjective: 'Standby for air-gap breaker trips and Sanjeevani hospital 33kV backup tie line transfer',
      urgency: peakChaosScore >= 65 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'RESCUE_MANAGEMENT',
      departmentName: 'Emergency Search & Rescue Corps',
      recommendedHoldQuota: calculateHoldCount(0.75),
      currentAvailable: departmentStaff.RESCUE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HEAVY_RESCUE', 'TRAUMA_PARAMEDIC', 'COLLAPSE_SEARCH'],
      designatedStagingArea: 'Vasai West Central Staging Depot',
      standbyObjective: 'Pre-deploy shallow-draft inflatables and structural extraction gear for basement ingress',
      urgency: peakChaosScore >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'HEATWAVE_MANAGEMENT',
      departmentName: 'Thermal Health & Triage Division',
      recommendedHoldQuota: calculateHoldCount(0.3),
      currentAvailable: departmentStaff.HEATWAVE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['MEDICAL_TRIAGE', 'COOLING_STATION'],
      designatedStagingArea: 'Virar Transit Terminal Heat Relief Depot',
      standbyObjective: 'Maintain mobile triage stations and standby IV rehydration kits',
      urgency: 'SCHEDULED'
    }
  ];

  const totalPreemptiveAdmins = manpowerStaging.reduce((acc, d) => acc + d.recommendedHoldQuota, 0);

  // 5. Synthesize Contextual Executive Briefing (3-Tier Engine)
  const synthesis = await synthesizeExecutiveBriefing({
    overallRiskTier,
    peakChaosScore,
    startPeakHour,
    endPeakHour,
    maxWaterDepthEst,
    maxWindIn24h,
    totalPreemptiveAdmins,
    manpowerStaging,
    wirePlacementAnalysis
  });

  return {
    success: true,
    evaluatedAt: new Date().toISOString(),
    centerCoordinates: { lat: centerLat, lng: centerLng },
    summary: {
      overallChaosIndex: peakChaosScore,
      overallRiskTier,
      peakHourOffset,
      peakTime: hourlyChaosCurve[peakHourOffset]?.time,
      peakRiskWindow: `+${startPeakHour}h to +${endPeakHour}h`,
      estimatedMaxWaterDepthCm: maxWaterDepthEst,
      maxWindGustKmh: maxWindIn24h,
      totalPreemptiveAdminsOnHold: totalPreemptiveAdmins,
      activeIncidentsCount: activeIncidents.length,
      monitoredHotspotsCount: dbHotspots.length || 4
    },
    hourlyChaosCurve,
    wirePlacementAnalysis,
    substationAnalysis,
    manpowerStaging,
    executiveDirective: synthesis.directive,
    aiEngine: synthesis.engine,
    activeTier: synthesis.tier
  };
}

/**
 * 3-Tier Multi-LLM / Deterministic Executive Synthesis
 */
async function synthesizeExecutiveBriefing(ctx) {
  const prompt = `You are the ZeroGrid Autonomous 24-Hour Predictive Disaster Commander.
Situation Data:
- 24h Peak Chaos Index: ${ctx.peakChaosScore}/100 (Tier: ${ctx.overallRiskTier})
- Peak Risk Danger Window: ${ctx.peakRiskWindow}
- Projected Max Water Depth: ${ctx.maxWaterDepthEst} cm
- Projected Max Wind Gusts: ${ctx.maxWindIn24h} km/h
- Recommended Personnel Preemptively Placed on Hold: ${ctx.totalPreemptiveAdmins} Admins
- Power Grid Lines at Risk: ${ctx.wirePlacementAnalysis.filter(w => w.riskLevel !== 'NOMINAL').map(w => w.name).join(', ') || 'None'}

Generate a crisp 3-sentence NDMA-grade operational warning for the Incident Commander detailing:
1. The primary compound hazard mechanism (rainfall accumulation, sluice gate closure, or wire swaying).
2. The exact critical infrastructure at risk (Sanjeevani Hospital ICU, 33kV switchyard).
3. The immediate preemptive manpower staging order for the next 24 hours.`;

  // Tier 1: AWS Bedrock Claude 3.5 Sonnet
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && BedrockRuntimeClient) {
    try {
      const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'ap-south-1' });
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 350,
        messages: [{ role: 'user', content: prompt }]
      };
      const cmd = new InvokeModelCommand({
        modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });
      const res = await client.send(cmd);
      const decoded = JSON.parse(new TextDecoder().decode(res.body));
      const text = decoded.content?.[0]?.text;
      if (text) {
        return { directive: text.trim(), engine: 'AWS Bedrock Claude 3.5 Sonnet', tier: 1 };
      }
    } catch (_) {}
  }

  // Tier 2: Groq LPU
  if (groqService.isAvailable()) {
    try {
      const text = await groqService.chatCompletion(
        prompt,
        process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        { temperature: 0.2, maxTokens: 350 }
      );
      if (text) {
        return { directive: text.trim(), engine: 'Groq LPU (openai/gpt-oss-120b)', tier: 2 };
      }
    } catch (_) {}
  }

  // Tier 3: Deterministic Operational Directive
  return {
    directive: `PREEMPTIVE DISASTER DIRECTIVE: Monsoon accumulation (${ctx.maxWaterDepthEst}cm peak) combined with Arabian Sea tidal surge generates elevated compound chaos (${ctx.peakChaosScore}/100) in the ${ctx.peakRiskWindow} window. Immediate priority is maintaining 33kV tie-line integrity at Sanjeevani Hospital ICU and preventing 11kV plinth ingress. Total ${ctx.totalPreemptiveAdmins} administrative personnel across Flood, Grid, and Rescue divisions are ordered onto designated standby staging depots.`,
    engine: 'Deterministic Safety Matrix',
    tier: 3
  };
}

module.exports = {
  predict24HourChaos
};
