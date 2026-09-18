const User = require('../models/User');

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
 * Updates profile fields. WHITELIST ENFORCED — role, email, passwordHash,
 * and adminApproved cannot be updated via this route to prevent privilege escalation.
 * Allowed: displayName, phoneNumber, dateOfBirth, photoUrl
 */
async function updateMe(req, res) {
  try {
    // Strict whitelist — only these fields can be updated
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
      if (phoneStr.length < 7 || phoneStr.length > 20) {
        return res.status(400).json({ message: 'Phone number must be between 7 and 20 characters' });
      }
      updates.phoneNumber = phoneStr;
    }

    // Validate dateOfBirth if provided
    if (updates.dateOfBirth !== undefined && updates.dateOfBirth !== null) {
      const dob = new Date(updates.dateOfBirth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({ message: 'Invalid date of birth format. Use YYYY-MM-DD' });
      }
      if (dob > new Date()) {
        return res.status(400).json({ message: 'Date of birth cannot be in the future' });
      }
      updates.dateOfBirth = dob;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true, runValidators: true }
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
 * This is a one-way transition — once complete, the route still works for updates.
 */
async function completeProfile(req, res) {
  try {
    const { phoneNumber, dateOfBirth } = req.body;

    // Validate phoneNumber
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length < 7) {
      return res.status(400).json({ message: 'A valid phone number is required (minimum 7 digits)' });
    }

    // Validate dateOfBirth
    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required' });
    }
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      return res.status(400).json({ message: 'Invalid date of birth format. Use YYYY-MM-DD' });
    }
    if (dob > new Date()) {
      return res.status(400).json({ message: 'Date of birth cannot be in the future' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $set: {
          phoneNumber: phoneNumber.trim(),
          dateOfBirth: dob,
          profileComplete: true
        }
      },
      { new: true, runValidators: true }
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

module.exports = { getMe, updateMe, completeProfile };
