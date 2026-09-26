const express = require('express');
const verifyApiKey = require('../middleware/verifyApiKey');
const {
  getNearestZone,
  getSosDensity,
  ingestExternalSos
} = require('../controllers/publicApiController');

const router = express.Router();

// ─── Public Feature Endpoints (v1) ───────────────────────────────────────────

/**
 * GET /api/v1/public/zones/nearest?lat={lat}&lng={lng}
 * Returns nearest Headquarters, distance in km, and assigned 10-15 km Hexagonal Zone.
 */
router.get('/zones/nearest', verifyApiKey({ optional: true }), getNearestZone);

/**
 * GET /api/v1/public/sos/density?lat={lat}&lng={lng}&radiusKm={r}
 * Returns privacy-sanitized emergency incident density and danger risk level.
 */
router.get('/sos/density', verifyApiKey({ optional: true }), getSosDensity);

/**
 * POST /api/v1/public/sos/ingest
 * Ingests external partner SOS pings (smartwatches, IoT panic buttons, municipal portals).
 */
router.post('/sos/ingest', verifyApiKey({ optional: true }), ingestExternalSos);

module.exports = router;
