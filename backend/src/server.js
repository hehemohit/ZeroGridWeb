require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// TODO: Restrict CORS origins to allowed frontend domains before deploying to production
app.use(cors());
app.use(express.json());

// Health check endpoint (for Render health probes and monitoring)
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.status(200).json({
    status: 'ok',
    database: states[dbState] || 'unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);

// Database Connection
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.warn('[MongoDB] WARNING: MONGODB_URI is not set in .env. Database operations will not be available until configured.');
} else {
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log('[MongoDB] Connected successfully to database');
    })
    .catch((err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });
}

// Start Server
const server = app.listen(PORT, () => {
  console.log('=============================================');
  console.log(` ZeroGrid Backend Server running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log('=============================================');
});

module.exports = { app, server };
