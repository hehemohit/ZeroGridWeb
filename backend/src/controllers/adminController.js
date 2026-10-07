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
function extractCoords(loc, fallbackIndex = 0) {
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

    // Text address keywords mapping for known locations
    const lower = loc.toLowerCase();
    if (lower.includes('dabri') || lower.includes('sitapuri') || lower.includes('palam')) {
      return { lat: 28.6080, lng: 77.0864 };
    }
    if (lower.includes('palika') || lower.includes('connaught') || lower.includes('delhi')) {
      return { lat: 28.6289, lng: 77.2195 };
    }
  }

  // Guaranteed fallback coordinates for HQ locations
  return { lat: 28.6139 + (fallbackIndex * 0.02), lng: 77.2090 + (fallbackIndex * 0.02) };
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

    await Headquarters.updateMany(
      { assignedAdmins: targetUser._id },
      { $pull: { assignedAdmins: targetUser._id } }
    );

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

    // 2. Fetch Headquarters to resolve admin locations via HQ assignment
    const hqs = await Headquarters.find().populate('assignedAdmins');
    if (hqs.length === 0) {
      return res.status(400).json({ message: 'No registered Headquarters found. Please create a Headquarters first.' });
    }

    // Collect set of admin IDs that are explicitly assigned to at least one HQ
    const hqAdminIds = new Set();
    hqs.forEach(hq => {
      (hq.assignedAdmins || []).forEach(a => {
        const aId = typeof a === 'object' && a !== null ? (a._id || a.id) : a;
        if (aId) hqAdminIds.add(aId.toString());
      });
    });

    if (hqAdminIds.size === 0) {
      return res.status(400).json({
        message: 'No admins are currently assigned to any Headquarters. Please assign admins to a Headquarters in HQ Management first.'
      });
    }

    // 3. Fetch all users assigned to any Headquarters and ensure their admin status is active
    const admins = await User.find({ _id: { $in: Array.from(hqAdminIds) } });

    if (admins.length === 0) {
      return res.status(400).json({
        message: 'Assigned admins were not found in user database. Please re-assign admins to Headquarters.'
      });
    }

    // Auto-heal admin role & approved status for HQ assigned admins
    for (const admin of admins) {
      if (admin.role !== 'ADMIN' || admin.adminApproved !== true) {
        admin.role = 'ADMIN';
        admin.adminApproved = true;
        await admin.save();
      }
    }

    // Build map of admin ID -> location coordinates (strictly from assigned HQ)
    const adminLocationMap = new Map();

    admins.forEach(admin => {
      const adminIdStr = admin._id.toString();

      // Find the HQ that this admin is assigned to
      const assignedHq = hqs.find(hq =>
        (hq.assignedAdmins || []).some(a => {
          const aId = typeof a === 'object' && a !== null ? (a._id || a.id) : a;
          return aId && aId.toString() === adminIdStr;
        })
      );

      if (assignedHq) {
        const coords = extractCoords(assignedHq.location);
        if (coords) {
          adminLocationMap.set(adminIdStr, { admin, coords, hqName: assignedHq.name });
        }
      }
    });

    if (adminLocationMap.size === 0) {
      return res.status(400).json({
        message: 'No valid headquarters coordinates found for the assigned admins.'
      });
    }

    // 4. Pre-calculate active workload for each admin to balance assignments equally
    const adminWorkload = new Map();
    admins.forEach(a => adminWorkload.set(a._id.toString(), 0));

    // Count existing active SOS assignments per admin
    const existingActiveEvents = await SosEvent.find({
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
      assignedAdmin: { $ne: null }
    });

    existingActiveEvents.forEach(e => {
      if (e.assignedAdmin) {
        const aId = e.assignedAdmin.toString();
        if (adminWorkload.has(aId)) {
          adminWorkload.set(aId, (adminWorkload.get(aId) || 0) + 1);
        }
      }
    });

    const adminEntries = Array.from(adminLocationMap.values());
    let assignedCount = 0;
    const updatedEvents = [];
    const io = getIo(req);

    // 5. Perform distance & equal workload-balanced assignments
    for (const sos of activeSosList) {
      const sosCoords = extractCoords(sos.location);
      if (!sosCoords) continue;

      let closestAdmin = null;
      let minDistance = Infinity;
      let minWorkload = Infinity;

      adminEntries.forEach(({ admin, coords }) => {
        const adminIdStr = admin._id.toString();
        const dist = getHaversineDistance(sosCoords.lat, sosCoords.lng, coords.lat, coords.lng);
        const workload = adminWorkload.get(adminIdStr) || 0;

        // 1. If strictly closer HQ/location
        if (dist < minDistance - 0.05) {
          minDistance = dist;
          minWorkload = workload;
          closestAdmin = admin;
        }
        // 2. If same HQ / equal distance (within 0.05 km), select admin with LEAST active workload to balance equally!
        else if (Math.abs(dist - minDistance) <= 0.05) {
          if (workload < minWorkload) {
            minDistance = dist;
            minWorkload = workload;
            closestAdmin = admin;
          }
        }
      });

      if (closestAdmin) {
        const closestIdStr = closestAdmin._id.toString();
        adminWorkload.set(closestIdStr, (adminWorkload.get(closestIdStr) || 0) + 1);

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

/**
 * DELETE /api/admin/sos/clear-all
 * Temporary endpoint. Deletes all existing SOS events from MongoDB.
 */
async function clearAllSosEvents(req, res) {
  try {
    const result = await SosEvent.deleteMany({});

    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:cleared', { deletedCount: result.deletedCount });
      io.of('/sos').emit('sos:updated', null);
    }

    return res.status(200).json({
      message: `Successfully cleared ${result.deletedCount} SOS events.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[Admin] clearAllSosEvents error:', error);
    return res.status(500).json({ message: 'Failed to clear SOS events.' });
  }
}

/**
 * Helper to fetch real road-snapped polylines and step leg metrics from OSRM (Open Source Routing Machine).
 * Completely free, no API key required! Uses lng,lat coordinate format.
 */
async function fetchOSRMDirections(origin, orderedWaypoints) {
  if (!origin || !orderedWaypoints || orderedWaypoints.length === 0) return null;

  try {
    const allPoints = [origin, ...orderedWaypoints];
    const coordString = allPoints
      .map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
      .join(';');

    const url = `http://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=polyline&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[OSRM] Response not OK:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('[OSRM] Routing failed with code:', data.code);
      return null;
    }

    const route = data.routes[0];
    const encodedPolyline = route.geometry;

    const legs = (route.legs || []).map(leg => ({
      distanceKm: Number((leg.distance / 1000).toFixed(2)),
      durationMin: Math.max(1, Math.round(leg.duration / 60))
    }));

    return {
      encodedPolyline,
      legs
    };
  } catch (error) {
    console.warn('[OSRM] Error fetching road route (falling back to straight-line):', error.message);
    return null;
  }
}

/** Helper to calculate composite priority score P_i for an SOS event */
function computeSosPriorityScore(sos) {
  // 1. Category Score
  const categoryScores = {
    MEDICAL: 100,
    TRAPPED: 85,
    DISASTER: 70,
    SECURITY: 50,
    OTHER: 30
  };
  const S_category = categoryScores[sos.category] || 30;

  // 2. Battery Depletion Score (100 - battery percentage)
  let S_battery = 40;
  if (sos.batteryPercentage !== undefined && sos.batteryPercentage !== null) {
    const batt = Math.max(0, Math.min(100, Number(sos.batteryPercentage)));
    S_battery = 100 - batt;
  }

  // 3. Time Elapsed Score (1 pt per minute, max 50 pts)
  const elapsedMinutes = Math.floor((Date.now() - new Date(sos.createdAt).getTime()) / (1000 * 60));
  const S_time = Math.min(50, Math.max(0, elapsedMinutes));

  return S_category + S_battery + S_time;
}

/** Permutation generator for exact TSP solver (N <= 8) */
function getPermutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = getPermutations(remaining);
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

/**
 * POST /api/admin/sos/optimize-route
 * Generates optimal rescue route sequence for an admin assigned to multiple SOS signals.
 * Body: { adminId?: string, originOverride?: { lat: number, lng: number } }
 */
async function optimizeAdminRoute(req, res) {
  try {
    const targetAdminId = req.body.adminId || req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(targetAdminId)) {
      return res.status(400).json({ message: 'Invalid Admin ID' });
    }

    const admin = await User.findById(targetAdminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    // Find active/acknowledged SOS signals assigned to this admin
    const assignedSosEvents = await SosEvent.find({
      assignedAdmin: targetAdminId,
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
    }).populate('triggeredBy', 'displayName email phoneNumber photoUrl');

    if (assignedSosEvents.length === 0) {
      return res.status(200).json({
        message: 'No active SOS signals assigned to this admin for route optimization.',
        adminId: targetAdminId,
        adminName: admin.displayName,
        totalWaypoints: 0,
        optimizedRoute: []
      });
    }

    // Resolve Origin Coordinates for Admin (HQ -> live location -> override -> fallback)
    let origin = null;
    let originName = 'Rescue Station Base';

    if (req.body.originOverride && req.body.originOverride.lat && req.body.originOverride.lng) {
      origin = {
        lat: Number(req.body.originOverride.lat),
        lng: Number(req.body.originOverride.lng)
      };
      originName = 'Tactical Position';
    }

    if (!origin) {
      // Prefer ACTIVE HQ for this admin; fall back to any assigned HQ
      const activeHqs = await Headquarters.find({
        assignedAdmins: targetAdminId,
        status: 'ACTIVE'
      }).sort({ updatedAt: -1 });

      const anyHq = activeHqs.length === 0
        ? await Headquarters.findOne({ assignedAdmins: targetAdminId }).sort({ updatedAt: -1 })
        : null;

      const resolvedHq = activeHqs[0] || anyHq;
      if (resolvedHq) {
        origin = extractCoords(resolvedHq.location);
        originName = resolvedHq.name;
      }
    }

    if (!origin) {
      origin = extractCoords(admin.lastKnownLocation);
      if (origin) originName = 'Last Known Admin Location';
    }

    if (!origin) {
      origin = { lat: 28.6139, lng: 77.2090 };
      originName = 'Base Control Center';
    }

    // Process waypoints and compute priority scores
    const waypoints = assignedSosEvents.map(sos => {
      const coords = extractCoords(sos.location) || { lat: 28.6139, lng: 77.2090 };
      const priorityScore = computeSosPriorityScore(sos);
      return {
        sos,
        sosId: sos._id.toString(),
        coords,
        priorityScore,
        category: sos.category,
        batteryPercentage: sos.batteryPercentage,
        triggeredBy: sos.triggeredBy
      };
    });

    let bestOrder = [];

    // Algorithm Selection: Exact Permutations vs Priority Ratio Heuristic
    if (waypoints.length <= 8) {
      const permutations = getPermutations(waypoints);
      let minCost = Infinity;

      for (const perm of permutations) {
        let currentCost = 0;
        let prevLoc = origin;

        perm.forEach((item, k) => {
          const dist = getHaversineDistance(prevLoc.lat, prevLoc.lng, item.coords.lat, item.coords.lng);
          const stepIndex = k + 1;
          // Cost formula: Distance penalty - Priority incentive / stepIndex
          currentCost += (dist * 1.0) - ((item.priorityScore * 0.5) / stepIndex);
          prevLoc = item.coords;
        });

        if (currentCost < minCost) {
          minCost = currentCost;
          bestOrder = perm;
        }
      }
    } else {
      // Heuristic for N > 8: Priority-Over-Distance Ratio Insertion
      const unvisited = [...waypoints];
      let currLoc = origin;

      while (unvisited.length > 0) {
        let bestIdx = 0;
        let bestRatio = Infinity;

        unvisited.forEach((item, idx) => {
          const dist = getHaversineDistance(currLoc.lat, currLoc.lng, item.coords.lat, item.coords.lng);
          const ratio = (dist + 0.1) / (item.priorityScore + 1);
          if (ratio < bestRatio) {
            bestRatio = ratio;
            bestIdx = idx;
          }
        });

        const nextItem = unvisited.splice(bestIdx, 1)[0];
        bestOrder.push(nextItem);
        currLoc = nextItem.coords;
      }
    }

    // ── Phase 2: Fetch real road-snapped polyline from OSRM (Free Directions API) ───
    const orderedCoords = bestOrder.map(item => item.coords);
    const directionsResult = await fetchOSRMDirections(origin, orderedCoords);

    // ── Build finalized ordered route response ────────────────────────────────────
    let totalDistanceKm = 0;
    let prevPoint = origin;

    const formattedRoute = bestOrder.map((item, index) => {
      // Use real road distance from Directions API legs; fall back to Haversine
      const realLeg = directionsResult?.legs?.[index];
      const stepDist = realLeg
        ? realLeg.distanceKm
        : Number(getHaversineDistance(prevPoint.lat, prevPoint.lng, item.coords.lat, item.coords.lng).toFixed(2));
      const estTravelMinutes = realLeg
        ? realLeg.durationMin
        : Math.max(2, Math.round((stepDist / 35) * 60));

      totalDistanceKm += stepDist;
      prevPoint = item.coords;

      return {
        step: index + 1,
        sosId: item.sosId,
        category: item.category,
        message: item.sos.message,
        batteryPercentage: item.batteryPercentage,
        priorityScore: item.priorityScore,
        location: {
          lat: Number(item.coords.lat.toFixed(6)),
          lng: Number(item.coords.lng.toFixed(6))
        },
        triggeredBy: item.triggeredBy ? {
          id: item.triggeredBy._id.toString(),
          displayName: item.triggeredBy.displayName || 'Unknown',
          email: item.triggeredBy.email || '',
          phoneNumber: item.triggeredBy.phoneNumber || ''
        } : null,
        distanceFromPrevKm: stepDist,
        estTravelTimeMin: estTravelMinutes,
        isRoadDistance: !!realLeg  // true = real road km, false = straight-line fallback
      };
    });

    // Total time: sum of real Directions API leg durations, else Haversine estimate
    const totalEstimatedMinutes = directionsResult?.legs
      ? directionsResult.legs.reduce((sum, l) => sum + l.durationMin, 0)
      : Math.max(3, Math.round((totalDistanceKm / 35) * 60));

    return res.status(200).json({
      message: `Successfully computed optimal rescue route for ${bestOrder.length} SOS events.`,
      adminId: targetAdminId,
      adminName: admin.displayName,
      origin: {
        name: originName,
        location: origin
      },
      totalWaypoints: bestOrder.length,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      totalEstimatedMinutes,
      // Road-snapped polyline from Directions API (null = API unavailable, fallback used)
      encodedPolyline: directionsResult?.encodedPolyline || null,
      optimizedRoute: formattedRoute
    });
  } catch (error) {
    console.error('[Admin] optimizeAdminRoute error:', error);
    return res.status(500).json({ message: 'Failed to compute optimal route.' });
  }
}

const { getSystemTelemetry } = require('../utils/metrics');

/**
 * GET /api/admin/system-stats
 * Returns real-time CPU %, Memory MB, Uptime, and Active SOS telemetry for the Web Admin Console.
 */
async function getSystemStats(req, res) {
  try {
    const stats = await getSystemTelemetry();
    return res.status(200).json(stats);
  } catch (error) {
    console.error('[Admin Controller] getSystemStats error:', error);
    return res.status(500).json({ message: 'Failed to fetch system stats.' });
  }
}

module.exports = {
  getActiveSosEvents,
  getSosHistory,
  getUsers,
  addAdmin,
  removeAdmin,
  autoAssignNearestAdmin,
  clearAllSosEvents,
  optimizeAdminRoute,
  getSystemStats
};
