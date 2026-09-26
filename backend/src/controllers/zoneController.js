const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const Headquarters = require('../models/Headquarters');
const User = require('../models/User');
const { generateHqHexGrid, generateHexagonPolygon } = require('../utils/geoUtils');

/** Helper to extract lat/lng from location */
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
      if (!isNaN(p1) && !isNaN(p2)) return { lat: p1, lng: p2 };
    }
  }
  return { lat: 28.6139, lng: 77.2090 };
}

/**
 * GET /api/zones
 * Fetch all Hexagonal Zones populated with parent HQ and assigned Zone Admins.
 */
async function getZones(req, res) {
  try {
    const { hqId } = req.query;
    const filter = {};

    if (hqId && mongoose.Types.ObjectId.isValid(hqId)) {
      filter.hqId = hqId;
    }

    const zones = await Zone.find(filter)
      .populate('hqId', 'name location status')
      .populate('assignedAdmins', 'displayName email phoneNumber photoUrl role')
      .sort({ createdAt: -1 });

    const formattedZones = zones.map(z => ({
      ...(z.toJSON ? z.toJSON() : z.toObject ? z.toObject() : z),
      id: z._id.toString()
    }));

    return res.status(200).json({ zones: formattedZones });
  } catch (error) {
    console.error('[Zone Controller] getZones error:', error);
    return res.status(500).json({ message: 'Failed to fetch zones.' });
  }
}

/**
 * POST /api/zones/generate
 * Generate a single 10-15 km Hexagonal Zone centered around an HQ.
 * Body: { hqId: string, radiusKm?: number }
 */
async function generateZonesForHq(req, res) {
  try {
    const { hqId, radiusKm = 12.0 } = req.body;

    if (!hqId || !mongoose.Types.ObjectId.isValid(hqId)) {
      return res.status(400).json({ message: 'Valid Headquarters ID is required.' });
    }

    const hq = await Headquarters.findById(hqId);
    if (!hq) {
      return res.status(404).json({ message: 'Headquarters not found.' });
    }

    const coords = extractCoords(hq.location);
    const gridSpecs = generateHqHexGrid(coords.lat, coords.lng, Number(radiusKm));

    const createdZones = [];

    for (const spec of gridSpecs) {
      const code = `ZONE-${hq.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${spec.suffix}`;

      // Check if code already exists
      let zone = await Zone.findOne({ code });
      if (!zone) {
        zone = await Zone.create({
          name: `${hq.name} ${spec.name}`,
          code,
          hqId: hq._id,
          radiusKm: Number(radiusKm),
          center: {
            type: 'Point',
            coordinates: [spec.centerLng, spec.centerLat]
          },
          boundary: spec.boundary,
          status: 'ACTIVE'
        });
      }
      createdZones.push(zone);
    }

    const populatedZones = await Zone.find({ hqId: hq._id })
      .populate('hqId', 'name location')
      .populate('assignedAdmins', 'displayName email role');

    return res.status(201).json({
      message: `Generated ${createdZones.length} Hexagonal 10-15 km zones for ${hq.name}`,
      hqId: hq._id,
      zones: populatedZones
    });
  } catch (error) {
    console.error('[Zone Controller] generateZonesForHq error:', error);
    return res.status(500).json({ message: 'Failed to generate hexagonal zones for headquarters.' });
  }
}

/**
 * POST /api/zones/:id/assign-admin
 * Assign a Zone Admin ("Small Admin") to a specific zone.
 * Body: { adminId: string }
 */
async function assignAdminToZone(req, res) {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ message: 'Invalid Zone or User ID.' });
    }

    const [zone, user] = await Promise.all([
      Zone.findById(id),
      User.findById(adminId)
    ]);

    if (!zone) return res.status(404).json({ message: 'Zone not found.' });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Ensure user role is updated to ZONE_ADMIN if currently CITIZEN or ADMIN
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'HQ_ADMIN') {
      user.role = 'ZONE_ADMIN';
      user.adminApproved = true;
    }
    user.assignedZone = zone._id;
    user.assignedHq = zone.hqId;
    await user.save();

    // Add user to zone's assignedAdmins if not present
    if (!zone.assignedAdmins.includes(user._id)) {
      zone.assignedAdmins.push(user._id);
      await zone.save();
    }

    const updatedZone = await Zone.findById(id)
      .populate('hqId', 'name location')
      .populate('assignedAdmins', 'displayName email phoneNumber role');

    return res.status(200).json({
      message: `Assigned ${user.displayName} as Zone Admin for ${zone.name}`,
      zone: updatedZone
    });
  } catch (error) {
    console.error('[Zone Controller] assignAdminToZone error:', error);
    return res.status(500).json({ message: 'Failed to assign admin to zone.' });
  }
}

/**
 * DELETE /api/zones/:id
 * Remove a zone.
 */
async function deleteZone(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Zone ID.' });
    }

    const deleted = await Zone.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Zone not found.' });

    return res.status(200).json({ message: 'Zone deleted successfully', id });
  } catch (error) {
    console.error('[Zone Controller] deleteZone error:', error);
    return res.status(500).json({ message: 'Failed to delete zone.' });
  }
}

module.exports = {
  getZones,
  generateZonesForHq,
  assignAdminToZone,
  deleteZone
};
