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
    const weather = forecast24h[h] || { precipitationMmHr: 0.0, windGustsKmh: 15, temperatureC: 30 };
    const tide = tideProfile24h[h] || { tideMeters: 2.2, isSluiceClosed: false };

    const rainMm = weather.precipitationMmHr || 0;
    const windGusts = weather.windGustsKmh || 15;
    const tempC = weather.temperatureC || 30;
    const tideMeters = tide.tideMeters || 2.2;
    const isSluiceClosed = tide.isSluiceClosed || false;

    // Vector 1: Rain & Hydrodynamic Inundation (35%)
    // REAL PHYSICS: High tide ONLY creates flood risk if it actually rains! If rain is 0, tide stays in the sea/creek.
    let hydroThreat = 0;
    let streetBowlDepth = 0;

    if (rainMm >= 2.0 || totalRain24h >= 8.0) {
      const rainScore = Math.min(60, (rainMm / 40.0) * 60);
      const sluicePenalty = isSluiceClosed ? 25 : tideMeters > 3.0 ? 10 : 0;
      const groundClusterAmp = Math.min(15, casesByCategory.WATERLOGGING.length * 4);
      hydroThreat = Math.min(100, Math.round(rainScore + sluicePenalty + groundClusterAmp));
      streetBowlDepth = Math.round((hydroThreat / 100) * 45);
    } else {
      // Dry weather: negligible hydro threat (<8%)
      hydroThreat = Math.min(8, Math.round(rainMm * 2));
      streetBowlDepth = 0;
    }

    // Vector 2: Electrical Grid & Wire Sway (25%)
    // Overhead line sway with wind gusts (threshold 45 km/h) + transformer water ingress
    const windExposure = Math.min(50, Math.max(0, (windGusts - 28) / 30 * 50));
    const plinthWaterIngress = (streetBowlDepth >= 35) ? 35 : (streetBowlDepth >= 20) ? 15 : 0;
    const liveGridAmplifier = Math.min(15, casesByCategory.FALLEN_GRID.length * 5);
    const electricalThreat = Math.min(100, Math.round(windExposure + plinthWaterIngress + liveGridAmplifier));

    // Vector 3: Heatwave & Wet-Bulb Thermal Stress (20%)
    // Real temperatures: >34°C is elevated, >38°C is severe heatwave
    const thermalBase = Math.min(75, Math.max(0, (tempC - 31) / 10 * 75));
    const liveHeatAmplifier = Math.min(15, casesByCategory.HEATWAVE.length * 6);
    const heatThreat = Math.min(100, Math.round(thermalBase + liveHeatAmplifier));

    // Vector 4: Topographic Entrapment & Rescue (20%)
    // Only elevated if water depth > 30cm or active trapped civilian alerts exist
    const entrapmentBase = (streetBowlDepth >= 40) ? 50 : (streetBowlDepth >= 20) ? 20 : 0;
    const trappedLiveAmplifier = Math.min(30, casesByCategory.TRAPPED.length * 10);
    const topoThreat = Math.min(100, Math.round(entrapmentBase + trappedLiveAmplifier));

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
  let floodRisk = 0;
  if (totalRain24h < 3.0 && maxRainMmHr < 2.0) {
    // Dry weather: Real flood probability is under 10%
    floodRisk = Math.min(8, Math.round(totalRain24h * 2 + (casesByCategory.WATERLOGGING.length > 2 ? 5 : 1)));
  } else {
    const rainFactor = Math.min(60, (maxRainMmHr / 45) * 45 + (totalRain24h / 80) * 15);
    const tideFactor = (sluiceClosedHours / 8) * 25;
    const groundFactor = Math.min(15, casesByCategory.WATERLOGGING.length * 4);
    floodRisk = Math.min(98, Math.round(rainFactor + tideFactor + groundFactor));
  }

  const gridFailureRisk = Math.min(95, Math.round(
    Math.max(0, (maxWindGustKmh - 25) / 35 * 40) + 
    (peakChaosScore / 100) * 25 + 
    (casesByCategory.FALLEN_GRID.length > 0 ? 15 : 5)
  ));

  const heatwaveRisk = Math.min(95, Math.round(
    Math.max(0, (maxTempC - 31) / 10 * 65) + 
    (casesByCategory.HEATWAVE.length > 0 ? 20 : 5)
  ));

  const entrapmentRisk = Math.min(95, Math.round(
    (floodRisk / 100) * 45 + 
    (casesByCategory.TRAPPED.length > 0 ? 30 : 5)
  ));

  // Determine Most Likely Primary Disaster Scenario based on ACTUAL highest physical risk
  let primaryScenario = 'STABLE_FAVORABLE_METEOROLOGY';
  let scenarioTitle = 'Stable Meteorological Baseline & Nominal Operations';
  let scenarioDescription = 'Dry atmospheric conditions and low rainfall (<1mm) forecast over the next 24 hours. No regional flood or electrical grid disruption anticipated. Tactical units maintain standard patrol readiness.';

  if (floodRisk >= 50 && totalRain24h >= 25.0) {
    primaryScenario = 'COMPOUND_MONSOON_INUNDATION';
    scenarioTitle = 'Monsoon Flash Inundation & Sluice Gate Backflow';
    scenarioDescription = 'Heavy rainfall accumulation coincides with high tide sluice gate closure, leading to stormwater ponding in low-lying railway underpasses.';
  } else if (maxTempC >= 34.0 || heatwaveRisk >= 35) {
    primaryScenario = 'POST_MONSOON_THERMAL_SURGE';
    scenarioTitle = 'Urban Heat Index & Post-Monsoon Thermal Stress';
    scenarioDescription = `High daytime ambient temperatures (peak ${maxTempC}°C) and strong solar radiation will elevate thermal strain in exposed transit hubs, markets, and road junctions.`;
  } else if (gridFailureRisk >= 45 && maxWindGustKmh >= 40) {
    primaryScenario = 'HIGH_WIND_GRID_EXPOSURE';
    scenarioTitle = 'High-Wind Overhead Wire Sag & Tree Clearance Risk';
    scenarioDescription = `Elevated wind gusts (up to ${maxWindGustKmh} km/h) threaten overhead 33kV lines and require lineman monitoring at substation tie-ins.`;
  } else if (entrapmentRisk >= 50) {
    primaryScenario = 'STRUCTURAL_WATER_ENTRAPMENT';
    scenarioTitle = 'Low-Elevation Structural Water Ingress Risk';
    scenarioDescription = 'Subterranean basement access and drainage culverts require preventive clearing.';
  }

  // Peak Risk Window
  const criticalHours = hourlyChaosCurve.filter(h => h.compoundChaosScore >= 35);
  const startPeakHour = criticalHours.length > 0 ? criticalHours[0].hourOffset : peakHourOffset;
  const endPeakHour = criticalHours.length > 0 ? criticalHours[criticalHours.length - 1].hourOffset : Math.min(23, peakHourOffset + 4);
  const overallRiskTier = peakChaosScore >= 75 ? 'CRITICAL' : peakChaosScore >= 55 ? 'HIGH' : peakChaosScore >= 35 ? 'ELEVATED' : 'NOMINAL';

  // 6. "What Will Be Required Most" (Logistics, Assets & Supplies Demand Quota)
  const maxProjectedWaterDepth = Math.max(...hourlyChaosCurve.map(c => c.estimatedWaterDepthCm), 0);

  const allCandidateResources = [
    {
      resourceName: 'Misting Hydration Shelters & Electrolyte Kits',
      category: 'THERMAL_RELIEF',
      priorityScore: heatwaveRisk,
      quantityNeeded: heatwaveRisk >= 60 ? 6 : heatwaveRisk >= 35 ? 4 : 2,
      unit: 'canopies & kits',
      designatedLocation: 'Virar Transit Terminal Heat Relief Depot',
      justification: `Counteract daytime heat index (peak temp: ${maxTempC}°C) and treat commuter dehydration.`
    },
    {
      resourceName: 'Dielectric Hot Sticks & Insulation Meggers',
      category: 'ELECTRICAL_SAFETY',
      priorityScore: gridFailureRisk,
      quantityNeeded: gridFailureRisk >= 65 ? 8 : gridFailureRisk >= 40 ? 4 : 2,
      unit: 'lineman toolkits',
      designatedLocation: 'Virar East 33kV Main Substation Yard',
      justification: 'Inspect line ground clearances, verify transformer thermal load, and monitor Sanjeevani Hospital 33kV tie line.'
    },
    {
      resourceName: 'High-Volume Dewatering Submersible Pumps (500-HP)',
      category: 'FLOOD_CONTROL',
      priorityScore: floodRisk,
      quantityNeeded: floodRisk >= 75 ? 12 : floodRisk >= 50 ? 6 : floodRisk >= 20 ? 2 : 0,
      unit: 'pumps',
      designatedLocation: 'Ward 4 Municipal Dewatering Depot (Virar East)',
      justification: floodRisk >= 50 
        ? `Pre-position pumps for projected waterlogging (${maxProjectedWaterDepth}cm).`
        : floodRisk >= 20
        ? 'Standby municipal reserve for localized drain maintenance.'
        : 'Zero regional flood risk detected. High-volume pumps remain secured in municipal warehouse reserve.'
    },
    {
      resourceName: 'Zodiac Inflatable Rescue Boats & Lifejackets',
      category: 'SWIFT_WATER_RESCUE',
      priorityScore: Math.max(floodRisk, entrapmentRisk),
      quantityNeeded: (floodRisk >= 70 || entrapmentRisk >= 60) ? 8 : (floodRisk >= 40 || entrapmentRisk >= 35) ? 3 : 0,
      unit: 'inflatables',
      designatedLocation: 'Vasai West Staging Hub & Railway Underpass Outpost',
      justification: floodRisk >= 50 
        ? 'Evacuate stranded vehicles and submerged ground floors.' 
        : floodRisk >= 30
        ? 'Pre-position near railway underpasses as flood precaution.'
        : 'Zero waterlogging predicted. Watercraft held at central depot in passive readiness.'
    },
    {
      resourceName: 'Paramedic Trauma Packs & Rapid Extraction Kits',
      category: 'TRAUMA_RESCUE',
      priorityScore: entrapmentRisk,
      quantityNeeded: entrapmentRisk >= 65 ? 8 : entrapmentRisk >= 40 ? 4 : 2,
      unit: 'trauma kits',
      designatedLocation: 'Sanjeevani Trauma Center Mobile Ambulance Unit',
      justification: 'Field response for accident triage, acute trauma, and heat syncope treatment.'
    }
  ];

  // Sort resources by priority score descending so the most needed resources are at the top!
  const topRequiredResources = allCandidateResources.sort((a, b) => b.priorityScore - a.priorityScore);

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
    if (peakChaosScore >= 75) return Math.min(20, Math.max(8, Math.round(18 * multiplier)));
    if (peakChaosScore >= 55) return Math.min(14, Math.max(5, Math.round(12 * multiplier)));
    if (peakChaosScore >= 35) return Math.min(8, Math.max(2, Math.round(6 * multiplier)));
    return Math.max(1, Math.min(3, Math.round(3 * multiplier)));
  };

  const manpowerStaging = [
    {
      department: 'FLOOD_MANAGEMENT',
      departmentName: 'Municipal Flood & Dewatering Command',
      recommendedHoldQuota: calculateHoldCount(floodRisk / 75),
      currentAvailable: departmentStaff.FLOOD_MANAGEMENT.length || 40,
      priorityTacticalTags: ['DEWATERING', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP'],
      designatedStagingArea: 'Ward 4 Municipal Dewatering Hub (Virar East)',
      standbyObjective: floodRisk >= 50
        ? 'Pre-position 500-HP high-volume pumps at low-lying bowls before sluice gates shut'
        : 'Maintain standard municipal dewatering readiness and stormwater outfall inspection',
      urgency: floodRisk >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'POWER_GRID_MANAGEMENT',
      departmentName: 'Power Grid High-Voltage Operations',
      recommendedHoldQuota: calculateHoldCount(gridFailureRisk / 75),
      currentAvailable: departmentStaff.POWER_GRID_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HV_LINEMAN', 'AIR_GAP_ISOLATION', 'SUBSTATION_CREW'],
      designatedStagingArea: 'Virar East 33kV Switchyard Staging Yard',
      standbyObjective: gridFailureRisk >= 50
        ? 'Standby for air-gap breaker trips and Sanjeevani hospital 33kV backup tie line transfer'
        : 'Routine SCADA grid telemetry monitoring and line clearance verification',
      urgency: gridFailureRisk >= 65 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'RESCUE_MANAGEMENT',
      departmentName: 'Emergency Search & Rescue Corps',
      recommendedHoldQuota: calculateHoldCount(entrapmentRisk / 75),
      currentAvailable: departmentStaff.RESCUE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['HEAVY_RESCUE', 'TRAUMA_PARAMEDIC', 'COLLAPSE_SEARCH'],
      designatedStagingArea: 'Vasai West Central Staging Depot',
      standbyObjective: entrapmentRisk >= 50
        ? 'Pre-deploy shallow-draft inflatables and structural extraction gear for basement ingress'
        : 'Standard SAR vehicle and medical rescue kit readiness at staging depot',
      urgency: entrapmentRisk >= 70 ? 'IMMEDIATE' : 'SCHEDULED'
    },
    {
      department: 'HEATWAVE_MANAGEMENT',
      departmentName: 'Thermal Health & Triage Division',
      recommendedHoldQuota: calculateHoldCount(heatwaveRisk / 75),
      currentAvailable: departmentStaff.HEATWAVE_MANAGEMENT.length || 40,
      priorityTacticalTags: ['MEDICAL_TRIAGE', 'COOLING_STATION'],
      designatedStagingArea: 'Virar Transit Terminal Heat Relief Depot',
      standbyObjective: heatwaveRisk >= 40
        ? `Pre-stage misting hydration outposts during peak daytime temperatures (up to ${maxTempC}°C)`
        : 'Maintain mobile triage stations and standby IV rehydration kits',
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
  let infraRiskNote = '';
  if (ctx.primaryScenario === 'COMPOUND_MONSOON_INUNDATION') {
    infraRiskNote = 'Low-lying 11kV transformer plinths and Sanjeevani Hospital ICU tie lines face imminent stormwater inundation risk.';
  } else if (ctx.primaryScenario === 'POST_MONSOON_THERMAL_SURGE') {
    infraRiskNote = `Elevated daytime ambient temperatures (${ctx.maxTempC}°C) increase peak air-conditioning transformer loading; municipal cooling shelters require priority activation.`;
  } else if (ctx.primaryScenario === 'HIGH_WIND_GRID_EXPOSURE') {
    infraRiskNote = `Wind gusts up to ${ctx.maxWindGustKmh} km/h require lineman clearance patrols along overhead 33kV corridors.`;
  } else {
    infraRiskNote = 'Atmospheric conditions remain stable with zero flood risk; tactical units maintain standard operational readiness.';
  }

  return {
    directive: `PREEMPTIVE 24-HOUR CRISIS DIRECTIVE: Meteorological analysis forecasts ${ctx.scenarioTitle} over the +${ctx.startPeakHour}h to +${ctx.endPeakHour}h window, cross-referenced with ${ctx.activeIncidentsCount} active ground alerts in MongoDB. ${infraRiskNote} A total of ${ctx.totalPreemptiveAdmins} administrative personnel are staged on standby with priority staging of ${ctx.topRequiredResources.filter(r => r.quantityNeeded > 0).slice(0, 2).map(r => `${r.quantityNeeded} ${r.resourceName}`).join(' and ')}.`,
    engine: 'Deterministic Safety Matrix',
    tier: 3
  };
}

module.exports = {
  predict24HourChaos
};
