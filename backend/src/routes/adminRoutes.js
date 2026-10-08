const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  getActiveSosEvents,
  getSosHistory,
  getUsers,
  addAdmin,
  removeAdmin,
  autoAssignNearestAdmin,
  clearAllSosEvents,
  optimizeAdminRoute,
  getSystemStats,
  getSosDossier
} = require('../controllers/adminController');

const router = express.Router();

const {
  getTideSummary,
  getDrainageTimeline,
  getClusters,
  auditCredibility,
  generateSitRep,
  broadcastAdvisory,
  getChronicHotspots
} = require('../controllers/predictiveController');

// All admin routes require: (1) valid JWT, (2) DB-verified ADMIN role + adminApproved: true
router.use(verifyToken, verifyAdminRole);

// ─── Autonomous Predictive Crisis Command Routes ─────────────────────────────
// GET /api/admin/predictive/tide-summary — Real-time coastal tides & rain metrics
router.get('/predictive/tide-summary', getTideSummary);

// POST /api/admin/predictive/drainage-timeline — Hydrodynamic recession ETA & timeline
router.post('/predictive/drainage-timeline', getDrainageTimeline);

// GET /api/admin/predictive/clusters — Density-based distress beacon clusters
router.get('/predictive/clusters', getClusters);

// POST /api/admin/predictive/audit-credibility — Peer consensus & anti-spam audit
router.post('/predictive/audit-credibility', auditCredibility);

// POST /api/admin/predictive/sitrep — Official NDMA standard Situation Report
router.post('/predictive/sitrep', generateSitRep);

// POST /api/admin/predictive/broadcast — 1-Click emergency LoRa/BLE mesh advisory
router.post('/predictive/broadcast', broadcastAdvisory);

// GET /api/admin/predictive/hotspots — Chronic flood bottlenecks database
router.get('/predictive/hotspots', getChronicHotspots);

// ─── Legacy & Standard Admin Operations ──────────────────────────────────────
// GET /api/admin/system-stats — Live CPU %, Memory, Uptime, and Telemetry
router.get('/system-stats', getSystemStats);

// GET /api/admin/sos?status=ACTIVE — live SOS event list for the map
router.get('/sos/history', getSosHistory);
router.get('/sos/:id/dossier', getSosDossier);
router.get('/sos', getActiveSosEvents);

// POST /api/admin/sos/auto-assign — Auto-assign active SOS events to nearest admin responder
router.post('/sos/auto-assign', autoAssignNearestAdmin);

// POST /api/admin/sos/optimize-route — Compute multi-factor rescue route sequence for assigned SOS events
router.post('/sos/optimize-route', optimizeAdminRoute);

// DELETE /api/admin/sos/clear-all — Temporary route to clear/delete all existing SOS signals
router.delete('/sos/clear-all', clearAllSosEvents);

// GET /api/admin/users?q=search — user directory search (any approved admin)
router.get('/users', getUsers);

// POST /api/admin/admins — promote a user to admin (any approved admin can do this)
router.post('/admins', addAdmin);

// DELETE /api/admin/admins/:userId — revoke admin status
router.delete('/admins/:userId', removeAdmin);

module.exports = router;
