require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Route & Utility imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contactRoutes = require('./routes/contactRoutes');
const sosRoutes = require('./routes/sosRoutes');
const adminRoutes = require('./routes/adminRoutes');
const familyRoutes = require('./routes/familyRoutes');
const hqRoutes = require('./routes/hqRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const publicRoutes = require('./routes/publicRoutes');
const { getPrometheusMetrics } = require('./utils/metrics');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Express Setup ────────────────────────────────────────────────────────────

// Trust reverse proxy (Render) for correct IP resolution in rate limiters
app.set('trust proxy', 1);

// Allowed origins: comma-separated list in ALLOWED_ORIGINS env var, or wildcard in dev
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ─── HTTP Server + Socket.io ─────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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

// ─── Health & Telemetry Probes ────────────────────────────────────────────────

// Used by Render health probes, UptimeRobot, and monitoring services.
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

// Prometheus Scrape Endpoint (scraped by Prometheus / Grafana Cloud every 15s)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const metrics = await getPrometheusMetrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ─── Route Mounts ─────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/admin/hq', hqRoutes);
app.use('/api/admin/zones', zoneRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/v1/public', publicRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────

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
  console.log(` Prometheus:   http://localhost:${PORT}/metrics`);
  console.log(` Socket.io:    ws://localhost:${PORT}/sos`);
  console.log('=============================================');
});

module.exports = { app, server, io };
