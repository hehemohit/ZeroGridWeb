const User = require('../models/User');

/**
 * verifyAdminRole middleware
 *
 * Checks that the JWT payload claims ADMIN role, then re-fetches the user
 * from MongoDB to confirm the role and adminApproved status in real time.
 * This ensures immediate revocation works — a demoted admin's old JWT
 * is rejected on the very next request.
 *
 * Must be used AFTER verifyToken (depends on req.user being set).
 */
async function verifyAdminRole(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      message: 'Forbidden: Admin access required'
    });
  }

  try {
    // Re-fetch fresh user record from MongoDB to avoid trusting stale JWT payload
    const user = await User.findById(req.user.userId);

    if (!user || user.role !== 'ADMIN' || user.adminApproved !== true) {
      return res.status(403).json({
        message: 'Forbidden: Admin account pending approval or unauthorized'
      });
    }

    // Attach fresh DB user so downstream handlers can use it (e.g. for role checks)
    req.dbUser = user;
    next();
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return res.status(500).json({
      message: 'Internal server error verifying authorization'
    });
  }
}

module.exports = verifyAdminRole;
