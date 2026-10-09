const mongoose = require('mongoose');
const SosEvent = require('../models/SosEvent');
const User = require('../models/User');
const Contact = require('../models/Contact');
const Headquarters = require('../models/Headquarters');
const Zone = require('../models/Zone');
const { sendSosPush } = require('../utils/fcm');
const strandsRouterAgent = require('../utils/strandsRouterAgent');
const { triggerAgentZeroOrchestrationAsync } = require('../utils/agentZeroWebhook');

/** Helper to get io instance from app (set in server.js) */
function getIo(req) {
  return req.app.get('io');
}

/** Safe SOS payload to send over Socket.io / API responses */
function buildSosPayload(sos, requestingUserId) {
  const isAcknowledgedByMe = requestingUserId
    ? (sos.acknowledgedByUsers || []).some(
        (a) => a.userId && a.userId.toString() === requestingUserId.toString()
      )
    : false;

  let assignedAdminData = null;
  if (sos.assignedAdmin) {
    if (typeof sos.assignedAdmin === 'object' && (sos.assignedAdmin._id || sos.assignedAdmin.id)) {
      assignedAdminData = {
        id: (sos.assignedAdmin._id || sos.assignedAdmin.id).toString(),
        displayName: sos.assignedAdmin.displayName || sos.assignedAdmin.email || 'Admin',
        email: sos.assignedAdmin.email || '',
        photoUrl: sos.assignedAdmin.photoUrl || ''
      };
    } else {
      assignedAdminData = sos.assignedAdmin.toString();
    }
  }

  return {
    id: sos._id,
    triggeredBy: sos.triggeredBy,
    location: sos.location,
    accuracyMeters: sos.accuracyMeters,
    category: sos.category,
    message: sos.message,
    transport: sos.transport,
    batteryPercentage: sos.batteryPercentage !== undefined ? sos.batteryPercentage : null,
    waterDepthCm: sos.waterDepthCm !== undefined ? sos.waterDepthCm : 0,
    passability: sos.passability || 'ALL_PASSABLE',
    packetId: sos.packetId || null,
    relayedByMule: !!sos.relayedByMule,
    status: sos.status,
    acknowledgedBy: sos.acknowledgedBy,
    acknowledgedByUsers: sos.acknowledgedByUsers || [],
    isAcknowledgedByMe,
    resolvedBy: sos.resolvedBy,
    assignedAdmin: assignedAdminData,
    affectedNodeId: sos.affectedNodeId || null,
    agentZeroAdvisory: sos.agentZeroAdvisory || null,
    notes: sos.notes,
    createdAt: sos.createdAt,
    updatedAt: sos.updatedAt
  };
}

/**
 * POST /api/sos
 * Creates a new SOS event, emits Socket.io event to admin namespace,
 * and fires FCM push to all of the user's emergency contacts.
 *
 * Body: { lat, lng, accuracy, category, message, transport, batteryPercentage, waterDepthCm, passability, packetId, relayedByMule }
 */
async function triggerSos(req, res) {
  try {
    const {
      lat,
      lng,
      accuracy,
      category,
      message,
      transport,
      batteryPercentage,
      waterDepthCm,
      passability,
      packetId,
      relayedByMule
    } = req.body;

    // Validate coordinates
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'lat and lng coordinates are required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ message: 'lat and lng must be valid numbers' });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: 'lat must be between -90 and 90' });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'lng must be between -180 and 180' });
    }

    // Packet ID deduplication check (from mesh or data mule)
    if (packetId) {
      const existingPacket = await SosEvent.findOne({ packetId }).populate({
        path: 'triggeredBy',
        select: 'displayName email phoneNumber photoUrl'
      });
      if (existingPacket) {
        return res.status(200).json({
          message: 'Duplicate packet - returning existing event',
          sos: buildSosPayload(existingPacket, req.user.userId)
        });
      }
    }

    // Validate category if provided
    const VALID_CATEGORIES = [
      'WATERLOGGING',
      'SUBMERGED_UNDERPASS',
      'DRAINAGE_OVERFLOW',
      'HEATWAVE',
      'FALLEN_GRID',
      'MEDICAL',
      'DISASTER',
      'TRAPPED',
      'SECURITY',
      'OTHER'
    ];
    const sosCategory = category && VALID_CATEGORIES.includes(category) ? category : 'OTHER';

    // Validate passability if provided
    const VALID_PASSABILITY = ['ALL_PASSABLE', 'HIGH_CLEARANCE_ONLY', 'PEDESTRIAN_ONLY', 'IMPASSABLE'];
    const sosPassability = passability && VALID_PASSABILITY.includes(passability) ? passability : 'ALL_PASSABLE';
    const sosWaterDepth = !isNaN(parseInt(waterDepthCm)) ? Math.max(0, parseInt(waterDepthCm)) : 0;

    // Validate transport if provided
    const VALID_TRANSPORTS = ['ONLINE', 'MESH', 'BOTH'];
    const sosTransport = transport && VALID_TRANSPORTS.includes(transport) ? transport : 'ONLINE';

    // Deduplication check: if this user created an ACTIVE SOS within the last 15 seconds,
    // return the existing event instead of creating a duplicate document & duplicate admin notification.
    const recentDuplicate = await SosEvent.findOne({
      triggeredBy: req.user.userId,
      status: 'ACTIVE',
      createdAt: { $gte: new Date(Date.now() - 15000) }
    }).populate({
      path: 'triggeredBy',
      select: 'displayName email phoneNumber photoUrl'
    });

    if (recentDuplicate) {
      return res.status(200).json({
        message: 'SOS already dispatched recently (deduplicated)',
        sos: buildSosPayload(recentDuplicate, req.user.userId)
      });
    }

    // Perform spatial lookup to auto-assign 10-15km Hexagonal Zone and HQ
    let resolvedZoneId = null;
    let resolvedHqId = null;
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
      }
    } catch (spatialErr) {
      console.warn('[SOS Controller] Spatial zone resolution skipped:', spatialErr.message);
    }

    // Create the SOS event document
    const sosEvent = await SosEvent.create({
      triggeredBy: req.user.userId,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON: [lng, lat]
      },
      accuracyMeters: accuracy ? parseFloat(accuracy) : null,
      category: sosCategory,
      message: message ? String(message).trim() : '',
      transport: sosTransport,
      batteryPercentage: (batteryPercentage !== undefined && batteryPercentage !== null && !isNaN(parseInt(batteryPercentage)))
        ? Math.min(100, Math.max(0, parseInt(batteryPercentage)))
        : null,
      waterDepthCm: sosWaterDepth,
      passability: sosPassability,
      packetId: packetId || null,
      relayedByMule: !!relayedByMule,
      status: 'ACTIVE',
      zoneId: resolvedZoneId,
      hqId: resolvedHqId
    });

    // Populate triggeredBy for the response and Socket.io payload
    const populatedSos = await SosEvent.findById(sosEvent._id).populate({
      path: 'triggeredBy',
      select: 'displayName email phoneNumber photoUrl'
    });

    // Emit to admin Socket.io namespace (/sos) immediately after save
    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:new', buildSosPayload(populatedSos));
    }

    // 1. Prepare and send the HTTP response first so the SOS creator's request does not wait on push delivery
    res.status(201).json({
      message: 'SOS dispatched successfully',
      sos: buildSosPayload(populatedSos, req.user.userId)
    });

    // 2. Trigger Agent Zero Autonomous Multi-Agent Orchestration asynchronously for flood/grid hazards
    triggerAgentZeroOrchestrationAsync(populatedSos, io);

    // 3. Fire FCM push to all linked emergency contacts asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        const contacts = await Contact.find({ ownerId: req.user.userId }).populate({
          path: 'contactUserId',
          select: 'fcmToken displayName'
        });

        // Filter contacts that have a linked registered user with an FCM token
        const contactsToPush = contacts.filter(
          (c) => c.contactUserId && c.contactUserId.fcmToken
        );

        if (contactsToPush.length > 0) {
          const senderName = populatedSos.triggeredBy?.displayName || 'Someone';

          const pushPromises = contactsToPush.map((contact) =>
            sendSosPush({
              fcmToken: contact.contactUserId.fcmToken,
              senderName,
              category: sosCategory,
              message: message ? String(message).trim() : '',
              sosId: sosEvent._id,
              lat: latitude,
              lng: longitude
            })
          );

          const results = await Promise.allSettled(pushPromises);
          const succeeded = results.filter(
            (r) => r.status === 'fulfilled' && r.value && r.value.success
          ).length;

          console.log(
            `[SOS ${sosEvent._id}]: pushed to ${succeeded}/${contactsToPush.length} contacts`
          );
        }
      } catch (pushErr) {
        // Push failures must never crash the server
        console.error(
          `[SOS ${sosEvent._id}]: FCM push dispatch failed (non-fatal):`,
          pushErr.message
        );
      }
    });

    return;
  } catch (error) {
    console.error('[SOS] triggerSos error:', error);
    return res.status(500).json({ message: 'Failed to dispatch SOS. Please try again.' });
  }
}

/**
 * POST /api/sos/bulk-mule
 * Batch upload from Data Mule devices carrying queued offline mesh packets.
 * Body: { packets: Array<{ lat, lng, accuracy, category, message, waterDepthCm, passability, packetId, batteryPercentage, transport }> }
 */
async function bulkMuleUpload(req, res) {
  try {
    const { packets } = req.body;

    if (!Array.isArray(packets) || packets.length === 0) {
      return res.status(400).json({ message: 'packets must be a non-empty array' });
    }

    if (packets.length > 200) {
      return res.status(400).json({ message: 'Maximum 200 packets allowed per batch upload' });
    }

    const VALID_CATEGORIES = [
      'WATERLOGGING',
      'SUBMERGED_UNDERPASS',
      'DRAINAGE_OVERFLOW',
      'HEATWAVE',
      'FALLEN_GRID',
      'MEDICAL',
      'DISASTER',
      'TRAPPED',
      'SECURITY',
      'OTHER'
    ];
    const VALID_PASSABILITY = ['ALL_PASSABLE', 'HIGH_CLEARANCE_ONLY', 'PEDESTRIAN_ONLY', 'IMPASSABLE'];

    // Extract unique packetIds from input
    const incomingPacketIds = packets.map((p) => p.packetId).filter(Boolean);
    const existingDocs = incomingPacketIds.length > 0
      ? await SosEvent.find({ packetId: { $in: incomingPacketIds } }).select('packetId').lean()
      : [];
    const existingSet = new Set(existingDocs.map((d) => d.packetId));

    const newDocsToInsert = [];
    let duplicatesSkipped = 0;

    for (const p of packets) {
      if (p.packetId && existingSet.has(p.packetId)) {
        duplicatesSkipped++;
        continue;
      }

      const lat = parseFloat(p.lat);
      const lng = parseFloat(p.lng);
      if (isNaN(lat) || isNaN(lng)) continue;

      const cat = p.category && VALID_CATEGORIES.includes(p.category) ? p.category : 'OTHER';
      const pass = p.passability && VALID_PASSABILITY.includes(p.passability) ? p.passability : 'ALL_PASSABLE';
      const depth = !isNaN(parseInt(p.waterDepthCm)) ? Math.max(0, parseInt(p.waterDepthCm)) : 0;

      newDocsToInsert.push({
        triggeredBy: req.user.userId,
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        accuracyMeters: p.accuracy ? parseFloat(p.accuracy) : null,
        category: cat,
        message: p.message ? String(p.message).trim() : '',
        transport: 'MESH',
        relayedByMule: true,
        waterDepthCm: depth,
        passability: pass,
        packetId: p.packetId || null,
        batteryPercentage: (!isNaN(parseInt(p.batteryPercentage))) ? Math.min(100, Math.max(0, parseInt(p.batteryPercentage))) : null,
        status: 'ACTIVE'
      });

      if (p.packetId) existingSet.add(p.packetId);
    }

    let insertedCount = 0;
    let insertedEvents = [];
    if (newDocsToInsert.length > 0) {
      insertedEvents = await SosEvent.insertMany(newDocsToInsert, { ordered: false });
      insertedCount = insertedEvents.length;

      const io = getIo(req);
      if (io) {
        for (const event of insertedEvents) {
          io.of('/sos').emit('sos:new', buildSosPayload(event));
          triggerAgentZeroOrchestrationAsync(event, io);
        }
      }
    }

    return res.status(200).json({
      message: 'Data mule bulk upload complete',
      inserted: insertedCount,
      duplicatesSkipped: duplicatesSkipped + (packets.length - newDocsToInsert.length - duplicatesSkipped)
    });
  } catch (error) {
    console.error('[SOS] bulkMuleUpload error:', error);
    return res.status(500).json({ message: 'Failed to process bulk mule upload' });
  }
}

/**
 * POST /api/routes/detour
 * Computes safe route around active flood/water hazards using AWS Strands Agent.
 * Body: { originLat, originLng, destLat, destLng, origin, originName, destination, destName }
 */
async function getDetourRoute(req, res) {
  try {
    let { originLat, originLng, destLat, destLng, origin, originName, destination, destName } = req.body;

    // Resolve Origin by landmark / place name if coordinates were omitted
    const targetOriginName = origin || originName;
    if ((originLat === undefined || originLng === undefined) && targetOriginName && typeof targetOriginName === 'string') {
      const resolvedOrigin = await strandsRouterAgent.geocodePlaceName(targetOriginName);
      if (resolvedOrigin) {
        originLat = resolvedOrigin.lat;
        originLng = resolvedOrigin.lng;
      }
    }

    // Resolve Destination by landmark / place name if coordinates were omitted
    const targetDestName = destination || destName;
    if ((destLat === undefined || destLng === undefined) && targetDestName && typeof targetDestName === 'string') {
      const resolvedDest = await strandsRouterAgent.geocodePlaceName(targetDestName);
      if (resolvedDest) {
        destLat = resolvedDest.lat;
        destLng = resolvedDest.lng;
      }
    }

    if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
      return res.status(400).json({
        message: 'originLat, originLng, destLat, and destLng are required (or supply valid origin/destination place names)'
      });
    }

    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
      return res.status(400).json({ message: 'Coordinates must be valid numbers' });
    }

    const detourData = await strandsRouterAgent.getDetour(oLat, oLng, dLat, dLng);
    return res.status(200).json(detourData);
  } catch (error) {
    console.error('[Route] getDetourRoute error:', error);
    return res.status(500).json({ message: 'Failed to calculate safe detour route' });
  }
}

/**
 * POST /api/sos/:id/brief
 * Generates tactical municipal & disaster response brief via AWS Strands Agent.
 */
async function generateSituationBrief(req, res) {
  try {
    const { id } = req.params;
    let sos = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      sos = await SosEvent.findById(id).lean();
    }

    if (!sos) {
      const cleanSuffix = String(id).replace(/^sos-/, '').trim();
      sos = await SosEvent.findOne({
        $or: [
          { packetId: id },
          { packetId: cleanSuffix },
          { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: cleanSuffix + '$', options: 'i' } } }
        ]
      }).lean();
    }

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found' });
    }

    const brief = await strandsRouterAgent.getSituationBrief(sos);
    return res.status(200).json({
      ...brief,
      brief
    });
  } catch (error) {
    console.error('[SOS] generateSituationBrief error:', error);
    return res.status(500).json({ message: 'Failed to generate situation brief' });
  }
}

/**
 * GET /api/sos/:id
 * Returns a single SOS event. Only the event creator or an admin can access this route.
 */
async function getSosById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    const sos = await SosEvent.findById(id)
      .populate({
        path: 'triggeredBy',
        select: 'displayName email phoneNumber photoUrl'
      })
      .populate({
        path: 'assignedAdmin',
        select: 'displayName email photoUrl'
      });

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found' });
    }

    // Only the creator or an admin can view the details
    if (
      sos.triggeredBy._id.toString() !== req.user.userId &&
      req.user.role !== 'ADMIN'
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    return res.status(200).json({ sos: buildSosPayload(sos, req.user.userId) });
  } catch (error) {
    console.error('[SOS] getSosById error:', error);
    return res.status(500).json({ message: 'Failed to fetch SOS event.' });
  }
}

/**
 * PUT /api/sos/:id/acknowledge
 * Any authenticated user (relative, contact, local responder) can acknowledge an SOS.
 * Tracks per-user acknowledgments in acknowledgedByUsers[].
 * Body: { confirmedSafe?: boolean }
 */
async function acknowledgeSos(req, res) {
  try {
    const { id } = req.params;
    const confirmedSafe =
      req.body.confirmedSafe !== undefined ? Boolean(req.body.confirmedSafe) : true;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    const existing = await SosEvent.findById(id).select('acknowledgedByUsers status');
    if (!existing) {
      return res.status(404).json({ message: 'SOS event not found' });
    }
    if (existing.status === 'RESOLVED') {
      return res.status(400).json({ message: 'SOS event is already resolved' });
    }

    const alreadyAcked = (existing.acknowledgedByUsers || []).some(
      (a) => a.userId && a.userId.toString() === req.user.userId
    );

    if (alreadyAcked) {
      const sos = await SosEvent.findById(id).populate(
        'triggeredBy',
        'displayName email phoneNumber photoUrl'
      );
      return res.status(200).json({
        message: 'Already acknowledged by you',
        sos: buildSosPayload(sos, req.user.userId)
      });
    }

    const ackEntry = {
      userId: req.user.userId,
      displayName: req.user.displayName || req.user.email || 'Unknown',
      confirmedSafe,
      acknowledgedAt: new Date()
    };

    const updateOp = {
      $push: { acknowledgedByUsers: ackEntry },
      $set: { status: 'ACKNOWLEDGED' }
    };
    if (!existing.acknowledgedByUsers || existing.acknowledgedByUsers.length === 0) {
      updateOp.$set.acknowledgedBy = req.user.userId;
    }

    const sos = await SosEvent.findByIdAndUpdate(id, updateOp, {
      returnDocument: 'after'
    }).populate('triggeredBy', 'displayName email phoneNumber photoUrl');

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found or failed to update' });
    }

    // Notify admin panel of the status update
    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:updated', buildSosPayload(sos));
    }

    return res.status(200).json({
      message: confirmedSafe
        ? 'SOS acknowledged - person confirmed safe'
        : 'SOS acknowledged - situation attended to',
      sos: buildSosPayload(sos, req.user.userId)
    });
  } catch (error) {
    console.error('[SOS] acknowledgeSos error:', error);
    return res.status(500).json({ message: 'Failed to acknowledge SOS event.' });
  }
}

/**
 * GET /api/sos/acknowledged
 * Returns SOS events that the requesting user has personally acknowledged.
 * Populates the "Acknowledged SOS History" section in the Android app.
 */
async function getAcknowledgedSosForUser(req, res) {
  try {
    const acknowledgedEvents = await SosEvent.find({
      'acknowledgedByUsers.userId': req.user.userId
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate({ path: 'triggeredBy', select: 'displayName email phoneNumber photoUrl' });

    return res.status(200).json({
      events: acknowledgedEvents.map((e) => buildSosPayload(e, req.user.userId))
    });
  } catch (error) {
    console.error('[SOS] getAcknowledgedSosForUser error:', error);
    return res.status(500).json({ message: 'Failed to fetch acknowledged SOS events.' });
  }
}

/**
 * PUT /api/sos/:id/resolve
 * Admin only. Transitions status to RESOLVED.
 */
async function resolveSos(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    const sos = await SosEvent.findOneAndUpdate(
      { _id: id, status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } },
      {
        $set: {
          status: 'RESOLVED',
          resolvedBy: req.user.userId
        }
      },
      { returnDocument: 'after' }
    ).populate('triggeredBy', 'displayName email phoneNumber photoUrl');

    if (!sos) {
      return res.status(404).json({
        message: 'SOS event not found or is already resolved'
      });
    }

    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:updated', buildSosPayload(sos));
    }

    return res.status(200).json({
      message: 'SOS event resolved',
      sos: buildSosPayload(sos, req.user.userId)
    });
  } catch (error) {
    console.error('[SOS] resolveSos error:', error);
    return res.status(500).json({ message: 'Failed to resolve SOS event.' });
  }
}

/**
 * POST /api/sos/:id/notes
 * Admin only. Appends a text note to the SOS event notes array.
 * Body: { text }
 */
async function addNoteToSos(req, res) {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Note text is required' });
    }

    const note = {
      authorId: req.user.userId,
      text: text.trim(),
      timestamp: new Date()
    };

    const sos = await SosEvent.findByIdAndUpdate(
      id,
      { $push: { notes: note } },
      { returnDocument: 'after' }
    ).populate('triggeredBy', 'displayName email phoneNumber photoUrl');

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found' });
    }

    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:updated', buildSosPayload(sos));
    }

    return res.status(201).json({
      message: 'Note added successfully',
      sos: buildSosPayload(sos, req.user.userId)
    });
  } catch (error) {
    console.error('[SOS] addNoteToSos error:', error);
    return res.status(500).json({ message: 'Failed to add note.' });
  }
}

/**
 * GET /api/sos/active
 * Returns active SOS events for the user, their contacts, and active rescue network.
 */
async function getActiveSos(req, res) {
  try {
    const baseQuery = { status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] } };

    // Optional geo-filter: ?lat=X&lng=Y&radiusKm=10
    // Used by the Android app to fetch only nearby hazards for local caching.
    const { lat, lng, radiusKm } = req.query;
    if (lat && lng && radiusKm) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedKm  = parseFloat(radiusKm);
      if (!isNaN(parsedLat) && !isNaN(parsedLng) && !isNaN(parsedKm) && parsedKm > 0) {
        // MongoDB $centerSphere uses radians: distance / Earth radius (6378.1 km)
        baseQuery.location = {
          $geoWithin: {
            $centerSphere: [[parsedLng, parsedLat], parsedKm / 6378.1]
          }
        };
      }
    }

    const activeEvents = await SosEvent.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate({
        path: 'triggeredBy',
        select: 'displayName email phoneNumber photoUrl'
      });

    return res.status(200).json({
      events: activeEvents.map((e) => buildSosPayload(e, req.user.userId))
    });
  } catch (error) {
    console.error('[SOS] getActiveSos error:', error);
    return res.status(500).json({ message: 'Failed to fetch active SOS events.' });
  }
}

/**
 * PUT /api/sos/:id/assign
 * Admin only. Assigns, reassigns, or unassigns an admin to take ownership of an SOS event.
 * Body: { adminId: string | null }
 */
async function assignAdminToSos(req, res) {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    let assignedAdminId = null;
    if (adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json({ message: 'Invalid Admin User ID' });
      }
      const targetUser = await User.findById(adminId);
      if (!targetUser) {
        return res.status(404).json({ message: 'Admin user not found' });
      }
      if (targetUser.role !== 'ADMIN') {
        return res.status(400).json({ message: 'Assigned user must have ADMIN role' });
      }

      const hqAssignmentCount = await Headquarters.countDocuments({ assignedAdmins: targetUser._id });
      if (hqAssignmentCount === 0) {
        return res.status(400).json({ message: 'Target admin is not assigned to any Headquarters. Assign them to an HQ first.' });
      }

      assignedAdminId = targetUser._id;
    }

    const sos = await SosEvent.findByIdAndUpdate(
      id,
      { $set: { assignedAdmin: assignedAdminId } },
      { returnDocument: 'after' }
    )
      .populate('triggeredBy', 'displayName email phoneNumber photoUrl')
      .populate('assignedAdmin', 'displayName email photoUrl');

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found' });
    }

    const io = getIo(req);
    if (io) {
      io.of('/sos').emit('sos:updated', buildSosPayload(sos));
    }

    return res.status(200).json({
      message: assignedAdminId ? 'Admin assigned to SOS event successfully' : 'SOS event unassigned successfully',
      sos: buildSosPayload(sos, req.user.userId)
    });
  } catch (error) {
    console.error('[SOS] assignAdminToSos error:', error);
    return res.status(500).json({ message: 'Failed to assign admin to SOS event.' });
  }
}

/**
 * POST /api/sos/:id/orchestrate
 * Manually or on-demand triggers Agent Zero Autonomous Multi-Agent Orchestration
 * for an existing SOS event.
 */
async function orchestrateSosWithAgentZero(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid SOS event ID' });
    }

    const sos = await SosEvent.findById(id).populate({
      path: 'triggeredBy',
      select: 'displayName email phoneNumber photoUrl'
    });

    if (!sos) {
      return res.status(404).json({ message: 'SOS event not found' });
    }

    const io = getIo(req);
    triggerAgentZeroOrchestrationAsync(sos, io);

    return res.status(202).json({
      message: 'Agent Zero autonomous multi-agent orchestration initiated asynchronously',
      sosId: sos._id
    });
  } catch (error) {
    console.error('[SOS] orchestrateSosWithAgentZero error:', error);
    return res.status(500).json({ message: 'Failed to trigger Agent Zero orchestration' });
  }
}

module.exports = {
  triggerSos,
  getSosById,
  getActiveSos,
  acknowledgeSos,
  getAcknowledgedSosForUser,
  resolveSos,
  addNoteToSos,
  assignAdminToSos,
  bulkMuleUpload,
  getDetourRoute,
  generateSituationBrief,
  orchestrateSosWithAgentZero
};


