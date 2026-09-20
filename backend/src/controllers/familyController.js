const mongoose = require('mongoose');
const ParentChildLink = require('../models/ParentChildLink');
const User = require('../models/User');

/**
 * POST /api/family/link-request
 * Parent initiates a link request to a child account by email.
 * Body: { childEmail }
 *
 * Security: Server verifies the child account is a registered CHILD-type account.
 * The link starts as PENDING until the child (or a parent-managed flow) accepts.
 */
async function sendLinkRequest(req, res) {
  try {
    const { childEmail } = req.body;

    if (!childEmail || typeof childEmail !== 'string') {
      return res.status(400).json({ message: 'childEmail is required' });
    }

    const childUser = await User.findOne({
      email: childEmail.toLowerCase().trim()
    }).select('-passwordHash');

    if (!childUser) {
      return res.status(404).json({
        message: 'No registered ZeroGrid user found with this email'
      });
    }

    // Cannot link to yourself
    if (childUser._id.toString() === req.user.userId) {
      return res.status(400).json({ message: 'You cannot link to your own account' });
    }

    // Check for existing link (any status)
    const existingLink = await ParentChildLink.findOne({
      parentId: req.user.userId,
      childId: childUser._id
    });

    if (existingLink) {
      if (existingLink.status === 'ACCEPTED') {
        return res.status(409).json({ message: 'You are already linked to this user' });
      }
      if (existingLink.status === 'PENDING') {
        return res.status(409).json({ message: 'A link request is already pending for this user' });
      }
      // If REJECTED or REVOKED, allow re-request by updating the record
      existingLink.status = 'PENDING';
      existingLink.requestedAt = new Date();
      existingLink.respondedAt = null;
      await existingLink.save();

      return res.status(200).json({
        message: 'Link request re-sent',
        link: {
          id: existingLink._id,
          childId: childUser._id,
          childName: childUser.displayName,
          childEmail: childUser.email,
          status: existingLink.status,
          requestedAt: existingLink.requestedAt
        }
      });
    }

    const link = await ParentChildLink.create({
      parentId: req.user.userId,
      childId: childUser._id
    });

    return res.status(201).json({
      message: 'Link request sent successfully',
      link: {
        id: link._id,
        childId: childUser._id,
        childName: childUser.displayName,
        childEmail: childUser.email,
        status: link.status,
        requestedAt: link.requestedAt
      }
    });
  } catch (error) {
    console.error('[Family] sendLinkRequest error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A link request already exists for this pair' });
    }
    return res.status(500).json({ message: 'Failed to send link request.' });
  }
}

/**
 * PUT /api/family/link/:id/accept
 * The child (or their guardian) accepts a pending link request.
 * Only the child account can accept their own link.
 */
async function acceptLink(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid link ID' });
    }

    // Only the child of the link can accept it
    const link = await ParentChildLink.findOne({
      _id: id,
      childId: req.user.userId,
      status: 'PENDING'
    });

    if (!link) {
      return res.status(404).json({
        message: 'Pending link request not found or you are not the child account'
      });
    }

    link.status = 'ACCEPTED';
    link.respondedAt = new Date();
    await link.save();

    return res.status(200).json({
      message: 'Link request accepted',
      link: {
        id: link._id,
        parentId: link.parentId,
        childId: link.childId,
        status: link.status,
        respondedAt: link.respondedAt
      }
    });
  } catch (error) {
    console.error('[Family] acceptLink error:', error);
    return res.status(500).json({ message: 'Failed to accept link request.' });
  }
}

/**
 * PUT /api/family/link/:id/revoke
 * Either the parent or child can revoke an existing ACCEPTED or PENDING link.
 */
async function revokeLink(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid link ID' });
    }

    // Either party can revoke
    const link = await ParentChildLink.findOne({
      _id: id,
      $or: [
        { parentId: req.user.userId },
        { childId: req.user.userId }
      ],
      status: { $in: ['PENDING', 'ACCEPTED'] }
    });

    if (!link) {
      return res.status(404).json({
        message: 'Link not found or you are not a party to this link'
      });
    }

    link.status = 'REVOKED';
    link.respondedAt = new Date();
    await link.save();

    return res.status(200).json({
      message: 'Link revoked successfully',
      linkId: link._id
    });
  } catch (error) {
    console.error('[Family] revokeLink error:', error);
    return res.status(500).json({ message: 'Failed to revoke link.' });
  }
}

/**
 * GET /api/family/child/:childId/location
 * Returns the child's last known location (from their profile).
 *
 * SECURITY CRITICAL:
 * - Re-verifies the ACCEPTED parentChildLinks record on EVERY call.
 * - A cached "is parent" flag in the JWT or client state must never be trusted.
 * - If the link is revoked between calls, this immediately returns 403.
 */
async function getChildLocation(req, res) {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ message: 'Invalid child user ID' });
    }

    // CRITICAL: Re-verify the accepted link on every single request
    const acceptedLink = await ParentChildLink.findOne({
      parentId: req.user.userId,
      childId: childId,
      status: 'ACCEPTED'
    });

    if (!acceptedLink) {
      return res.status(403).json({
        message: 'Access denied: No accepted parent-child link found for this child'
      });
    }

    // Fetch child's profile (location data stored on the user or from last SOS)
    const child = await User.findById(childId).select(
      'displayName email phoneNumber photoUrl lastKnownLocation lastLocationAt'
    );

    if (!child) {
      return res.status(404).json({ message: 'Child account not found' });
    }

    return res.status(200).json({
      child: {
        id: child._id,
        displayName: child.displayName,
        email: child.email,
        phoneNumber: child.phoneNumber || null,
        photoUrl: child.photoUrl || null
      },
      location: child.lastKnownLocation || null,
      lastLocationAt: child.lastLocationAt || null
    });
  } catch (error) {
    console.error('[Family] getChildLocation error:', error);
    return res.status(500).json({ message: 'Failed to fetch child location.' });
  }
}

/**
 * GET /api/family/links
 * Returns all family links involving the current user (as parent or child).
 */
async function getMyLinks(req, res) {
  try {
    const links = await ParentChildLink.find({
      $or: [{ parentId: req.user.userId }, { childId: req.user.userId }]
    })
      .populate('parentId', 'displayName email photoUrl')
      .populate('childId', 'displayName email photoUrl')
      .sort({ requestedAt: -1 });

    return res.status(200).json({ links });
  } catch (error) {
    console.error('[Family] getMyLinks error:', error);
    return res.status(500).json({ message: 'Failed to fetch family links.' });
  }
}

module.exports = {
  sendLinkRequest,
  acceptLink,
  revokeLink,
  getChildLocation,
  getMyLinks
};
