require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Route imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contactRoutes = require('./routes/contactRoutes');
const sosRoutes = require('./routes/sosRoutes');
const adminRoutes = require('./routes/adminRoutes');
const familyRoutes = require('./routes/familyRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Express Setup ────────────────────────────────────────────────────────────

// Trust reverse proxy (Render) for correct IP resolution in rate limiters
app.set('trust proxy', 1);

// TODO: Before production, restrict CORS origins to your actual frontend domains:
// origin: ['https://zerogrid-admin.onrender.com', 'https://yourapp.com']
app.use(cors());
app.use(express.json());

// ─── HTTP Server + Socket.io ─────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // TODO: Lock this down to admin panel origin before production
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Expose io to route handlers via app.get('io')
app.set('io', io);

// /sos namespace — admin rescue panel subscribes here for real-time SOS events
const sosNamespace = io.of('/sos');

sosNamespace.on('connection', (socket) => {
  console.log(`[Socket.io] Admin client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Admin client disconnected: ${socket.id}`);
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

// Used by Render health probes, UptimeRobot, and monitoring services.
// Keeps the paid tier warm and provides instant readiness feedback.
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

// ─── Route Mounts ─────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/family', familyRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────

// Catches any unhandled errors from route handlers or middleware.
// Express 5 automatically forwards async errors — no need for try/catch wrappers,
// but we keep them in controllers for cleaner targeted error logging.
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err);
  res.status(err.status || 500).json({
    message: err.message || 'An unexpected server error occurred'
  });
});

// ─── Database Connection ──────────────────────────────────────────────────────

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.warn(
    '[MongoDB] WARNING: MONGODB_URI is not set in .env. ' +
      'Database operations will not be available until configured.'
  );
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

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('=============================================');
  console.log(` ZeroGrid Backend Server running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Socket.io:    ws://localhost:${PORT}/sos`);
  console.log('=============================================');
});

module.exports = { app, server, io };
