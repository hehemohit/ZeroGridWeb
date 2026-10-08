/**
 * strandsPredictiveAgent.js
 * Autonomous Predictive Crisis Command Agent powered by AWS Strands Agents SDK.
 * 
 * Features:
 * 1. Multi-Tool Agent: Tides, Weather, Historical Chronic Hotspots, Beacon Clustering, Anti-Spam Credibility
 * 2. Deterministic Hydrodynamic Recession Engine (fallback when AWS Bedrock keys are absent)
 * 3. Anti-Spam & Peer Consensus Triage (0-100% confidence scoring)
 * 4. Autonomous Beacon Spatial Clustering & Asset Dispatch Matching
 * 5. NDMA Standard Situation Report (SitRep) Generator
 */

const weatherService = require('./weatherService');
const tideService = require('./tideService');
const FloodHotspot = require('../models/FloodHotspot');
const SosEvent = require('../models/SosEvent');
const Headquarters = require('../models/Headquarters');

// Lazy-load AWS Strands Agents SDK
let StrandsAgent = null;
let StrandsBedrockModel = null;
let strandsTool = null;
let StrandsFunctionTool = null;

try {
  const sdk = require('@strands-agents/sdk');
  StrandsAgent = sdk.Agent;
  StrandsBedrockModel = sdk.BedrockModel;
  strandsTool = sdk.tool;
  StrandsFunctionTool = sdk.FunctionTool;
} catch (err) {
  console.warn('[StrandsPredictiveAgent] @strands-agents/sdk lazy load warning:', err.message);
}

// Haversine distance in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── 1. CORE AGENT TOOLS IMPLEMENTATIONS ────────────────────────────────────

/**
 * Tool 1: checkTideDrainageImpact
 * Calculates sluice gate closure, Arabian Sea backflow pressure, and high tide crest.
 */
async function checkTideDrainageImpact({ lat = 19.4534, lng = 72.8061, waterDepthCm = 50, overrideTideMeters }) {
  const tide = await tideService.getTideConditions(lat, lng, { overrideTideMeters });
  return {
    currentTideMeters: tide.currentTideMeters,
    tidePhase: tide.tidePhase,
    highTideTime: tide.highTidePeakTime,
    highTidePeakMeters: tide.highTidePeakMeters,
    lowTideTime: tide.lowTidePeakTime,
    lowTidePeakMeters: tide.lowTidePeakMeters,
    sluiceStatus: tide.sluiceGateStatus,
    gravityDrainagePossible: tide.gravityDrainagePossible,
    recessionStartTime: tide.expectedDrainageResumeTime,
    warning: tide.warning
  };
}

/**
 * Tool 2: getLiveRainfallPrecipitation
 * Queries real-time precipitation intensity and 6-hour forecast trends via Open-Meteo.
 */
async function getLiveRainfallPrecipitation({ lat = 19.4534, lng = 72.8061 }) {
  const weather = await weatherService.getRainfall(lat, lng);
  return {
    precipitationMmHr: weather.precipitationMmHr,
    intensityLevel: weather.intensityLevel,
    stormTrend: weather.trend,
    summary: weather.summary,
    forecast6h: weather.forecast6h
  };
}

const mongoose = require('mongoose');
let inMemoryHotspots = [];
try {
  const seed = require('../scripts/seedHotspots');
  inMemoryHotspots = seed.HOTSPOTS || [];
} catch (e) {}

/**
 * Tool 3: getHistoricalHotspotProfile
 * Checks whether coordinate lies inside a chronic low-lying bowl, culvert, or underpass.
 */
async function getHistoricalHotspotProfile({ lat = 19.4534, lng = 72.8061, radiusMeters = 800 }) {
  let hotspots = [];

  // If Mongoose is connected, query DB with spatial index
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      hotspots = await FloodHotspot.find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusMeters
          }
        }
      }).limit(3);
    } catch (geoErr) {
      try {
        const all = await FloodHotspot.find().limit(30);
        hotspots = all.filter(h => {
          const coords = h.location?.coordinates || [];
          return coords.length === 2 && haversineMeters(lat, lng, coords[1], coords[0]) <= radiusMeters;
        });
      } catch (err) {}
    }
  }

  // Fallback to in-memory hotspots if DB not connected or no matches
  if (!hotspots || hotspots.length === 0) {
    hotspots = inMemoryHotspots.filter(h => {
      const coords = h.location?.coordinates || [];
      return coords.length === 2 && haversineMeters(lat, lng, coords[1], coords[0]) <= radiusMeters;
    });
  }

  if (hotspots && hotspots.length > 0) {
    const primary = hotspots[0];
    const coords = primary.location?.coordinates || [lng, lat];
    const dist = Math.round(haversineMeters(lat, lng, coords[1], coords[0]));
    return {
      isChronicBowl: true,
      hotspotName: primary.name,
      ward: primary.ward,
      category: primary.category,
      distanceMeters: dist,
      drainageCapacityMmPerHr: primary.drainageCapacityMmPerHr,
      chronicRiskLevel: primary.chronicRiskLevel,
      historicalClearanceHoursAvg: primary.historicalClearanceHoursAvg,
      criticalWaterThresholdCm: primary.criticalWaterThresholdCm,
      notes: primary.notes
    };
  }

  return {
    isChronicBowl: false,
    hotspotName: null,
    ward: 'Standard Municipal Ward',
    category: 'SURFACE_TERRAIN',
    distanceMeters: null,
    drainageCapacityMmPerHr: 25,
    chronicRiskLevel: 'LOW',
    historicalClearanceHoursAvg: 2.0,
    criticalWaterThresholdCm: 30,
    notes: 'No chronic bottleneck registered within 800m'
  };
}

/**
 * Tool 4: clusterDistressBeacons
 * Performs spatial grouping on active SOS distress beacons to identify high-density clusters.
 */
async function clusterDistressBeacons({ radiusKm = 0.5, minBeacons = 2 } = {}) {
  let activeEvents = [];
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      activeEvents = await SosEvent.find({
        status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
      })
        .populate('triggeredBy', 'displayName role phoneNumber')
        .sort({ createdAt: -1 })
        .limit(100);
    } catch (e) {}
  }

  if (!activeEvents || activeEvents.length === 0) {
    return { clusterCount: 0, clusters: [] };
  }

  const radiusMeters = radiusKm * 1000;
  const visited = new Set();
  const clusters = [];

  // Spatial clustering (greedy density clustering)
  for (let i = 0; i < activeEvents.length; i++) {
    const event = activeEvents[i];
    if (visited.has(event._id.toString())) continue;

    const coords = event.location?.coordinates || [];
    if (coords.length < 2) continue;
    const [lng, lat] = coords;

    const neighbors = [event];
    visited.add(event._id.toString());

    for (let j = 0; j < activeEvents.length; j++) {
      if (i === j) continue;
      const other = activeEvents[j];
      if (visited.has(other._id.toString())) continue;

      const otherCoords = other.location?.coordinates || [];
      if (otherCoords.length < 2) continue;

      const d = haversineMeters(lat, lng, otherCoords[1], otherCoords[0]);
      if (d <= radiusMeters) {
        visited.add(other._id.toString());
        neighbors.push(other);
      }
    }

    if (neighbors.length >= minBeacons) {
      // Calculate centroid
      const sumLat = neighbors.reduce((acc, n) => acc + n.location.coordinates[1], 0);
      const sumLng = neighbors.reduce((acc, n) => acc + n.location.coordinates[0], 0);
      const centroidLat = sumLat / neighbors.length;
      const centroidLng = sumLng / neighbors.length;

      // Extract cluster characteristics
      let maxDepth = 0;
      const categoryCounts = {};
      neighbors.forEach(n => {
        if ((n.waterDepthCm || 0) > maxDepth) maxDepth = n.waterDepthCm || 0;
        const cat = n.category || 'OTHER';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      const dominantCategory = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0] || 'WATERLOGGING';

      // Find nearest Headquarters
      let nearestHq = null;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
          const hqs = await Headquarters.find({ status: 'ACTIVE' }).limit(10);
          let minHqDist = Infinity;
          hqs.forEach(hq => {
            const hqCoords = hq.location?.coordinates || [];
            if (hqCoords.length === 2) {
              const dist = haversineMeters(centroidLat, centroidLng, hqCoords[1], hqCoords[0]);
              if (dist < minHqDist) {
                minHqDist = dist;
                nearestHq = {
                  id: hq._id,
                  name: hq.name,
                  distanceKm: Number((dist / 1000).toFixed(2))
                };
              }
            }
          });
        } catch (hqErr) {}
      }
      if (!nearestHq) {
        nearestHq = { name: 'Vasai-Virar Disaster Base Alpha', distanceKm: 2.1 };
      }

      clusters.push({
        clusterId: `cluster_${clusters.length + 1}`,
        beaconCount: neighbors.length,
        trappedEst: Math.round(neighbors.length * 2.5),
        centroid: {
          lat: Number(centroidLat.toFixed(6)),
          lng: Number(centroidLng.toFixed(6))
        },
        radiusMeters: Math.round(radiusMeters),
        maxDepthCm: maxDepth,
        primaryCategory: dominantCategory,
        nearestHq: nearestHq || { name: 'Municipal Rescue Headquarters', distanceKm: 2.5 },
        sosIds: neighbors.map(n => n._id.toString())
      });
    }
  }

  return {
    clusterCount: clusters.length,
    clusters
  };
}

/**
 * Tool 5: auditMeshCredibility
 * Cross-validates crowdsourced SOS beacon against peers, weather, and historical topography.
 */
async function auditMeshCredibility({ sosId, lat, lng, waterDepthCm, category, userRole, createdAt }) {
  let targetEvent = null;

  if (sosId && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      targetEvent = await SosEvent.findById(sosId).populate('triggeredBy', 'role displayName');
      if (targetEvent) {
        lat = targetEvent.location.coordinates[1];
        lng = targetEvent.location.coordinates[0];
        waterDepthCm = targetEvent.waterDepthCm || 0;
        category = targetEvent.category || 'OTHER';
        userRole = targetEvent.triggeredBy?.role || 'CITIZEN';
        createdAt = targetEvent.createdAt;
      }
    } catch (e) {}
  }

  if (lat === undefined || lng === undefined) {
    return {
      confidenceScore: 50,
      classification: 'PROBABLE_INCIDENT',
      peerCount: 0,
      isFlaggedSpam: false,
      rationale: 'Missing geographic coordinates for peer verification.'
    };
  }

  let score = 50; // Base score
  const reasons = ['Baseline hazard confidence (50%)'];

  // 1. Peer Node Corroboration within 250m & 45 minutes
  const targetTime = createdAt ? new Date(createdAt).getTime() : Date.now();
  const timeWindowMs = 45 * 60 * 1000;

  let nearbyCandidates = [];
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      nearbyCandidates = await SosEvent.find({
        _id: { $ne: targetEvent?._id },
        createdAt: {
          $gte: new Date(targetTime - timeWindowMs),
          $lte: new Date(targetTime + timeWindowMs)
        }
      }).limit(20);
    } catch (e) {}
  }

  let peerCount = 0;
  nearbyCandidates.forEach(cand => {
    const coords = cand.location?.coordinates || [];
    if (coords.length === 2) {
      const d = haversineMeters(lat, lng, coords[1], coords[0]);
      if (d <= 250) {
        peerCount++;
      }
    }
  });

  if (peerCount > 0) {
    const peerBoost = Math.min(30, peerCount * 15);
    score += peerBoost;
    reasons.push(`Corroborated by ${peerCount} peer node(s) within 250m (+${peerBoost}%)`);
  }

  // 2. Weather & Hotspot Consistency
  const [weather, hotspot] = await Promise.all([
    weatherService.getRainfall(lat, lng),
    getHistoricalHotspotProfile({ lat, lng, radiusMeters: 500 })
  ]);

  if (weather.precipitationMmHr > 5.0 || hotspot.isChronicBowl) {
    score += 10;
    reasons.push(
      hotspot.isChronicBowl
        ? `Located at chronic bottleneck [${hotspot.hotspotName}] (+10%)`
        : `Meteorological rainfall confirmed at ${weather.precipitationMmHr} mm/hr (+10%)`
    );
  }

  // 3. Authority Operator Role
  if (userRole === 'ADMIN' || userRole === 'AUTHORITY') {
    score += 15;
    reasons.push('Verified authority / municipal operator dispatch (+15%)');
  }

  // 4. Anomaly / Spoofing Penalty
  const tide = await tideService.getTideConditions(lat, lng);
  const isDepthExtreme = (waterDepthCm || 0) > 60;
  const isDryWeather = weather.precipitationMmHr < 1.0;
  const isTideLow = tide.currentTideMeters < 2.8;

  if (isDepthExtreme && isDryWeather && isTideLow && peerCount === 0 && !hotspot.isChronicBowl) {
    score -= 40;
    reasons.push('Anomaly flag: Extreme water depth reported during dry weather with zero peer corroboration (-40%)');
  }

  // Clamp score [5, 100]
  score = Math.max(5, Math.min(100, score));

  let classification = 'PROBABLE_INCIDENT';
  let isFlaggedSpam = false;

  if (score >= 85) {
    classification = 'VERIFIED_CONSENSUS';
  } else if (score < 45) {
    classification = 'FLAGGED_SPAM';
    isFlaggedSpam = true;
  }

  return {
    confidenceScore: score,
    classification,
    peerCount,
    weatherConsistent: weather.precipitationMmHr > 2.0 || hotspot.isChronicBowl,
    isFlaggedSpam,
    rationale: reasons.join('; ')
  };
}

// ─── 2. DETERMINISTIC HYDRODYNAMIC RECESSION TIMELINE ───────────────────────

/**
 * Deterministic drainage calculation based on coastal tide physics & rainfall inflow.
 * Formula:
 * T_clearance = Time_(tide < 2.8m) + (WaterVolume / (DrainRate_gravity + PumpCapacity))
 */
async function computeDeterministicRecessionTimeline({
  lat = 19.4534,
  lng = 72.8061,
  waterDepthCm = 60,
  dewateringPumpDeployed = false,
  overrideTideMeters
}) {
  const depth = Math.max(5, waterDepthCm || 60);

  const [tide, weather, hotspot] = await Promise.all([
    tideService.getTideConditions(lat, lng, { overrideTideMeters }),
    weatherService.getRainfall(lat, lng),
    getHistoricalHotspotProfile({ lat, lng })
  ]);

  const now = new Date();

  // Baseline gravity drainage rate in cm/hr
  // Hotspot capacity is in mm/hr -> divide by 10 for cm/hr
  let gravityRateCmHr = (hotspot.drainageCapacityMmPerHr || 20) / 10; // e.g. 2.0 cm/hr

  // Sluice gates shut when tide >= 3.8m -> gravity drainage drops to 0!
  const gatesClosed = tide.currentTideMeters >= 3.8;
  if (gatesClosed) {
    gravityRateCmHr = 0;
  }

  // Dewatering pump contribution: 500+ GPM mobile pump adds ~12 cm/hr drainage speed
  const pumpRateCmHr = dewateringPumpDeployed ? 12.0 : 0;
  const totalDrainRateCmHr = gravityRateCmHr + pumpRateCmHr;

  // Rainfall inflow addition: precipitation mm/hr adds to standing pool
  const rainInflowCmHr = (weather.precipitationMmHr || 0) / 10;

  // Calculate duration until tide recedes below 2.8m
  let minutesUntilGatesOpen = 0;
  if (gatesClosed) {
    minutesUntilGatesOpen = 120; // Default estimate 2 hours of gate closure
    if (tide.expectedDrainageResumeTime && tide.expectedDrainageResumeTime !== 'NOW (Active)') {
      const [rHour, rMin] = tide.expectedDrainageResumeTime.split(':').map(Number);
      if (!isNaN(rHour) && !isNaN(rMin)) {
        const resumeDate = new Date(now);
        resumeDate.setHours(rHour, rMin, 0, 0);
        if (resumeDate > now) {
          minutesUntilGatesOpen = Math.round((resumeDate.getTime() - now.getTime()) / (60 * 1000));
        }
      }
    }
  }

  // Calculate actual drainage duration once gates open
  // Effective drainage rate = gravityRate (approx 2-3 cm/hr) + pumpRate - residual rain
  const effectiveActiveDrainRate = Math.max(1.5, ((hotspot.drainageCapacityMmPerHr || 20) / 10) + pumpRateCmHr - (rainInflowCmHr * 0.3));
  let drainageDurationMinutes = Math.round((depth / effectiveActiveDrainRate) * 60);

  // Severe rainfall bonus delay
  if (weather.precipitationMmHr > 30 && gatesClosed) {
    drainageDurationMinutes += 90;
  }

  // Pump asset speedup
  if (dewateringPumpDeployed) {
    drainageDurationMinutes = Math.round(drainageDurationMinutes * 0.6);
  }

  const totalClearanceMinutes = minutesUntilGatesOpen + drainageDurationMinutes;

  // Compute key timeline timestamps
  const formatTime = (d) =>
    d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata'
    });

  const timeNow = formatTime(now);

  const peakImpactDate = new Date(now.getTime() + Math.min(minutesUntilGatesOpen * 0.5, 45) * 60 * 1000);
  const gatesOpenDate = new Date(now.getTime() + minutesUntilGatesOpen * 60 * 1000);
  const passableDate = new Date(gatesOpenDate.getTime() + Math.round(drainageDurationMinutes * 0.65) * 60 * 1000);
  const fullClearDate = new Date(now.getTime() + totalClearanceMinutes * 60 * 1000);

  const timelineStages = [
    {
      stage: 'T+0 (Current State)',
      time: timeNow,
      depthCm: depth,
      status: gatesClosed ? 'SLUICE GATES LOCKED' : 'DRAINAGE RESTRICTED',
      description: gatesClosed
        ? `Water depth ${depth}cm. Arabian Sea tide at ${tide.currentTideMeters}m exceeds threshold (3.8m). Sea sluice gates are shut; gravity discharge is stalled at 0 mm/hr.`
        : `Water depth ${depth}cm. Sluice gates open; drainage is proceeding at diminished velocity.`,
      icon: 'alert-triangle'
    },
    {
      stage: 'Peak Tidal Crest & Backflow',
      time: tide.highTidePeakTime || formatTime(peakImpactDate),
      depthCm: Math.min(150, Math.round(depth + (gatesClosed ? 8 : 2))),
      status: 'MAXIMUM SURCHARGE',
      description: `Arabian Sea crests at ${tide.highTidePeakMeters}m. Maximum backflow pressure on stormwater culverts. Ingress strictly prohibited.`,
      icon: 'droplets'
    },
    {
      stage: 'Sluice Gates Open / Gravity Recession',
      time: formatTime(gatesOpenDate),
      depthCm: depth,
      status: 'RECESSION COMMENCES',
      description: `Sea tide recedes below 2.8m. Municipal sea gates open. Stormwater gravity discharge resumes at ${hotspot.drainageCapacityMmPerHr} mm/hr.`,
      icon: 'unlock'
    },
    {
      stage: 'Emergency Transit Passable',
      time: formatTime(passableDate),
      depthCm: 25,
      status: 'HIGH-CLEARANCE ONLY',
      description: `Water recedes below 30cm critical threshold. Heavy fire tenders, NDRF rescue trucks, and buses may traverse with escort.`,
      icon: 'truck'
    },
    {
      stage: 'Full Corridor Clearance',
      time: formatTime(fullClearDate),
      depthCm: 5,
      status: 'NORMALIZED TRAFFIC',
      description: `Water fully drained (<10cm). Standard two-wheelers and light vehicles restored. Mud clearing crews deployed.`,
      icon: 'check-circle'
    }
  ];

  const municipalDirectives = [
    gatesClosed
      ? `Enforce immediate barricading at ${hotspot.hotspotName || 'incident perimeter'}. Zero vehicular transit permitted.`
      : `Station municipal traffic wardens at ${hotspot.hotspotName || 'waterlogged zone'}.`,
    gatesClosed
      ? `Deploy 500 GPM Mobile Dewatering Pump Unit from nearest Base to circumvent locked sea sluice gates.`
      : `Monitor culvert silt levels; maintain dewatering pump standby.`,
    `Inform State Disaster Management Authority (SDMA) of estimated clearance time at ${formatTime(fullClearDate)}.`,
    `Broadcast emergency mesh advisory to citizens within 1.5km radius.`
  ];

  const offlineMeshBroadcast = `[ZeroGrid ALERT] Flooding at ${hotspot.hotspotName || 'Vasai-Virar Sector'}. Depth: ${depth}cm. Sluice gates ${gatesClosed ? 'CLOSED due to high tide' : 'OPEN'}. Road opens for heavy vehicles ~${formatTime(passableDate)}, fully clear ~${formatTime(fullClearDate)}. Avoid underpass.`;

  return {
    engine: 'Deterministic Hydrodynamic Expert System',
    coordinates: { lat, lng },
    currentWaterDepthCm: depth,
    hotspotInfo: hotspot,
    tideState: tide,
    rainfallState: weather,
    recessionStartTime: formatTime(gatesOpenDate),
    estimatedClearanceTime: formatTime(fullClearDate),
    totalClearanceHours: Number((totalClearanceMinutes / 60).toFixed(1)),
    timelineStages,
    municipalDirectives,
    offlineMeshBroadcast,
    calculatedAt: now.toISOString()
  };
}

// ─── 3. AWS STRANDS AGENT DEFINITION & RUNNER ───────────────────────────────

/**
 * Build Strands Tools if SDK is available
 */
function createStrandsTools() {
  if (!StrandsFunctionTool && !strandsTool) return {};

  const makeTool = strandsTool || ((cfg) => new StrandsFunctionTool(cfg));

  return {
    checkTideDrainageImpact: makeTool({
      name: 'checkTideDrainageImpact',
      description: 'Calculates sea sluice gate closure, Arabian Sea tide height, and backflow pressure for coastal coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          waterDepthCm: { type: 'number' }
        }
      },
      execute: checkTideDrainageImpact
    }),

    getLiveRainfallPrecipitation: makeTool({
      name: 'getLiveRainfallPrecipitation',
      description: 'Queries keyless Open-Meteo real-time rainfall rate in mm/hr and 6h forecast trends.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        }
      },
      execute: getLiveRainfallPrecipitation
    }),

    getHistoricalHotspotProfile: makeTool({
      name: 'getHistoricalHotspotProfile',
      description: 'Checks whether coordinates fall within a chronic low-lying bowl, underpass, or railway culvert bottleneck.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          radiusMeters: { type: 'number' }
        }
      },
      execute: getHistoricalHotspotProfile
    }),

    clusterDistressBeacons: makeTool({
      name: 'clusterDistressBeacons',
      description: 'Identifies high-density distress beacon clusters and matches nearest emergency municipal assets.',
      inputSchema: {
        type: 'object',
        properties: {
          radiusKm: { type: 'number' },
          minBeacons: { type: 'number' }
        }
      },
      execute: clusterDistressBeacons
    }),

    auditMeshCredibility: makeTool({
      name: 'auditMeshCredibility',
      description: 'Cross-audits crowdsourced distress telemetry with peer consensus, rainfall, and anomaly detection.',
      inputSchema: {
        type: 'object',
        properties: {
          sosId: { type: 'string' }
        }
      },
      execute: auditMeshCredibility
    })
  };
}

const toolsMap = createStrandsTools();

/**
 * Predict drainage timeline using AWS Strands Agent (Claude 3.5 Sonnet on Bedrock)
 * with automatic deterministic mathematical fallback.
 */
async function predictDrainageTimeline({
  lat = 19.4534,
  lng = 72.8061,
  waterDepthCm = 60,
  sosId,
  dewateringPumpDeployed = false,
  overrideTideMeters
}) {
  // If sosId provided and connected, load depth and coordinates from DB
  if (sosId && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const sos = await SosEvent.findById(sosId);
      if (sos) {
        lng = sos.location.coordinates[0];
        lat = sos.location.coordinates[1];
        waterDepthCm = sos.waterDepthCm || waterDepthCm;
      }
    } catch (e) {}
  }

  // 1. Calculate deterministic baseline
  const deterministicResult = await computeDeterministicRecessionTimeline({
    lat,
    lng,
    waterDepthCm,
    dewateringPumpDeployed,
    overrideTideMeters
  });

  const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  // 2. Enhance with AWS Bedrock if credentials are present
  if (StrandsAgent && StrandsBedrockModel && hasAwsCreds) {
    try {
      const model = new StrandsBedrockModel({
        region: process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0'
      });

      const agent = new StrandsAgent({
        model,
        tools: Object.values(toolsMap),
        systemPrompt: `You are the ZeroGrid Autonomous Predictive Crisis Command Agent.
You combine coastal tidal physics, meteorological rainfall, and municipal disaster management engineering.
Analyze the incident parameters and provide concise, authoritative municipal tactical directives.
Respond strictly in JSON matching the provided schema.`
      });

      const prompt = `Location: [${lat}, ${lng}], Current Water Depth: ${waterDepthCm}cm.
Tide State: ${JSON.stringify(deterministicResult.tideState)}
Rainfall State: ${JSON.stringify(deterministicResult.rainfallState)}
Historical Bottleneck: ${JSON.stringify(deterministicResult.hotspotInfo)}
Deterministic Timeline: ${JSON.stringify(deterministicResult.timelineStages)}

Synthesize updated municipal directives and an offline mesh broadcast text. Return pure JSON:
{
  "municipalDirectives": ["string"],
  "offlineMeshBroadcast": "string"
}`;

      const response = await agent.invoke({ prompt });
      const rawText = typeof response === 'string' ? response : (response.output || response.text || JSON.stringify(response));
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed.municipalDirectives && parsed.offlineMeshBroadcast) {
        deterministicResult.engine = 'AWS Strands Agent (Claude 3.5 Sonnet on Bedrock)';
        deterministicResult.municipalDirectives = parsed.municipalDirectives;
        deterministicResult.offlineMeshBroadcast = parsed.offlineMeshBroadcast;
      }
    } catch (err) {
      console.warn('[StrandsPredictiveAgent] AWS Bedrock call bypassed, using deterministic engine:', err.message);
    }
  }

  return deterministicResult;
}

// ─── 4. NDMA SITUATION REPORT GENERATOR ──────────────────────────────────────

/**
 * Generate an official National Disaster Management Authority (NDMA) SitRep
 */
async function generateSitRep({ targetWard = 'All Municipal Sectors', operationalRegion = 'Vasai-Virar & Mumbai Metropolitan Coastal Region' } = {}) {
  let activeEvents = [];
  let hotspots = inMemoryHotspots;

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      activeEvents = await SosEvent.find({ status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }).limit(50);
      const dbHotspots = await FloodHotspot.find().limit(15);
      if (dbHotspots && dbHotspots.length > 0) hotspots = dbHotspots;
    } catch (e) {}
  }

  const [tide, weather, clustersData] = await Promise.all([
    tideService.getTideConditions(19.4534, 72.8061),
    weatherService.getRainfall(19.4534, 72.8061),
    clusterDistressBeacons({ radiusKm: 0.6, minBeacons: 2 })
  ]);

  const totalTrappedEst = activeEvents.length * 3;
  const criticalHotspots = hotspots.filter(h => h.chronicRiskLevel === 'CRITICAL').length;
  const now = new Date();

  const sitRepMarkdown = `# NATIONAL DISASTER MANAGEMENT AUTHORITY (NDMA)
## SITUATION REPORT (SITREP) — COASTAL MONSOON CRISIS
**Reference:** ZEROGRID-SR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-01  
**Operational Region:** ${operationalRegion}  
**Time of Issuance:** ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${now.toDateString()}  
**Lead Authority:** Municipal Disaster Management Command & ZeroGrid Autonomous System  

---

### 1. OPERATIONAL SUMMARY
- **Active Distress Beacons:** ${activeEvents.length} Verified Incidents
- **Estimated Citizens Trapped / Cut-Off:** ~${totalTrappedEst} Persons
- **High-Density Hazard Clusters:** ${clustersData.clusterCount} Spatial Clusters Identified
- **Critical Road Bottlenecks Submerged:** ${criticalHotspots} Arterial Underpasses

---

### 2. COASTAL HYDRODYNAMICS & METEOROLOGICAL THREAT MATRIX
| Parameter | Current Reading | Status / Impact |
|:---|:---|:---|
| **Arabian Sea Tide Height** | **${tide.currentTideMeters} m** | ${tide.sluiceGateStatus === 'CLOSED' ? '🔴 CRITICAL: Sluice Gates Locked' : '🟢 Sluice Gates Open'} |
| **Next Tidal Crest Peak** | **${tide.highTidePeakMeters} m at ${tide.highTidePeakTime}** | High backflow pressure on storm outfalls |
| **Gravity Discharge Status** | **${tide.gravityDrainagePossible ? 'Active' : 'STALLED (0 mm/hr)'}** | Drainage resumes ~${tide.expectedDrainageResumeTime} |
| **Precipitation Intensity** | **${weather.precipitationMmHr} mm/hr** | Level: ${weather.intensityLevel} (${weather.trend}) |
| **Arabian Sea Wave Swell** | **${tide.waveHeightMeters} m (${tide.wavePeriodSeconds}s period)** | Coastal surge risk |

---

### 3. HIGH-DENSITY CLUSTER DISPATCH DIRECTIVES
${clustersData.clusters.length > 0 ? clustersData.clusters.map((c, i) => `
**Cluster #${i + 1} (${c.primaryCategory} — ${c.centroid.lat}, ${c.centroid.lng})**
- **Incident Density:** ${c.beaconCount} beacons (${c.trappedEst} trapped citizens)
- **Max Reported Water Depth:** ${c.maxDepthCm} cm
- **Assigned Headquarters:** ${c.nearestHq.name} (${c.nearestHq.distanceKm} km away)
- **Action Order:** Dispatch 500 GPM dewatering mobile truck via perimeter evasion corridor.
`).join('\n') : '*No severe multi-beacon clusters detected at this time.*'}

---

### 4. MANDATORY SOP DIRECTIVES FOR MUNICIPAL COMMISSIONER
1. **Traffic & Corridor Control:** Completely halt traffic across all railway subways (Milan Subway, Andheri Subway, Nalasopara Subway).
2. **Sluice Gate Operation:** Maintain locked sea sluice gates while tide exceeds 3.8m to prevent Arabian Sea backflow into ward drains.
3. **Asset Deployment:** Mobilize high-clearance rescue trailers and dewatering assets to Datt Mandir Road and Achole Culvert.
4. **Offline Mesh Broadcast:** Trigger LoRa/BLE mesh emergency packet over 868MHz gateway for citizens without cellular coverage.

---
*Generated autonomously by ZeroGrid Command Engine via AWS Strands Agents SDK.*`;

  return {
    referenceId: `ZEROGRID-SR-${Date.now()}`,
    issuedAt: now.toISOString(),
    operationalRegion,
    activeIncidentsCount: activeEvents.length,
    trappedEstimated: totalTrappedEst,
    clustersIdentified: clustersData.clusterCount,
    markdownReport: sitRepMarkdown,
    tideSummary: tide,
    weatherSummary: weather
  };
}

module.exports = {
  predictDrainageTimeline,
  clusterDistressBeacons,
  auditMeshCredibility,
  generateSitRep,
  computeDeterministicRecessionTimeline,
  checkTideDrainageImpact,
  getLiveRainfallPrecipitation,
  getHistoricalHotspotProfile,
  tools: toolsMap
};
