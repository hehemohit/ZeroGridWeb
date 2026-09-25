const mongoose = require('mongoose');
const SosEvent = require('../models/SosEvent');
const User = require('../models/User');

/**
 * GET /api/admin/sos
 * Returns SOS events filtered by status (default: ACTIVE).
 * Supports ?status=ACTIVE|ACKNOWLEDGED|RESOLVED and ?page, ?limit for pagination.
 * Admin only.
 */
async function getActiveSosEvents(req, res) {
  try {
    const { status = 'ACTIVE', page = 1, limit = 50 } = req.query;

    const VALID_STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];
    const filterStatus = VALID_STATUSES.includes(status) ? status : 'ACTIVE';

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      SosEvent.find({ status: filterStatus })
        .populate('triggeredBy', 'displayName email phoneNumber photoUrl')
        .populate('acknowledgedBy', 'displayName email')
        .populate('resolvedBy', 'displayName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      SosEvent.countDocuments({ status: filterStatus })
    ]);

    const formattedEvents = events.map(ev => ({
      ...(ev.toJSON ? ev.toJSON() : ev.toObject ? ev.toObject() : ev),
      id: ev._id.toString()
    }));

    return res.status(200).json({
      events: formattedEvents,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin] getActiveSosEvents error:', error);
    return res.status(500).json({ message: 'Failed to fetch SOS events.' });
  }
}

/**
 * GET /api/admin/sos/history
 * Returns RESOLVED SOS events, paginated, with optional date range filters.
 * Query: ?page, ?limit, ?from (ISO date), ?to (ISO date)
 * Admin only.
 */
async function getSosHistory(req, res) {
  try {
    const { page = 1, limit = 20, from, to, category } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = { status: 'RESOLVED' };

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const VALID_CATEGORIES = ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'];
    if (category && VALID_CATEGORIES.includes(category)) {
      filter.category = category;
    }

    const [events, total] = await Promise.all([
      SosEvent.find(filter)
        .populate('triggeredBy', 'displayName email phoneNumber')
        .populate('acknowledgedBy', 'displayName email')
        .populate('resolvedBy', 'displayName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      SosEvent.countDocuments(filter)
    ]);

    const formattedEvents = events.map(ev => ({
      ...(ev.toJSON ? ev.toJSON() : ev.toObject ? ev.toObject() : ev),
      id: ev._id.toString()
    }));

    return res.status(200).json({
      events: formattedEvents,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin] getSosHistory error:', error);
    return res.status(500).json({ message: 'Failed to fetch SOS history.' });
  }
}

/**
 * GET /api/admin/users
 * User directory search. Super-admin only.
 * Query: ?q (search by name/email), ?page, ?limit
 */
async function getUsers(req, res) {
  try {
    // Super-admin check (re-verified from DB in verifyAdminRole, but check role value)
    if (req.dbUser && req.dbUser.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Super-admin access required' });
    }

    const { q = '', page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const searchFilter = q.trim()
      ? {
          $or: [
            { displayName: { $regex: q.trim(), $options: 'i' } },
            { email: { $regex: q.trim(), $options: 'i' } }
          ]
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(searchFilter)
        .select('-passwordHash -fcmToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(searchFilter)
    ]);

    const formattedUsers = users.map(u => ({
      ...(u.toJSON ? u.toJSON() : u.toObject ? u.toObject() : u),
      id: u._id.toString()
    }));

    return res.status(200).json({
      users: formattedUsers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin] getUsers error:', error);
    return res.status(500).json({ message: 'Failed to fetch users.' });
  }
}

/**
 * POST /api/admin/admins
 * Promotes an existing user to ADMIN + sets adminApproved: true.
 * Super-admin only.
 * Body: { email } — the email of the user to promote
 */
async function addAdmin(req, res) {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'email is required' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase().trim() });

    if (!targetUser) {
      return res.status(404).json({ message: 'No user found with this email' });
    }

    if (targetUser.role === 'ADMIN' && targetUser.adminApproved === true) {
      return res.status(409).json({ message: 'User is already an approved admin' });
    }

    targetUser.role = 'ADMIN';
    targetUser.adminApproved = true;
    await targetUser.save();

    return res.status(200).json({
      message: `${targetUser.displayName} (${targetUser.email}) has been promoted to admin`,
      user: {
        id: targetUser._id,
        displayName: targetUser.displayName,
        email: targetUser.email,
        role: targetUser.role,
        adminApproved: targetUser.adminApproved
      }
    });
  } catch (error) {
    console.error('[Admin] addAdmin error:', error);
    return res.status(500).json({ message: 'Failed to add admin.' });
  }
}

/**
 * DELETE /api/admin/admins/:userId
 * Revokes admin status, demotes back to CITIZEN.
 * Super-admin only. Cannot self-demote.
 */
async function removeAdmin(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    // Prevent self-demotion
    if (userId === req.user.userId) {
      return res.status(400).json({ message: 'You cannot revoke your own admin status' });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (targetUser.role !== 'ADMIN') {
      return res.status(400).json({ message: 'User is not an admin' });
    }

    targetUser.role = 'CITIZEN';
    targetUser.adminApproved = null;
    await targetUser.save();

    return res.status(200).json({
      message: `${targetUser.displayName} has been demoted to CITIZEN`,
      userId
    });
  } catch (error) {
    console.error('[Admin] removeAdmin error:', error);
    return res.status(500).json({ message: 'Failed to remove admin.' });
  }
}

module.exports = {
  getActiveSosEvents,
  getSosHistory,
  getUsers,
  addAdmin,
  removeAdmin
};
