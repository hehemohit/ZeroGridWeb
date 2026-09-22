const express = require('express');
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  triggerSos,
  getSosById,
  getActiveSos,
  acknowledgeSos,
  resolveSos,
  addNoteToSos
} = require('../controllers/sosController');

const router = express.Router();

// SOS rate limiter: max 2 requests per 30 seconds per IP.
// Combined with JWT auth this gives effective per-user throttling.
// Prevents accidental duplicate dispatches from flooding the admin panel.
// The Android WorkManager retry logic works via a queue so the 30s window
// won't interfere with legitimate offline-retry behavior.
// validate.xForwardedForHeader is disabled because we configure trust proxy
// at the app level (app.set('trust proxy', 1)) in server.js.
const sosRateLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    message: 'SOS rate limit exceeded. Please wait 30 seconds before sending another alert.'
  }
});

// POST /api/sos — trigger a new SOS event (authenticated + rate-limited)
router.post('/', verifyToken, sosRateLimiter, triggerSos);

// GET /api/sos/active — active alerts for contacts/users/network
router.get('/active', verifyToken, getActiveSos);

// GET /api/sos/:id — get a single SOS event (creator or admin only)
router.get('/:id', verifyToken, getSosById);

// PUT /api/sos/:id/acknowledge — admin: mark as acknowledged
router.put('/:id/acknowledge', verifyToken, verifyAdminRole, acknowledgeSos);

// PUT /api/sos/:id/resolve — admin: mark as resolved
router.put('/:id/resolve', verifyToken, verifyAdminRole, resolveSos);

// POST /api/sos/:id/notes — admin: append a case note
router.post('/:id/notes', verifyToken, verifyAdminRole, addNoteToSos);

module.exports = router;
