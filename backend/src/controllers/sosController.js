const mongoose = require('mongoose');
const SosEvent = require('../models/SosEvent');
const Contact = require('../models/Contact');
const { sendSosPush } = require('../utils/fcm');

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

  return {
    id: sos._id,
    triggeredBy: sos.triggeredBy,
    location: sos.location,
    accuracyMeters: sos.accuracyMeters,
    category: sos.category,
    message: sos.message,
    transport: sos.transport,
    status: sos.status,
    acknowledgedBy: sos.acknowledgedBy,
    acknowledgedByUsers: sos.acknowledgedByUsers || [],
    isAcknowledgedByMe,
    resolvedBy: sos.resolvedBy,
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
 * Body: { lat, lng, accuracy, category, message, transport }
 */
async function triggerSos(req, res) {
  try {
    const { lat, lng, accuracy, category, message, transport } = req.body;

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

    // Validate category if provided
    const VALID_CATEGORIES = ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'];
    const sosCategory = category && VALID_CATEGORIES.includes(category) ? category : 'OTHER';

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
      status: 'ACTIVE'
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

    // 2. Fire FCM push to all linked emergency contacts asynchronously (non-blocking)
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
 * GET /api/sos/:id
 * Returns a single SOS event. Only the event creator or an admin can access this route.
 */
async function getSosById(req, res) {
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
 *   - Relative/Family SOS: confirmedSafe = true  ("Are you sure he is safe?")
 *   - Local Area SOS:      confirmedSafe = false ("Are you sure the situation is attended to?")
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
    const activeEvents = await SosEvent.find({
      status: { $in: ['ACTIVE', 'ACKNOWLEDGED'] }
    })
      .sort({ createdAt: -1 })
      .limit(30)
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

module.exports = {
  triggerSos,
  getSosById,
  getActiveSos,
  acknowledgeSos,
  getAcknowledgedSosForUser,
  resolveSos,
  addNoteToSos
};
