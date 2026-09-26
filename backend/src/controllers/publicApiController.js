const mongoose = require('mongoose');
const Headquarters = require('../models/Headquarters');
const Zone = require('../models/Zone');
const SosEvent = require('../models/SosEvent');
const User = require('../models/User');

/** Haversine formula to calculate exact distance in km */
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
  return Number((R * c).toFixed(2));
}

/** Extract Lat/Lng coordinates from HQ location object or string */
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
 * GET /api/v1/public/zones/nearest
 * Public Feature API: Given any lat/lng coordinate, returns the nearest Headquarters,
 * distance in km, and associated 10-15 km Hexagonal Zone metadata.
 */
async function getNearestZone(req, res) {
  try {
    const { lat, lng } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Query parameters lat and lng are required. Example: /api/v1/public/zones/nearest?lat=28.6139&lng=77.2090'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'lat must be between -90 and 90, lng must be between -180 and 180.'
      });
    }

    const hqs = await Headquarters.find({ status: 'ACTIVE' }).populate('assignedAdmins', 'displayName email phoneNumber');

    if (hqs.length === 0) {
      return res.status(444).json({
        status: 'error',
        message: 'No active Headquarters registered in the rescue grid.'
      });
    }

    // Compute distance to each HQ
    let nearestHq = null;
    let minDistanceKm = Infinity;
    let nearestCoords = null;

    hqs.forEach((hq) => {
      const coords = extractCoords(hq.location);
      const dist = getHaversineDistance(latitude, longitude, coords.lat, coords.lng);

      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        nearestHq = hq;
        nearestCoords = coords;
      }
    });

    // Find associated 10-15 km Hexagonal Zone for nearest HQ
    let matchedZone = await Zone.findOne({ hqId: nearestHq._id });

    // Fallback: check spatial $geoIntersects
    if (!matchedZone) {
      matchedZone = await Zone.findOne({
        boundary: {
          $geoIntersects: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            }
          }
        }
      });
    }

    return res.status(200).json({
      status: 'success',
      queryLocation: { latitude, longitude },
      nearestHeadquarters: {
        id: nearestHq._id.toString(),
        name: nearestHq.name,
        distanceKm: minDistanceKm,
        coordinates: [nearestCoords.lng, nearestCoords.lat],
        assignedAdminsCount: (nearestHq.assignedAdmins || []).length
      },
      hexagonalZone: matchedZone
        ? {
            id: matchedZone._id.toString(),
            code: matchedZone.code,
            name: matchedZone.name,
            radiusKm: matchedZone.radiusKm || 12.0,
            status: matchedZone.status,
            centerCoordinates: matchedZone.center?.coordinates || [nearestCoords.lng, nearestCoords.lat]
          }
        : null,
      serviceAvailable: minDistanceKm <= 20.0
    });
  } catch (error) {
    console.error('[Public API] getNearestZone error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to resolve nearest zone.' });
  }
}

/**
 * GET /api/v1/public/sos/density
 * Public Feature API: Returns privacy-sanitized emergency incident density and risk level
 * for a given latitude, longitude, and radius.
 */
async function getSosDensity(req, res) {
  try {
    const { lat, lng, radiusKm = 25 } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Query parameters lat and lng are required.'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadiusKm = Math.min(100, Math.max(1, parseFloat(radiusKm) || 25));

    // MongoDB 2dsphere maxDistance is in meters
    const maxDistanceMeters = searchRadiusKm * 1000;

    const activeEvents = await SosEvent.find({
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] },
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistanceMeters
        }
      }
    });

    // Compute category counts
    const categoryCounts = {
      MEDICAL: 0,
      DISASTER: 0,
      TRAPPED: 0,
      SECURITY: 0,
      OTHER: 0
    };

    activeEvents.forEach((ev) => {
      const cat = ev.category && categoryCounts.hasOwnProperty(ev.category) ? ev.category : 'OTHER';
      categoryCounts[cat] += 1;
    });

    const totalActiveCount = activeEvents.length;

    let riskLevel = 'LOW';
    if (totalActiveCount >= 10) riskLevel = 'CRITICAL';
    else if (totalActiveCount >= 5) riskLevel = 'HIGH';
    else if (totalActiveCount >= 2) riskLevel = 'MODERATE';

    return res.status(200).json({
      status: 'success',
      queryLocation: { latitude, longitude },
      searchRadiusKm,
      totalActiveIncidents: totalActiveCount,
      riskLevel,
      categoryBreakdown: categoryCounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Public API] getSosDensity error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to compute SOS density.' });
  }
}

/**
 * POST /api/v1/public/sos/ingest
 * Public Feature API: External Partner SOS Ingestion Endpoint.
 * Allows verified third-party applications, wearables, IoT panic buttons, or municipal tools
 * to ingest emergency SOS pings directly into ZeroGrid's dispatch system.
 * Body: { lat, lng, sourceApp, category, message, batteryPercentage, callerPhone }
 */
async function ingestExternalSos(req, res) {
  try {
    const { lat, lng, sourceApp = 'External Partner App', category, message, batteryPercentage, callerPhone } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'lat and lng coordinates are required in JSON request body.'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'lat and lng must be valid numbers.'
      });
    }

    const VALID_CATEGORIES = ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'];
    const sosCategory = category && VALID_CATEGORIES.includes(category) ? category : 'OTHER';

    // Spatial lookup to auto-assign 10-15km Hexagonal Zone and HQ
    let resolvedZoneId = null;
    let resolvedHqId = null;
    let matchedZoneCode = null;

    try {
      const matchedZone = await Zone.findOne({
        boundary: {
          $geoIntersects: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            }
          }
        }
      });
      if (matchedZone) {
        resolvedZoneId = matchedZone._id;
        resolvedHqId = matchedZone.hqId;
        matchedZoneCode = matchedZone.code;
      }
    } catch (err) {
      console.warn('[Public Ingest] Spatial zone lookup failed:', err.message);
    }

    // Find or fallback system API bot user as trigger owner
    let botUser = await User.findOne({ email: 'partner-api@zerogrid.org' });
    if (!botUser) {
      botUser = await User.findOne({ role: 'ADMIN' });
    }

    const sosEvent = await SosEvent.create({
      triggeredBy: botUser ? botUser._id : new mongoose.Types.ObjectId(),
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      accuracyMeters: 10,
      category: sosCategory,
      message: `[Ingested via ${sourceApp}] ${message ? String(message).trim() : 'External emergency alert'}${callerPhone ? ` (Phone: ${callerPhone})` : ''}`,
      transport: 'ONLINE',
      batteryPercentage: (batteryPercentage !== undefined && !isNaN(parseInt(batteryPercentage)))
        ? Math.min(100, Math.max(0, parseInt(batteryPercentage)))
        : null,
      status: 'ACTIVE',
      zoneId: resolvedZoneId,
      hqId: resolvedHqId
    });

    // Emit live Socket.io alert to admin dispatch panels
    const io = req.app.get('io');
    if (io) {
      io.of('/sos').emit('sos:new', {
        id: sosEvent._id,
        triggeredBy: { displayName: `Partner API (${sourceApp})`, email: callerPhone || 'api@external' },
        location: sosEvent.location,
        category: sosEvent.category,
        message: sosEvent.message,
        status: sosEvent.status,
        createdAt: sosEvent.createdAt
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Emergency SOS ingested successfully into ZeroGrid dispatch network.',
      sosId: sosEvent._id.toString(),
      assignedZoneCode: matchedZoneCode || 'UNMAPPED_OUTER_SECTOR',
      dispatchStatus: 'ACTIVE',
      timestamp: sosEvent.createdAt
    });
  } catch (error) {
    console.error('[Public API] ingestExternalSos error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to ingest external SOS alert.' });
  }
}

module.exports = {
  getNearestZone,
  getSosDensity,
  ingestExternalSos
};
