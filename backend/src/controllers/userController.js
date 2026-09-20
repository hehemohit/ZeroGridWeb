const User = require('../models/User');
const { isValidPhone, isValidPastDate } = require('../utils/validation');

/** Builds the safe user payload (no passwordHash) */
function buildUserPayload(user) {
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    accountType: user.accountType || 'STANDARD',
    profileComplete: user.profileComplete || false,
    phoneNumber: user.phoneNumber || null,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : null,
    photoUrl: user.photoUrl || null,
    createdAt: user.createdAt
  };
}

/**
 * GET /api/users/me
 * Returns the authenticated user's profile (JWT -> DB lookup).
 */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ user: buildUserPayload(user) });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({ message: 'Failed to fetch profile. Please try again.' });
  }
}

/**
 * PUT /api/users/me
 * Updates profile fields. WHITELIST ENFORCED - role, email, passwordHash,
 * and adminApproved cannot be updated via this route to prevent privilege escalation.
 * Allowed: displayName, phoneNumber, dateOfBirth, photoUrl
 */
async function updateMe(req, res) {
  try {
    // Strict whitelist - only these fields can be updated
    const ALLOWED_FIELDS = ['displayName', 'phoneNumber', 'dateOfBirth', 'photoUrl'];
    const updates = {};

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate displayName if provided
    if (updates.displayName !== undefined) {
      if (typeof updates.displayName !== 'string' || !updates.displayName.trim()) {
        return res.status(400).json({ message: 'Display name cannot be empty' });
      }
      updates.displayName = updates.displayName.trim();
    }

    // Validate phoneNumber if provided
    if (updates.phoneNumber !== undefined && updates.phoneNumber !== null) {
      const phoneStr = String(updates.phoneNumber).trim();
      if (!isValidPhone(phoneStr)) {
        return res.status(400).json({
          message: 'Please provide a valid phone number (7-15 digits, optional + country code)'
        });
      }
      updates.phoneNumber = phoneStr;
    }

    // Validate dateOfBirth if provided
    if (updates.dateOfBirth !== undefined && updates.dateOfBirth !== null) {
      if (!isValidPastDate(updates.dateOfBirth)) {
        return res.status(400).json({
          message: 'Invalid date of birth. Must be a valid past date (between 1900 and today).'
        });
      }
      updates.dateOfBirth = new Date(updates.dateOfBirth);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ user: buildUserPayload(user) });
  } catch (error) {
    console.error('updateMe error:', error);
    return res.status(500).json({ message: 'Failed to update profile. Please try again.' });
  }
}

/**
 * PUT /api/users/me/complete-profile
 * Validates phoneNumber + dateOfBirth, persists them, sets profileComplete: true.
 */
async function completeProfile(req, res) {
  try {
    const { phoneNumber, dateOfBirth } = req.body;

    // Validate phoneNumber
    if (!phoneNumber || !isValidPhone(phoneNumber)) {
      return res.status(400).json({
        message: 'A valid phone number is required (7-15 digits, optional + country code)'
      });
    }

    // Validate dateOfBirth
    if (!dateOfBirth || !isValidPastDate(dateOfBirth)) {
      return res.status(400).json({
        message: 'A valid past date of birth is required (between 1900 and today)'
      });
    }

    const dob = new Date(dateOfBirth);

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $set: {
          phoneNumber: phoneNumber.trim(),
          dateOfBirth: dob,
          profileComplete: true
        }
      },
      { returnDocument: 'after', runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ user: buildUserPayload(user) });
  } catch (error) {
    console.error('completeProfile error:', error);
    return res.status(500).json({ message: 'Failed to complete profile. Please try again.' });
  }
}

/**
 * PUT /api/users/me/fcm-token
 * Registers or updates the Firebase Cloud Messaging device token.
 * Called by Android app on login and whenever FCM refreshes the token.
 * Body: { fcmToken }
 */
async function updateFcmToken(req, res) {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
      return res.status(400).json({ message: 'fcmToken is required and must be a non-empty string' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { fcmToken: fcmToken.trim() } },
      { returnDocument: 'after' }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json({ message: 'FCM token updated successfully' });
  } catch (error) {
    console.error('updateFcmToken error:', error);
    return res.status(500).json({ message: 'Failed to update FCM token. Please try again.' });
  }
}

module.exports = { getMe, updateMe, completeProfile, updateFcmToken };
