const mongoose = require('mongoose');
const SosEvent = require('../models/SosEvent');
const User = require('../models/User');
const Headquarters = require('../models/Headquarters');

/** Helper to get io instance from app (set in server.js) */
function getIo(req) {
  return req.app.get('io');
}

/** Haversine formula to compute exact distance in km */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Extract Lat/Lng from Location string or object */
function extractCoords(loc) {
  if (typeof loc === 'object' && loc !== null) {
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      const lng = Number(loc.coordinates[0]);
      const lat = Number(loc.coordinates[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    }
    const lat = Number(loc.lat ?? loc.latitude);
    const lng = Number(loc.lng ?? loc.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };
  }

  if (typeof loc === 'string' && loc.trim()) {
    const match = loc.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const p1 = parseFloat(match[1]);
      const p2 = parseFloat(match[2]);
      if (!isNaN(p1) && !isNaN(p2) && Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
        return { lat: p1, lng: p2 };
      }
    }
  }

  return null;
}

/**
 * GET /api/admin/sos
 * Returns SOS events filtered by status (default: ACTIVE).
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
        .populate('assignedAdmin', 'displayName email photoUrl')
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
        .populate('assignedAdmin', 'displayName email photoUrl')
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
 */
async function getUsers(req, res) {
  try {
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
 */
async function removeAdmin(req, res) {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

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

/**
 * POST /api/admin/sos/auto-assign
 * Automatically calculates geographical proximity between active SOS events and available Admins/HQs,
 * then assigns each active SOS event to its closest administrative responder.
 * Body: { forceReassign?: boolean }
 */
async function autoAssignNearestAdmin(req, res) {
  try {
    const { forceReassign = false } = req.body;

    // 1. Fetch active/acknowledged SOS events
    const filter = forceReassign
      ? { status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } }
      : { status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }, assignedAdmin: null };

    const activeSosList = await SosEvent.find(filter);

    if (activeSosList.length === 0) {
      return res.status(200).json({
        message: forceReassign
          ? 'No active SOS events to assign.'
          : 'All active SOS events are already assigned.',
        assignedCount: 0
      });
    }

    // 2. Fetch approved admins
    const admins = await User.find({ role: 'ADMIN', adminApproved: true });
    if (admins.length === 0) {
      return res.status(400).json({ message: 'No approved admins available for assignment.' });
    }

    // 3. Fetch Headquarters to resolve admin locations via HQ assignment if needed
    const hqs = await Headquarters.find().populate('assignedAdmins');

    // Build map of admin ID -> location coordinates
    const adminLocationMap = new Map();

    admins.forEach((admin, idx) => {
      const adminIdStr = admin._id.toString();

      // Check admin's lastKnownLocation
      let coords = extractCoords(admin.lastKnownLocation);

      // Check assigned HQs for location
      if (!coords) {
        const assignedHq = hqs.find(hq =>
          (hq.assignedAdmins || []).some(a => (a._id || a).toString() === adminIdStr)
        );
        if (assignedHq) {
          coords = extractCoords(assignedHq.location);
        }
      }

      // Default fallback coordinates if none found
      if (!coords) {
        if (hqs.length > 0 && hqs[0].location) {
          coords = extractCoords(hqs[0].location);
        }
      }

      if (!coords) {
        // Fallback grid offset
        coords = { lat: 28.6139 + idx * 0.02, lng: 77.2090 + idx * 0.02 };
      }

      adminLocationMap.set(adminIdStr, { admin, coords });
    });

    const adminEntries = Array.from(adminLocationMap.values());
    let assignedCount = 0;
    const updatedEvents = [];
    const io = getIo(req);

    // 4. Perform distance calculations & assignments
    for (const sos of activeSosList) {
      const sosCoords = extractCoords(sos.location);
      if (!sosCoords) continue;

      let closestAdmin = null;
      let minDistance = Infinity;

      adminEntries.forEach(({ admin, coords }) => {
        const dist = getHaversineDistance(sosCoords.lat, sosCoords.lng, coords.lat, coords.lng);
        if (dist < minDistance) {
          minDistance = dist;
          closestAdmin = admin;
        }
      });

      if (closestAdmin) {
        sos.assignedAdmin = closestAdmin._id;
        await sos.save();

        const populatedSos = await SosEvent.findById(sos._id)
          .populate('triggeredBy', 'displayName email phoneNumber photoUrl')
          .populate('assignedAdmin', 'displayName email photoUrl');

        assignedCount++;
        updatedEvents.push({
          id: sos._id.toString(),
          assignedAdmin: {
            id: closestAdmin._id.toString(),
            displayName: closestAdmin.displayName,
            email: closestAdmin.email
          },
          distanceKm: Number(minDistance.toFixed(2))
        });

        // Broadcast real-time update
        if (io) {
          io.of('/sos').emit('sos:updated', {
            id: sos._id,
            assignedAdmin: {
              id: closestAdmin._id.toString(),
              displayName: closestAdmin.displayName,
              email: closestAdmin.email
            },
            status: sos.status
          });
        }
      }
    }

    return res.status(200).json({
      message: `Successfully auto-assigned ${assignedCount} SOS events to their nearest administrative responders.`,
      assignedCount,
      events: updatedEvents
    });
  } catch (error) {
    console.error('[Admin] autoAssignNearestAdmin error:', error);
    return res.status(500).json({ message: 'Failed to auto-assign nearest admin.' });
  }
}

module.exports = {
  getActiveSosEvents,
  getSosHistory,
  getUsers,
  addAdmin,
  removeAdmin,
  autoAssignNearestAdmin
};
