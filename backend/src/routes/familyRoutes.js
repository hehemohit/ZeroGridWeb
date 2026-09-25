const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const {
  sendLinkRequest,
  acceptLink,
  revokeLink,
  getChildLocation,
  getMyLinks
} = require('../controllers/familyController');

const router = express.Router();

// All family routes require a valid JWT
router.use(verifyToken);

// GET /api/family/links — list all my family links (as parent or child)
router.get('/links', getMyLinks);

// POST /api/family/link-request — parent initiates link to a child by email
router.post('/link-request', sendLinkRequest);

// PUT /api/family/link/:id/accept — child accepts a pending link request
router.put('/link/:id/accept', acceptLink);

// PUT /api/family/link/:id/revoke — either party revokes an active link
router.put('/link/:id/revoke', revokeLink);

// GET /api/family/child/:childId/location — parent fetches child's last location
// SECURITY: Re-verifies accepted link on every call inside the controller
router.get('/child/:childId/location', getChildLocation);

module.exports = router;
