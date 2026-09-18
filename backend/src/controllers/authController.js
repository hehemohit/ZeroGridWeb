const bcrypt = require('bcrypt');
const User = require('../models/User');
const { signJwt } = require('../utils/jwt');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

/**
 * POST /api/auth/register
 * Body: { email, password, displayName, role }
 */
async function register(req, res) {
  try {
    const { email, password, displayName, role } = req.body;

    // 1. Role validation
    if (!role || !['CITIZEN', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        message: 'Role must be either CITIZEN or ADMIN'
      });
    }

    // 2. Email validation
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        message: 'A valid email address is required'
      });
    }

    // 3. Password validation (min 8 chars)
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long'
      });
    }

    // 4. DisplayName validation
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({
        message: 'Display name is required'
      });
    }

    // 5. Uniqueness check
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: 'User already exists with this email'
      });
    }

    // 6. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 7. Role-based approval status
    const adminApproved = role === 'ADMIN' ? false : null;

    // 8. Create user
    const newUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      displayName: displayName.trim(),
      role,
      adminApproved,
      authProvider: 'LOCAL'
    });

    // 9. Generate JWT
    const token = signJwt(newUser);

    // 10. Return response without passwordHash
    return res.status(201).json({
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      message: 'Failed to register user. Please try again.'
    });
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
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Generic error for security
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // 3. Check admin approval status
    if (user.role === 'ADMIN' && user.adminApproved === false) {
      return res.status(403).json({
        message: 'Admin account pending approval'
      });
    }

    // 4. Generate JWT
    const token = signJwt(user);

    // 5. Response
    return res.status(200).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      message: 'Failed to log in. Please try again.'
    });
  }
}

module.exports = {
  register,
  login
};
