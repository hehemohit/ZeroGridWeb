const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { signJwt } = require('../utils/jwt');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

// Lazily instantiated so missing env var doesn't crash module load
let googleClient = null;
function getGoogleClient() {
  if (!googleClient) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set in environment variables');
    googleClient = new OAuth2Client(clientId);
  }
  return googleClient;
}

/** Builds the safe user payload returned in auth responses */
function buildUserPayload(user) {
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    accountType: user.accountType || 'STANDARD',
    profileComplete: user.profileComplete || false,
    phoneNumber: user.phoneNumber || null,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : null
  };
}

/**
 * POST /api/auth/register
 * Body: { email, password, displayName, role }
 */
async function register(req, res) {
  try {
    const { email, password, displayName, role } = req.body;

    // 1. Role validation
    if (!role || !['CITIZEN', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Role must be either CITIZEN or ADMIN' });
    }

    // 2. Email validation
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'A valid email address is required' });
    }

    // 3. Password validation (min 8 chars)
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // 4. DisplayName validation
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ message: 'Display name is required' });
    }

    // 5. Uniqueness check
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists with this email' });
    }

    // 6. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 7. Role-based approval status
    const adminApproved = role === 'ADMIN' ? false : null;

    // 8. Create user - profileComplete starts false
    const newUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      displayName: displayName.trim(),
      role,
      adminApproved,
      authProvider: 'LOCAL',
      profileComplete: false
    });

    // 9. Generate JWT
    const token = signJwt(newUser);

    return res.status(201).json({ token, user: buildUserPayload(newUser) });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Failed to register user. Please try again.' });
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 2. Google-only users cannot log in with a password
    if (!user.passwordHash) {
      return res.status(400).json({
        message: 'This account uses Google Sign-In. Please log in with Google.'
      });
    }

    // 3. Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 4. Check admin approval status
    if (user.role === 'ADMIN' && user.adminApproved === false) {
      return res.status(403).json({ message: 'Admin account pending approval' });
    }

    // 5. Generate JWT
    const token = signJwt(user);

    return res.status(200).json({ token, user: buildUserPayload(user) });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Failed to log in. Please try again.' });
  }
}

/**
 * POST /api/auth/google
 * Body: { idToken } - the Google ID token from Android native Sign-In SDK
 *
 * Verifies the token server-side, upserts the user record, and returns
 * an app JWT. Never trust the client's claimed googleId / email.
 */
async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ message: 'idToken is required' });
    }

    let client;
    try {
      client = getGoogleClient();
    } catch (e) {
      return res.status(503).json({
        message: 'Google authentication is not configured on this server. Set GOOGLE_CLIENT_ID.'
      });
    }

    // Verify the token with Google's servers
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } catch (verifyErr) {
      console.warn('[GoogleAuth] Token verification failed:', verifyErr.message);
      return res.status(401).json({ message: 'Invalid or expired Google ID token' });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name: displayName, picture: photoUrl } = payload;

    if (!googleId || !email) {
      return res.status(400).json({ message: 'Google token is missing required identity claims' });
    }

    // Upsert: find existing user by googleId OR email, create if new
    let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        googleId,
        email: email.toLowerCase(),
        displayName: displayName || email.split('@')[0],
        photoUrl: photoUrl || null,
        authProvider: 'GOOGLE',
        role: 'CITIZEN',
        profileComplete: false
      });
    } else if (!user.googleId) {
      // Existing LOCAL user signing in via Google for the first time - link accounts
      user.googleId = googleId;
      user.authProvider = 'GOOGLE';
      if (!user.photoUrl && photoUrl) user.photoUrl = photoUrl;
      await user.save();
    }

    const token = signJwt(user);

    return res.status(200).json({
      token,
      isNewUser,
      user: buildUserPayload(user)
    });
  } catch (error) {
    console.error('[GoogleAuth] Error:', error);
    return res.status(500).json({ message: 'Google authentication failed. Please try again.' });
  }
}

module.exports = { register, login, googleAuth };
