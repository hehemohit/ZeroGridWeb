const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, googleAuth } = require('../controllers/authController');

const router = express.Router();

// Rate limiter: max 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

// POST /api/auth/google — Google ID token verification + upsert user
// Rate-limited to the same window as local auth to prevent token-spray attacks.
router.post('/google', authLimiter, googleAuth);

module.exports = router;
