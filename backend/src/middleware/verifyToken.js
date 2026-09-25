const { verifyJwt } = require('../utils/jwt');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Unauthorized: Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyJwt(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid or expired token'
    });
  }
}

module.exports = verifyToken;
