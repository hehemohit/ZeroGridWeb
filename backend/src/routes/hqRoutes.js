const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  getHqs,
  createHq,
  updateHq,
  deleteHq,
  generateMockSos
} = require('../controllers/hqController');

const router = express.Router();

// All HQ admin routes require: (1) valid JWT, (2) DB-verified ADMIN role + adminApproved: true
router.use(verifyToken, verifyAdminRole);

// GET /api/admin/hq - List all HQs
router.get('/', getHqs);

// POST /api/admin/hq - Create new HQ
router.post('/', createHq);

// POST /api/admin/hq/mock-sos - Generate mock SOS signals <= 15km from default/latest HQ
router.post('/mock-sos', generateMockSos);

// POST /api/admin/hq/:id/mock-sos - Generate mock SOS signals <= 15km from specific HQ
router.post('/:id/mock-sos', generateMockSos);

// PUT /api/admin/hq/:id - Update HQ or modify assigned admins
router.put('/:id', updateHq);

// DELETE /api/admin/hq/:id - Remove an HQ
router.delete('/:id', deleteHq);

module.exports = router;
