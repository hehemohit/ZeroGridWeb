const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production!');
  }
  console.warn('[SECURITY WARNING] JWT_SECRET is not set in environment. Using development fallback.');
}
const SECRET_KEY = JWT_SECRET || 'zerogrid_jwt_dev_fallback_secret_key';
const JWT_EXPIRY = '7d';

/**
 * Signs a JWT with user id and role payload.
 * @param {Object} user - User document or object with _id and role
 * @returns {string} Signed JWT
 */
function signJwt(user) {
  const payload = {
    userId: user._id ? user._id.toString() : user.id,
    role: user.role
  };

  return jwt.sign(payload, SECRET_KEY, { expiresIn: JWT_EXPIRY });
}

/**
 * Verifies and decodes a JWT token.
 * Throws if token is invalid or expired.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
function verifyJwt(token) {
  return jwt.verify(token, SECRET_KEY);
}

module.exports = {
  signJwt,
  verifyJwt
};
