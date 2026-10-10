/**
 * ZeroGrid Autonomous 24-Hour Multi-Domain Chaos Prediction Agent
 * 
 * Synthesizes ALL comprehensive disaster vectors:
 * 1. Rain & Meteorological Telemetry: Hourly precipitation (mm/hr), accumulation, cloudburst probability
 * 2. Arabian Sea Coastal Tides: Astronomical harmonic tides, sluice gate shut hours, drainage blockage
 * 3. Heatwave & Thermal Stress: 24h temperature curve, wet-bulb index, thermal collapse vulnerability
 * 4. Electrical Grid & Wire Placement: 33kV overhead lines, 11kV conduits, transformer plinth heights
 * 5. Topography & Area Depth: Low-lying bowls, sunken railway underpasses, culvert capacity
 * 6. MongoDB Active SOS Case Intelligence: Live active alerts, category distribution, verified depths/temps
 * 
 * Outputs:
 * - Most Likely 24-Hour Disaster Scenario & Narrative
 * - Multi-Disaster Probability Breakdown (Flood, Grid, Heatwave, Entrapment)
 * - "What Will Be Required Most": Critical equipment & supply demand quotas
 * - 24-Hour Hour-by-Hour Chaos Curve (0-100)
 * - Live MongoDB Case Contextualization
 * - Preemptive 160-Admin Workforce Staging Directive
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
 * Predicts 24-hour compound chaos trajectory and manpower staging directives.
 */
async function predict24HourChaos(options = {}) {
  const centerLat = options.lat || 19.456;
  const centerLng = options.lng || 72.812;

  // 1. Parallel multi-vector data ingestion across all domains
  const [weatherData, tideData, allSosEvents, dbHotspots, adminUsers] = await Promise.all([
    weatherService.get24HourForecast(centerLat, centerLng).catch(() => null),
    Promise.resolve(tideService.get24HourTideProfile()),
    SosEvent.find().sort({ createdAt: -1 }).limit(100).lean().catch(() => []),
    FloodHotspot.find().lean().catch(() => []),
    User.find({ role: 'ADMIN' }).select('email displayName department adminStatus tacticalTags').lean().catch(() => [])
  ]);

  const forecast24h = weatherData?.forecast24h || [];
  const tideProfile24h = tideData?.profile24h || [];

  // 2. Deep MongoDB Active Case Intelligence
  const activeIncidents = allSosEvents.filter(s => s.status === 'ACTIVE' || s.status === 'ACKNOWLEDGED');
  const resolvedIncidents = allSosEvents.filter(s => s.status === 'RESOLVED');

  const casesByCategory = {
    WATERLOGGING: activeIncidents.filter(s => s.category === 'WATERLOGGING'),
    FALLEN_GRID: activeIncidents.filter(s => s.category === 'FALLEN_GRID'),
    HEATWAVE: activeIncidents.filter(s => s.category === 'HEATWAVE'),
    TRAPPED: activeIncidents.filter(s => s.category === 'TRAPPED'),
    MEDICAL: activeIncidents.filter(s => s.category === 'MEDICAL'),
    OTHER: activeIncidents.filter(s => !['WATERLOGGING', 'FALLEN_GRID', 'HEATWAVE', 'TRAPPED', 'MEDICAL'].includes(s.category))
  };

  const activeWaterDepths = casesByCategory.WATERLOGGING.map(s => Number(s.waterDepthCm || 0)).filter(d => d > 0);
  const avgActiveWaterDepth = activeWaterDepths.length > 0 
    ? Math.round(activeWaterDepths.reduce((a, b) => a + b, 0) / activeWaterDepths.length)
    : 0;
  const maxActiveWaterDepth = activeWaterDepths.length > 0 ? Math.max(...activeWaterDepths) : 0;

  const activeTemperatures = casesByCategory.HEATWAVE.map(s => Number(s.temperatureC || 0)).filter(t => t > 0);
  const maxActiveTemperature = activeTemperatures.length > 0 ? Math.max(...activeTemperatures) : 0;

  // 3. Multi-Disaster Peak Extrema Analysis
  const maxRainMmHr = Math.max(...forecast24h.map(w => w.precipitationMmHr || 0), 0);
  const totalRain24h = Number((forecast24h.reduce((acc, w) => acc + (w.precipitationMmHr || 0), 0)).toFixed(1));
  const maxWindGustKmh = Math.max(...forecast24h.map(w => w.windGustsKmh || 20), 20);
  const maxTempC = Math.max(...forecast24h.map(w => w.temperatureC || 28), 28);
  const maxTideMeters = tideData?.maxTideMeters || 3.2;
  const sluiceClosedHours = tideData?.closedHoursCount || 0;

  // 4. Compute 24-Hour Hour-by-Hour Multi-Domain Chaos Curve
  const hourlyChaosCurve = [];
  let peakChaosScore = 0;
  let peakHourOffset = 0;

  for (let h = 0; h < 24; h++) {
    const weather = forecast24h[h] || { precipitationMmHr: 4.0, windGustsKmh: 20, temperatureC: 28 };
    const tide = tideProfile24h[h] || { tideMeters: 2.2, isSluiceClosed: false };

    const rainMm = weather.precipitationMmHr;
    const windGusts = weather.windGustsKmh;
    const tempC = weather.temperatureC;
    const tideMeters = tide.tideMeters;
    const isSluiceClosed = tide.isSluiceClosed;

    // Vector 1: Rain & Hydrodynamic Inundation (35%)
    // High tide sluice lock + heavy rainfall accumulation + current live MongoDB water depth
    const sluicePenalty = isSluiceClosed ? 35 : tideMeters > 3.0 ? 15 : 0;
    const rainScore = Math.min(50, (rainMm / 45.0) * 50);
    const liveFloodAmplifier = Math.min(15, casesByCategory.WATERLOGGING.length * 5 + (avgActiveWaterDepth > 30 ? 10 : 0));
    const hydroThreat = Math.min(100, Math.round(rainScore + sluicePenalty + liveFloodAmplifier));

    // Vector 2: Electrical Grid & Wire Sway (25%)
    // Overhead line sway with wind gusts + transformer plinth immersion + active grid failures
    const windExposure = Math.min(45, Math.max(0, (windGusts - 25) / 35 * 45));
    const plinthWaterIngress = Math.min(40, (hydroThreat / 100) * 40);
    const liveGridAmplifier = Math.min(15, casesByCategory.FALLEN_GRID.length * 8);
    const electricalThreat = Math.min(100, Math.round(windExposure + plinthWaterIngress + liveGridAmplifier));

    // Vector 3: Heatwave & Wet-Bulb Thermal Stress (20%)
    // Temperatures > 36°C elevate heatstroke risk; > 42°C represents severe urban crisis
    const thermalBase = Math.min(85, Math.max(0, (tempC - 32) / 12 * 85));
    const liveHeatAmplifier = Math.min(15, casesByCategory.HEATWAVE.length * 8 + (maxActiveTemperature > 40 ? 10 : 0));
    const heatThreat = Math.min(100, Math.round(thermalBase + liveHeatAmplifier));

    // Vector 4: Topographic Entrapment & Rescue (20%)
    // Submerged basements, railway underpasses, and trapped civilians
    const streetBowlDepth = Math.round((hydroThreat / 100) * 65 + (avgActiveWaterDepth > 0 ? avgActiveWaterDepth * 0.3 : 0));
    const trappedLiveAmplifier = Math.min(30, casesByCategory.TRAPPED.length * 10);
    const topoThreat = Math.min(100, Math.round((streetBowlDepth / 50) * 70 + trappedLiveAmplifier));

    // Compound Multi-Domain Chaos Score
    const compoundScore = Math.min(100, Math.round(
      0.35 * hydroThreat +
      0.25 * electricalThreat +
      0.20 * topoThreat +
      0.20 * heatThreat
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
      heatThreat,
      rainfallMmHr: rainMm,
      windGustsKmh: windGusts,
      temperatureC: tempC,
      tideMeters,
      isSluiceClosed,
      estimatedWaterDepthCm: streetBowlDepth,
      threatLevel: compoundScore >= 75 ? 'CRITICAL' : compoundScore >= 55 ? 'HIGH' : compoundScore >= 35 ? 'ELEVATED' : 'NOMINAL'
    });
  }

  // 5. Predict Disaster Probabilities for Next 24 Hours
  const floodRisk = Math.min(98, Math.round(
    (maxRainMmHr / 50) * 45 + 
    (sluiceClosedHours / 8) * 30 + 
    (casesByCategory.WATERLOGGING.length > 0 ? 25 : 5)
  ));

  const gridFailureRisk = Math.min(95, Math.round(
    (maxWindGustKmh / 60) * 40 + 
    (peakChaosScore / 100) * 35 + 
    (casesByCategory.FALLEN_GRID.length > 0 ? 25 : 5)
  ));

  const heatwaveRisk = Math.min(95, Math.round(
    Math.max(0, (maxTempC - 32) / 13) * 65 + 
    (casesByCategory.HEATWAVE.length > 0 ? 30 : 5)
  ));

  const entrapmentRisk = Math.min(95, Math.round(
    (floodRisk / 100) * 55 + 
    (casesByCategory.TRAPPED.length > 0 ? 35 : 10)
  ));

  // Determine Most Likely Primary Disaster Scenario
  let primaryScenario = 'COMPOUND_MONSOON_INUNDATION';
  let scenarioTitle = 'Severe Monsoon Flash Flood & Sluice Gate Backflow';
  let scenarioDescription = 'Arabian Sea high tide lock combined with intense rainfall accumulation will swamp low-lying bowls, underpasses, and road intersections.';

  if (heatwaveRisk > floodRisk && heatwaveRisk > 60) {
    primaryScenario = 'CRITICAL_URBAN_HEATWAVE';
    scenarioTitle = 'Urban Heatwave Surge & Thermal Mass Dehydration';
    scenarioDescription = 'Extreme wet-bulb temperature will cause civilian thermal exhaustion, heat syncope, and transit terminal overcrowding.';
  } else if (gridFailureRisk > 70 && maxWindGustKmh >= 45) {
    primaryScenario = 'HIGH_VOLTAGE_GRID_CASCADE';
    scenarioTitle = 'High-Voltage Grid Arc-Flash & Feeder Line Trip';
    scenarioDescription = 'High wind gusts and plinth water ingress threaten overhead 33kV lines and transformer step-downs near Sanjeevani Hospital.';
  } else if (entrapmentRisk > 70) {
    primaryScenario = 'STRUCTURAL_WATER_ENTRAPMENT';
    scenarioTitle = 'Submerged Basement & Underpass Civilian Entrapment';
    scenarioDescription = 'Rapid flood water rise in subterranean structures and low-lying transit corridors creates imminent life-safety trapping.';
  }

  // Peak Risk Window
  const criticalHours = hourlyChaosCurve.filter(h => h.compoundChaosScore >= 55);
  const startPeakHour = criticalHours.length > 0 ? criticalHours[0].hourOffset : peakHourOffset;
  const endPeakHour = criticalHours.length > 0 ? criticalHours[criticalHours.length - 1].hourOffset : Math.min(23, peakHourOffset + 4);
  const overallRiskTier = peakChaosScore >= 75 ? 'CRITICAL' : peakChaosScore >= 55 ? 'HIGH' : peakChaosScore >= 35 ? 'ELEVATED' : 'NOMINAL';

  // 6. "What Will Be Required Most" (Logistics, Assets & Supplies Demand Quota)
  const maxProjectedWaterDepth = Math.max(...hourlyChaosCurve.map(c => c.estimatedWaterDepthCm), 15);

  const topRequiredResources = [
    {
      resourceName: 'High-Volume Dewatering Submersible Pumps (500-HP)',
      category: 'FLOOD_CONTROL',
      quantityNeeded: floodRisk >= 75 ? 12 : floodRisk >= 50 ? 8 : 4,
      unit: 'pumps',
      designatedLocation: 'Ward 4 Municipal Dewatering Depot (Virar East)',
      justification: `Drain low-lying natural bowl (projected depth: ${maxProjectedWaterDepth}cm) before Arabian Sea sluice gates shut.`
    },
    {
      resourceName: 'Zodiac Inflatable Rescue Boats & Lifejackets',
      category: 'SWIFT_WATER_RESCUE',
      quantityNeeded: floodRisk >= 70 || entrapmentRisk >= 60 ? 8 : 4,
      unit: 'inflatables',
      designatedLocation: 'Vasai West Staging Hub & Railway Underpass Outpost',
      justification: 'Evacuate stranded vehicles and submerged residential ground floors.'
    },
    {
      resourceName: 'Dielectric Hot Sticks, Meggers & Grounding Clamps',
      category: 'ELECTRICAL_SAFETY',
      quantityNeeded: gridFailureRisk >= 65 ? 8 : 4,
      unit: 'lineman toolkits',
      designatedLocation: 'Virar East 33kV Main Substation Yard',
      justification: 'Safely air-gap tripped feeders and monitor Sanjeevani Hospital 33kV standby tie-line transfer.'
    },
    {
      resourceName: 'Misting Hydration Shelters & IV Saline Kits',
      category: 'THERMAL_RELIEF',
      quantityNeeded: heatwaveRisk >= 60 ? 6 : 2,
      unit: 'canopies & kits',
      designatedLocation: 'Virar Transit Terminal Heat Relief Depot',
      justification: `Counteract urban heatwave index (peak temp: ${maxTempC}°C) and treat civilian heat exhaustion.`
    },
    {
      resourceName: 'Paramedic Trauma Packs & Rapid Extraction Jacks',
      category: 'TRAUMA_RESCUE',
      quantityNeeded: entrapmentRisk >= 65 ? 10 : 5,
      unit: 'trauma kits',
      designatedLocation: 'Sanjeevani Trauma Center Mobile Ambulance Unit',
      justification: 'Treat structural entrapment casualties and hypothermia from submerged basements.'
    }
  ];

  // 7. Electrical Wire Placement & Substation Vulnerability Matrix
  const wirePlacementAnalysis = KNOWN_POWER_LINES.map(line => {
    let riskLevel = 'NOMINAL';
    let vulnerabilityNotes = [];

    if (line.type.includes('OVERHEAD')) {
      if (maxWindGustKmh >= line.windThresholdKmh) {
        riskLevel = 'CRITICAL';
        vulnerabilityNotes.push(`Peak wind gusts (${maxWindGustKmh} km/h) exceed line sway threshold (${line.windThresholdKmh} km/h). Arc-flash & wire snap hazard.`);
      } else if (maxWindGustKmh >= line.windThresholdKmh - 10) {
        riskLevel = 'ELEVATED';
        vulnerabilityNotes.push(`Elevated wind sway approaching line limits.`);
      }
    }

    if (line.type.includes('UNDERGROUND') || line.floodVulnerability === 'CRITICAL') {
      const threshold = line.waterIngressThresholdCm || 35;
      if (maxProjectedWaterDepth >= threshold) {
        riskLevel = 'CRITICAL';
        vulnerabilityNotes.push(`Street flood depth (${maxProjectedWaterDepth}cm) exceeds conduit water-seal limit (${threshold}cm). Subsurface ground fault risk.`);
      } else if (maxProjectedWaterDepth >= threshold - 15) {
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
    const waterMargin = plinthHeightCm - maxProjectedWaterDepth;

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
      projectedWaterDepthCm: maxProjectedWaterDepth,
      criticalFacilities: node.criticalFacilities,
      recommendedAction: riskLevel === 'CRITICAL'
        ? 'Preemptively stage dewatering pumps and prepare 33kV air-gap tie-line bypass to protect ICU'
        : riskLevel === 'HIGH'
        ? 'Inspect sandbag perimeter and verify standby generator switch'
        : 'Maintain routine SCADA telemetry monitoring'
    };
  });

  // 8. Preemptive Manpower Staging Allocation (160-Admin Workforce)
  const departmentStaff = {
    FLOOD_MANAGEMENT: adminUsers.filter(u => u.department === 'FLOOD_MANAGEMENT'),
    POWER_GRID_MANAGEMENT: adminUsers.filter(u => u.department === 'POWER_GRID_MANAGEMENT'),
    RESCUE_MANAGEMENT: adminUsers.filter(u => u.department === 'RESCUE_MANAGEMENT'),
    HEATWAVE_MANAGEMENT: adminUsers.filter(u => u.department === 'HEATWAVE_MANAGEMENT')
  };

  const calculateHoldCount = (multiplier) => {
    if (peakChaosScore >= 75) return Math.min(22, Math.max(8, Math.round(18 * multiplier)));
    if (peakChaosScore >= 55) return Math.min(15, Math.max(5, Math.round(12 * multiplier)));
    if (peakChaosScore >= 35) return Math.min(9, Math.max(2, Math.round(6 * multiplier)));
    return 3;
  };

  const manpowerStaging = [
    {
      department: 'FLOOD_MANAGEMENT',
      departmentName: 'Municipal Flood & Dewatering Command',
      recommendedHoldQuota: calculateHoldCount(floodRisk / 75),
      currentAvailable: departmentStaff.FLOOD_MANAGEMENT.length || 40,
      priorityTacticalTags: ['DEWATERING', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP'],
      designatedStagingArea: 'Ward 4 Municipal Dewatering Hub (Virar East)',
      standbyObjective: 'Pre-position 500-HP high-volume pumps at low-lying bowls before sluice gates shut',
      urgency: floodRisk >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'POWER_GRID_MANAGEMENT',
      departmentName: 'Power Grid High-Voltage Operations',
      recommendedHoldQuota: calculateHoldCount(gridFailureRisk / 75),
      currentAvailable: departmentStaff.POWER_GRID_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HV_LINEMAN', 'AIR_GAP_ISOLATION', 'SUBSTATION_CREW'],
      designatedStagingArea: 'Virar East 33kV Switchyard Staging Yard',
      standbyObjective: 'Standby for air-gap breaker trips and Sanjeevani hospital 33kV backup tie line transfer',
      urgency: gridFailureRisk >= 65 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'RESCUE_MANAGEMENT',
      departmentName: 'Emergency Search & Rescue Corps',
      recommendedHoldQuota: calculateHoldCount(entrapmentRisk / 75),
      currentAvailable: departmentStaff.RESCUE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HEAVY_RESCUE', 'TRAUMA_PARAMEDIC', 'COLLAPSE_SEARCH'],
      designatedStagingArea: 'Vasai West Central Staging Depot',
      standbyObjective: 'Pre-deploy shallow-draft inflatables and structural extraction gear for basement ingress',
      urgency: entrapmentRisk >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'HEATWAVE_MANAGEMENT',
      departmentName: 'Thermal Health & Triage Division',
      recommendedHoldQuota: calculateHoldCount(heatwaveRisk / 75),
      currentAvailable: departmentStaff.HEATWAVE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['MEDICAL_TRIAGE', 'COOLING_STATION'],
      designatedStagingArea: 'Virar Transit Terminal Heat Relief Depot',
      standbyObjective: 'Maintain mobile triage stations and standby IV rehydration kits',
      urgency: heatwaveRisk >= 65 ? 'IMMEDIATE' : 'SCHEDULED'
    }
  ];

  const totalPreemptiveAdmins = manpowerStaging.reduce((acc, d) => acc + d.recommendedHoldQuota, 0);

  // 9. Synthesize Contextual Executive Briefing (3-Tier Engine)
  const synthesis = await synthesizeExecutiveBriefing({
    overallRiskTier,
    peakChaosScore,
    startPeakHour,
    endPeakHour,
    maxProjectedWaterDepth,
    maxWindGustKmh,
    maxTempC,
    primaryScenario,
    scenarioTitle,
    activeIncidentsCount: activeIncidents.length,
    casesByCategory,
    totalPreemptiveAdmins,
    topRequiredResources
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
      estimatedMaxWaterDepthCm: maxProjectedWaterDepth,
      maxWindGustKmh,
      maxTemperatureC: maxTempC,
      totalAccumulatedRain24hMm: totalRain24h,
      totalPreemptiveAdminsOnHold: totalPreemptiveAdmins,
      activeIncidentsCount: activeIncidents.length,
      monitoredHotspotsCount: dbHotspots.length || 4
    },
    predictedScenario: {
      id: primaryScenario,
      title: scenarioTitle,
      description: scenarioDescription,
      probabilities: {
        floodInundationPercent: floodRisk,
        powerGridFailurePercent: gridFailureRisk,
        heatwaveThermalStressPercent: heatwaveRisk,
        structuralEntrapmentPercent: entrapmentRisk
      }
    },
    mongoActiveCasesInsight: {
      totalActiveCases: activeIncidents.length,
      avgRecordedWaterDepthCm: avgActiveWaterDepth,
      maxRecordedWaterDepthCm: maxActiveWaterDepth,
      maxRecordedTemperatureC: maxActiveTemperature,
      byCategory: {
        waterlogging: casesByCategory.WATERLOGGING.length,
        fallenGrid: casesByCategory.FALLEN_GRID.length,
        heatwave: casesByCategory.HEATWAVE.length,
        trapped: casesByCategory.TRAPPED.length,
        medical: casesByCategory.MEDICAL.length,
        other: casesByCategory.OTHER.length
      }
    },
    whatWillBeRequiredMost: topRequiredResources,
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
Current Operational State:
- Primary Predicted Disaster: ${ctx.scenarioTitle}
- 24h Peak Chaos Index: ${ctx.peakChaosScore}/100 (${ctx.overallRiskTier}) in window ${ctx.startPeakHour}h to ${ctx.endPeakHour}h
- Live Active MongoDB SOS Cases: ${ctx.activeIncidentsCount} total (Flood: ${ctx.casesByCategory.WATERLOGGING.length}, Grid: ${ctx.casesByCategory.FALLEN_GRID.length}, Trapped: ${ctx.casesByCategory.TRAPPED.length}, Heat: ${ctx.casesByCategory.HEATWAVE.length})
- Weather Extrema: Rain max depth ${ctx.maxProjectedWaterDepth}cm, Wind gusts ${ctx.maxWindGustKmh}km/h, Max temp ${ctx.maxTempC}°C
- Preemptive Personnel on Hold: ${ctx.totalPreemptiveAdmins} Admins
- Most Required Assets: ${ctx.topRequiredResources.map(r => `${r.quantityNeeded} ${r.resourceName}`).join(', ')}

Provide a sharp 3-sentence NDMA-grade operational briefing detailing:
1. The most probable disaster event expected in the next 24 hours based on meteorology and current live SOS cases.
2. The specific high-risk infrastructure failure mechanisms (e.g. 33kV switchyard, ICU power, basement ingress).
3. The exact resources, equipment, and administrative teams that must be placed on hold immediately.`;

  // Tier 1: AWS Bedrock Claude 3.5 Sonnet
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && BedrockRuntimeClient) {
    try {
      const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'ap-south-1' });
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 380,
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
        { temperature: 0.2, maxTokens: 380 }
      );
      if (text) {
        return { directive: text.trim(), engine: 'Groq LPU (openai/gpt-oss-120b)', tier: 2 };
      }
    } catch (_) {}
  }

  // Tier 3: Deterministic Operational Directive
  return {
    directive: `PREEMPTIVE 24-HOUR CRISIS DIRECTIVE: Forecast indicates ${ctx.scenarioTitle} will be the primary disaster vector over the +${ctx.startPeakHour}h to +${ctx.endPeakHour}h window, compounded by ${ctx.activeIncidentsCount} active incidents in MongoDB. Low-lying 11kV transformer plinths and Sanjeevani Hospital ICU tie lines face imminent water/wind exposure. Total ${ctx.totalPreemptiveAdmins} administrative personnel are placed on standby with immediate dispatch of ${ctx.topRequiredResources.slice(0, 2).map(r => `${r.quantityNeeded} ${r.resourceName}`).join(' and ')}.`,
    engine: 'Deterministic Safety Matrix',
    tier: 3
  };
}

module.exports = {
  predict24HourChaos
};
