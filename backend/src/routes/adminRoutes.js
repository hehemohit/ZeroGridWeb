const express = require('express');
const verifyToken = require('../middleware/verifyToken');
const verifyAdminRole = require('../middleware/verifyAdminRole');
const {
  getActiveSosEvents,
  getSosHistory,
  getUsers,
  addAdmin,
  removeAdmin,
  autoAssignNearestAdmin
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require: (1) valid JWT, (2) DB-verified ADMIN role + adminApproved: true
router.use(verifyToken, verifyAdminRole);

// GET /api/admin/sos?status=ACTIVE — live SOS event list for the map
// Must be BEFORE /sos/:id style routes to avoid "history" being treated as an ID
router.get('/sos/history', getSosHistory);
router.get('/sos', getActiveSosEvents);

// POST /api/admin/sos/auto-assign — Auto-assign active SOS events to nearest admin responder
router.post('/sos/auto-assign', autoAssignNearestAdmin);

// GET /api/admin/users?q=search — user directory search (any approved admin)
router.get('/users', getUsers);

// POST /api/admin/admins — promote a user to admin (any approved admin can do this)
router.post('/admins', addAdmin);

// DELETE /api/admin/admins/:userId — revoke admin status
router.delete('/admins/:userId', removeAdmin);

module.exports = router;
