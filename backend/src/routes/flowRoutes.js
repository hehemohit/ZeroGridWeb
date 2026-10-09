/**
 * ZeroGrid Autonomous Flow Routes
 * Routes for executing and testing the multi-agent negotiation pipeline.
 */

const express = require('express');
const { getScenarioPresets, executeFlowPipeline } = require('../controllers/flowController');

const router = express.Router();

/**
 * GET /api/flow/presets
 * Returns interactive scenario presets for the /flow test bench.
 */
router.get('/presets', getScenarioPresets);

/**
 * POST /api/flow/run
 * Executes the multi-agent negotiation pipeline with real-time Socket.io step broadcasts.
 */
router.post('/run', executeFlowPipeline);

module.exports = router;
