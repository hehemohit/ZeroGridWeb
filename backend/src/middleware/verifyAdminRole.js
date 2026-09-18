const User = require('../models/User');

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
