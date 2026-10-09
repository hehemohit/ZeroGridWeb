/**
 * predictiveController.js
 * Controller endpoints for the Autonomous Predictive Crisis Command Center.
 * Exposes tidal & meteorological summaries, drainage timeline projections,
 * distress beacon spatial clustering, multi-node credibility audits,
 * 1-click mesh broadcasts, and NDMA Situation Reports.
 */

const strandsPredictiveAgent = require('../utils/strandsPredictiveAgent');
const tideService = require('../utils/tideService');
const weatherService = require('../utils/weatherService');
const FloodHotspot = require('../models/FloodHotspot');
const mongoose = require('mongoose');

let inMemoryHotspots = [];
try {
  const seed = require('../scripts/seedHotspots');
  inMemoryHotspots = seed.HOTSPOTS || [];
} catch (e) {}

/**
 * GET /api/admin/predictive/tide-summary
 * Real-time coastal tide metrics, sluice gate state, and precipitation for HUD strip.
 */
async function getTideSummary(req, res, next) {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : 19.4534;
    const lng = req.query.lng ? parseFloat(req.query.lng) : 72.8061;
    const overrideTideMeters = req.query.overrideTideMeters 
      ? parseFloat(req.query.overrideTideMeters) 
      : undefined;

    const [tide, weather] = await Promise.all([
      tideService.getTideConditions(lat, lng, { overrideTideMeters }),
      weatherService.getRainfall(lat, lng)
    ]);

    // Optionally emit telemetry update to socket subscribers
    const io = req.app.get('io');
    if (io) {
      io.of('/sos').emit('telemetry:tide-update', {
        tide,
        weather,
        emittedAt: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      tide,
      weather,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/predictive/drainage-timeline
 * Computes hydrodynamic recession timeline & municipal directives.
 */
async function getDrainageTimeline(req, res, next) {
  try {
    const {
      sosId,
      lat = 19.4534,
      lng = 72.8061,
      waterDepthCm = 60,
      dewateringPumpDeployed = false,
      overrideTideMeters
    } = req.body;

    const timeline = await strandsPredictiveAgent.predictDrainageTimeline({
      sosId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      waterDepthCm: parseFloat(waterDepthCm),
      dewateringPumpDeployed: Boolean(dewateringPumpDeployed),
      overrideTideMeters: overrideTideMeters !== undefined ? parseFloat(overrideTideMeters) : undefined
    });

    res.status(200).json({
      success: true,
      timeline
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/predictive/clusters
 * Returns high-density SOS clusters and matched emergency rescue assets.
 */
async function getClusters(req, res, next) {
  try {
    const radiusKm = req.query.radiusKm ? parseFloat(req.query.radiusKm) : 0.5;
    const minBeacons = req.query.minBeacons ? parseInt(req.query.minBeacons, 10) : 2;

    const clustersData = await strandsPredictiveAgent.clusterDistressBeacons({
      radiusKm,
      minBeacons
    });

    res.status(200).json({
      success: true,
      clusterCount: clustersData.clusterCount,
      clusters: clustersData.clusters
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/predictive/audit-credibility
 * Audits a distress beacon for peer consensus and anti-spam flags.
 */
async function auditCredibility(req, res, next) {
  try {
    const {
      sosId,
      lat,
      lng,
      waterDepthCm,
      category,
      userRole
    } = req.body;

    const audit = await strandsPredictiveAgent.auditMeshCredibility({
      sosId,
      lat: lat !== undefined ? parseFloat(lat) : undefined,
      lng: lng !== undefined ? parseFloat(lng) : undefined,
      waterDepthCm: waterDepthCm !== undefined ? parseFloat(waterDepthCm) : undefined,
      category,
      userRole
    });

    res.status(200).json({
      success: true,
      audit
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/predictive/sitrep
 * Generates an official NDMA Situation Report markdown document.
 */
async function generateSitRep(req, res, next) {
  try {
    const { targetWard, operationalRegion } = req.body;

    const sitrep = await strandsPredictiveAgent.generateSitRep({
      targetWard,
      operationalRegion
    });

    res.status(200).json({
      success: true,
      sitrep
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/predictive/broadcast
 * Broadcasts emergency advisory to WebSockets (/sos) and stages packet for offline mesh mules.
 */
async function broadcastAdvisory(req, res, next) {
  try {
    const {
      headline = 'EMERGENCY ADVISORY',
      advisory,
      radiusMeters = 1500,
      coordinates = [72.8061, 19.4534], // [lng, lat]
      category = 'WATERLOGGING'
    } = req.body;

    if (!advisory) {
      return res.status(400).json({
        success: false,
        message: 'Advisory text is required for emergency broadcast'
      });
    }

    const packet = {
      packetId: `MB-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      headline,
      advisory,
      category,
      coordinates,
      radiusMeters,
      dispatchedBy: req.user ? { id: req.user.id, displayName: req.user.displayName } : null,
      dispatchedAt: new Date().toISOString()
    };

    // Emit live event over Socket.io /sos namespace
    const io = req.app.get('io');
    if (io) {
      io.of('/sos').emit('mesh:broadcast', packet);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency mesh broadcast transmitted successfully',
      packet
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/predictive/hotspots
 * Returns chronic flood hotspots database for map visualization.
 */
async function getChronicHotspots(req, res, next) {
  try {
    let hotspots = [];
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        hotspots = await FloodHotspot.find().sort({ chronicRiskLevel: 1 });
      } catch (e) {}
    }

    if (!hotspots || hotspots.length === 0) {
      hotspots = inMemoryHotspots;
    }

    res.status(200).json({
      success: true,
      count: hotspots.length,
      hotspots
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/predictive/24h-chaos
 * Returns 24-hour hour-by-hour chaos trajectory, wire placement analysis, and preemptive manpower staging.
 */
async function get24HourChaosPrediction(req, res, next) {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : 19.456;
    const lng = req.query.lng ? parseFloat(req.query.lng) : 72.812;

    const chaosPredictionAgent = require('../utils/chaosPredictionAgent');
    const prediction = await chaosPredictionAgent.predict24HourChaos({ lat, lng });

    res.status(200).json(prediction);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/predictive/preemptive-stage
 * Deploys preemptive hold order to the 160-admin workforce and emits real-time alerts.
 */
async function preemptiveStageWorkforce(req, res, next) {
  try {
    const { stagedDepartments, directiveNotes } = req.body;
    const io = req.app.get('io');

    const stagedPayload = {
      orderId: `ORDER_PREEMPTIVE_${Date.now()}`,
      issuedBy: req.user?.email || 'Incident Commander',
      issuedAt: new Date().toISOString(),
      stagedDepartments: stagedDepartments || [],
      directiveNotes: directiveNotes || 'Preemptive 24h hazard hold active.',
      status: 'ON_HOLD_STANDBY'
    };

    if (io) {
      io.of('/sos').emit('workforce:preemptively_staged', stagedPayload);
    }

    res.status(200).json({
      success: true,
      message: 'Preemptive manpower standby orders dispatched successfully',
      stagingOrder: stagedPayload
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTideSummary,
  getDrainageTimeline,
  getClusters,
  auditCredibility,
  generateSitRep,
  broadcastAdvisory,
  getChronicHotspots,
  get24HourChaosPrediction,
  preemptiveStageWorkforce
};
