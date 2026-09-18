const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const { getMe, updateMe, completeProfile } = require('../controllers/userController');

const router = express.Router();

// All /api/users/* routes require a valid JWT
router.use(verifyToken);

// GET /api/users/me — fetch current user profile
router.get('/me', getMe);

// PUT /api/users/me — update whitelisted profile fields
router.put('/me', updateMe);

// PUT /api/users/me/complete-profile — first-time profile completion (phone + DOB)
router.put('/me/complete-profile', completeProfile);

module.exports = router;
