const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { getDetourRoute } = require('../controllers/sosController');

const router = express.Router();

// POST /api/routes/detour - calculate safe route bypassing active waterlogging hazards via AWS Strands Agent
router.post('/detour', verifyToken, getDetourRoute);

module.exports = router;
