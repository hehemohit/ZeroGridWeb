const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'zerogrid_jwt_fallback_secret_key';
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

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verifies and decodes a JWT token.
 * Throws if token is invalid or expired.
 * @param {string} token
 * @returns {Object} Decoded payload
 */
function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signJwt,
  verifyJwt
};
