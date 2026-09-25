const express = require('express');
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  triggerSos,
  getSosById,
  getActiveSos,
  acknowledgeSos,
  getAcknowledgedSosForUser,
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

// GET /api/sos/active — active alerts visible to the authenticated user
router.get('/active', verifyToken, getActiveSos);

// GET /api/sos/acknowledged — SOS events this user has personally acknowledged (history)
router.get('/acknowledged', verifyToken, getAcknowledgedSosForUser);

// GET /api/sos/:id — get a single SOS event (creator or admin only)
router.get('/:id', verifyToken, getSosById);

// PUT /api/sos/:id/acknowledge — any authenticated relative / contact / responder can acknowledge
// Removed verifyAdminRole: relatives and local responders must be able to acknowledge.
// Body: { confirmedSafe: boolean }
//   true  = relative SOS: "Are you sure he/she is safe?"
//   false = local area SOS: "Are you sure the surrounding area / peer is attended to?"
router.put('/:id/acknowledge', verifyToken, acknowledgeSos);

// PUT /api/sos/:id/resolve — admin only: mark as fully resolved
router.put('/:id/resolve', verifyToken, verifyAdminRole, resolveSos);

// POST /api/sos/:id/notes — admin only: append a case note
router.post('/:id/notes', verifyToken, verifyAdminRole, addNoteToSos);

module.exports = router;
