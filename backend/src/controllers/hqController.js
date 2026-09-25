const mongoose = require('mongoose');
const Headquarters = require('../models/Headquarters');
const User = require('../models/User');
const SosEvent = require('../models/SosEvent');

/** Helper to get io instance from app (set in server.js) */
function getIo(req) {
  return req.app.get('io');
}

/** Safe SOS payload to send over Socket.io / API responses */
function buildSosPayload(sos) {
  return {
    id: sos._id,
    triggeredBy: sos.triggeredBy,
    location: sos.location,
    accuracyMeters: sos.accuracyMeters,
    category: sos.category,
    message: sos.message,
    transport: sos.transport,
    batteryPercentage: sos.batteryPercentage !== undefined ? sos.batteryPercentage : null,
    status: sos.status,
    acknowledgedBy: sos.acknowledgedBy,
    acknowledgedByUsers: sos.acknowledgedByUsers || [],
    notes: sos.notes,
    createdAt: sos.createdAt,
    updatedAt: sos.updatedAt
  };
}

/** Extract Lat/Lng from HQ location object or string */
function extractHqCoords(location) {
  if (typeof location === 'object' && location !== null) {
    if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      const lng = Number(location.coordinates[0]);
      const lat = Number(location.coordinates[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };
    }
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) return { lat, lng };
  }

  if (typeof location === 'string' && location.trim()) {
    const match = location.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const p1 = parseFloat(match[1]);
      const p2 = parseFloat(match[2]);
      if (!isNaN(p1) && !isNaN(p2) && Math.abs(p1) <= 90 && Math.abs(p2) <= 180) {
        return { lat: p1, lng: p2 };
      }
    }
  }

  // Fallback default coordinates (New Delhi Base)
  return { lat: 28.6139, lng: 77.2090 };
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

/** Generate a coordinate within specified min and max radius in km */
function generatePointWithinRadius(lat0, lng0, minKm = 0.8, maxKm = 14.8) {
  const distanceKm = minKm + Math.random() * (maxKm - minKm);
  const bearing = Math.random() * 2 * Math.PI;

  const latRad = (lat0 * Math.PI) / 180;
  const deltaLat = (distanceKm * Math.cos(bearing)) / 111.32;
  const deltaLng = (distanceKm * Math.sin(bearing)) / (111.32 * Math.cos(latRad));

  const newLat = lat0 + deltaLat;
  const newLng = lng0 + deltaLng;
  const actualDist = getHaversineDistance(lat0, lng0, newLat, newLng);

  return {
    lat: Number(newLat.toFixed(6)),
    lng: Number(newLng.toFixed(6)),
    distanceKm: Number(actualDist.toFixed(2))
  };
}

/**
 * GET /api/admin/hq
 * List all headquarters populated with assigned admins (displayName, email, photoUrl).
 */
async function getHqs(req, res) {
  try {
    const hqs = await Headquarters.find()
      .populate('assignedAdmins', 'displayName email photoUrl role')
      .sort({ createdAt: -1 });

    const formattedHqs = hqs.map(hq => ({
      ...(hq.toJSON ? hq.toJSON() : hq.toObject ? hq.toObject() : hq),
      id: hq._id.toString()
    }));

    return res.status(200).json({ hqs: formattedHqs });
  } catch (error) {
    console.error('[HQ Controller] getHqs error:', error);
    return res.status(500).json({ message: 'Failed to fetch headquarters.' });
  }
}

/**
 * POST /api/admin/hq
 * Create a new headquarters.
 * Body: { name, location, assignedAdmins, status }
 */
async function createHq(req, res) {
  try {
    const { name, location, assignedAdmins = [], status = 'ACTIVE' } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Headquarters name is required' });
    }

    if (!location) {
      return res.status(400).json({ message: 'Location is required' });
    }

    const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    let cleanAdminIds = [];
    if (Array.isArray(assignedAdmins) && assignedAdmins.length > 0) {
      cleanAdminIds = assignedAdmins.filter(id => mongoose.Types.ObjectId.isValid(id));
    }

    const newHq = await Headquarters.create({
      name: name.trim(),
      location,
      assignedAdmins: cleanAdminIds,
      status: validStatus
    });

    const populatedHq = await Headquarters.findById(newHq._id).populate(
      'assignedAdmins',
      'displayName email photoUrl role'
    );

    const formattedHq = {
      ...(populatedHq.toJSON ? populatedHq.toJSON() : populatedHq.toObject ? populatedHq.toObject() : populatedHq),
      id: populatedHq._id.toString()
    };

    return res.status(201).json({
      message: 'Headquarters created successfully',
      hq: formattedHq
    });
  } catch (error) {
    console.error('[HQ Controller] createHq error:', error);
    return res.status(500).json({ message: 'Failed to create headquarters.' });
  }
}

/**
 * PUT /api/admin/hq/:id
 * Update an existing headquarters.
 * Body: { name, location, assignedAdmins, status }
 */
async function updateHq(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid headquarters ID' });
    }

    const hq = await Headquarters.findById(id);

    if (!hq) {
      return res.status(404).json({ message: 'Headquarters not found' });
    }

    const { name, location, assignedAdmins, status } = req.body;

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Headquarters name cannot be empty' });
      }
      hq.name = name.trim();
    }

    if (location !== undefined) {
      if (!location) {
        return res.status(400).json({ message: 'Location cannot be empty' });
      }
      hq.location = location;
    }

    if (status !== undefined) {
      if (['ACTIVE', 'INACTIVE'].includes(status)) {
        hq.status = status;
      }
    }

    if (assignedAdmins !== undefined && Array.isArray(assignedAdmins)) {
      hq.assignedAdmins = assignedAdmins.filter(id => mongoose.Types.ObjectId.isValid(id));
    }

    await hq.save();

    const updatedHq = await Headquarters.findById(id).populate(
      'assignedAdmins',
      'displayName email photoUrl role'
    );

    const formattedHq = {
      ...(updatedHq.toJSON ? updatedHq.toJSON() : updatedHq.toObject ? updatedHq.toObject() : updatedHq),
      id: updatedHq._id.toString()
    };

    return res.status(200).json({
      message: 'Headquarters updated successfully',
      hq: formattedHq
    });
  } catch (error) {
    console.error('[HQ Controller] updateHq error:', error);
    return res.status(500).json({ message: 'Failed to update headquarters.' });
  }
}

/**
 * DELETE /api/admin/hq/:id
 * Delete a headquarters.
 */
async function deleteHq(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid headquarters ID' });
    }

    const deletedHq = await Headquarters.findByIdAndDelete(id);

    if (!deletedHq) {
      return res.status(404).json({ message: 'Headquarters not found' });
    }

    return res.status(200).json({
      message: 'Headquarters deleted successfully',
      id
    });
  } catch (error) {
    console.error('[HQ Controller] deleteHq error:', error);
    return res.status(500).json({ message: 'Failed to delete headquarters.' });
  }
}

/**
 * POST /api/admin/hq/:id/mock-sos or POST /api/admin/hq/mock-sos
 * Generate mock SOS signals at varying distances within a strict 15km radius of the target Headquarters.
 * Body: { count?: number } (default 5)
 */
async function generateMockSos(req, res) {
  try {
    const { id } = req.params;
    const countParam = parseInt(req.body.count || req.query.count) || 5;
    const count = Math.min(20, Math.max(1, countParam));

    let targetHq = null;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      targetHq = await Headquarters.findById(id);
    }

    if (!targetHq) {
      // Pick the most recent Headquarters if no specific ID passed or found
      targetHq = await Headquarters.findOne().sort({ createdAt: -1 });
    }

    if (!targetHq) {
      return res.status(404).json({
        message: 'No Headquarters registered yet. Please create a Headquarters first.'
      });
    }

    const centerCoords = extractHqCoords(targetHq.location);

    const CATEGORIES = ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'];
    const TRANSPORTS = ['ONLINE', 'MESH', 'BOTH'];
    const DISTANCES_SERIES = [1.2, 3.5, 6.8, 10.4, 14.2, 2.7, 5.1, 8.9, 12.6, 14.7];

    const createdSosEvents = [];
    const io = getIo(req);

    for (let i = 0; i < count; i++) {
      const targetDistKm = DISTANCES_SERIES[i % DISTANCES_SERIES.length];
      // Generate coordinates with maximum 15km radius constraint
      const generated = generatePointWithinRadius(
        centerCoords.lat,
        centerCoords.lng,
        Math.max(0.5, targetDistKm - 0.5),
        Math.min(14.9, targetDistKm + 0.5)
      );

      const category = CATEGORIES[i % CATEGORIES.length];
      const transport = TRANSPORTS[i % TRANSPORTS.length];
      const battery = Math.floor(25 + Math.random() * 70);
      const accuracy = Math.floor(8 + Math.random() * 20);

      const sosEvent = await SosEvent.create({
        triggeredBy: req.user.userId,
        location: {
          type: 'Point',
          coordinates: [generated.lng, generated.lat] // GeoJSON [lng, lat]
        },
        accuracyMeters: accuracy,
        category,
        message: `Simulated Emergency Ping #${i + 1} (${generated.distanceKm} km from ${targetHq.name})`,
        transport,
        batteryPercentage: battery,
        status: 'ACTIVE'
      });

      const populatedSos = await SosEvent.findById(sosEvent._id).populate(
        'triggeredBy',
        'displayName email phoneNumber photoUrl'
      );

      const payload = buildSosPayload(populatedSos);
      createdSosEvents.push({
        ...payload,
        distanceFromHqKm: generated.distanceKm
      });

      // Real-time broadcast to admin Socket.io namespace
      if (io) {
        io.of('/sos').emit('sos:new', payload);
      }
    }

    return res.status(201).json({
      message: `Generated ${count} mock SOS signals within 15km radius of ${targetHq.name}`,
      hqName: targetHq.name,
      hqLocation: targetHq.location,
      centerCoordinates: centerCoords,
      maxRadiusKm: 15,
      events: createdSosEvents
    });
  } catch (error) {
    console.error('[HQ Controller] generateMockSos error:', error);
    return res.status(500).json({ message: 'Failed to generate mock SOS signals.' });
  }
}

module.exports = {
  getHqs,
  createHq,
  updateHq,
  deleteHq,
  generateMockSos
};
