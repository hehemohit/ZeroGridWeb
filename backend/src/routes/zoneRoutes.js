const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  getZones,
  generateZonesForHq,
  assignAdminToZone,
  deleteZone
} = require('../controllers/zoneController');

const router = express.Router();

// All Zone routes require: (1) valid JWT, (2) DB-verified Admin role
router.use(verifyToken, verifyAdminRole);

// GET /api/admin/zones - List all Hexagonal Zones
router.get('/', getZones);

// POST /api/admin/zones/generate - Generate 10-15km Hexagonal honeycomb grid around an HQ
router.post('/generate', generateZonesForHq);

// POST /api/admin/zones/:id/assign-admin - Assign a Zone Admin ("Small Admin")
router.post('/:id/assign-admin', assignAdminToZone);

// DELETE /api/admin/zones/:id - Delete a Zone
router.delete('/:id', deleteZone);

module.exports = router;
