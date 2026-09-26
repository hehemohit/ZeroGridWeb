/**
 * ZeroGrid Prometheus & System Observability Collector
 * Collects Node.js V8 Heap, process CPU Usage %, Event Loop Lag,
 * and HTTP latencies for Prometheus / Grafana scraping and Web Admin Console.
 */

const client = require('prom-client');
const SosEvent = require('../models/SosEvent');
const Headquarters = require('../models/Headquarters');

// Create custom Prometheus Register
const register = new client.Registry();

// Enable default metrics (CPU, Memory, GC, Event Loop, Process Handles)
client.collectDefaultMetrics({
  register,
  prefix: 'zerogrid_'
});

// Custom Prometheus Metrics
const httpDurationHistogram = new client.Histogram({
  name: 'zerogrid_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});
register.registerMetric(httpDurationHistogram);

const activeSosGauge = new client.Gauge({
  name: 'zerogrid_active_sos_total',
  help: 'Total count of active emergency SOS signals'
});
register.registerMetric(activeSosGauge);

// CPU Usage % Telemetry Helper
let lastCpuUsage = process.cpuUsage();
let lastCpuCheckTime = Date.now();
let cachedCpuPercent = 1.5; // Initial smooth baseline %

function calculateCpuPercent() {
  const currentCpu = process.cpuUsage();
  const currentTime = Date.now();
  const timeDelta = (currentTime - lastCpuCheckTime) * 1000; // in microseconds

  if (timeDelta > 0) {
    const userDelta = currentCpu.user - lastCpuUsage.user;
    const systemDelta = currentCpu.system - lastCpuUsage.system;
    const rawPercent = ((userDelta + systemDelta) / timeDelta) * 100;
    cachedCpuPercent = Number(Math.min(100, Math.max(0.1, rawPercent)).toFixed(1));

    lastCpuUsage = currentCpu;
    lastCpuCheckTime = currentTime;
  }
  return cachedCpuPercent;
}

// Recalculate CPU % every 3 seconds
setInterval(() => {
  calculateCpuPercent();
}, 3000);

/**
 * Returns plain text metrics formatted for Prometheus scraping (GET /metrics).
 */
async function getPrometheusMetrics() {
  try {
    const activeSosCount = await SosEvent.countDocuments({ status: 'ACTIVE' });
    activeSosGauge.set(activeSosCount);
  } catch (err) {
    // Non-blocking fallback
  }
  return register.metrics();
}

/**
 * Returns JSON system telemetry for the Web Admin Console.
 */
async function getSystemTelemetry() {
  const cpuPercent = calculateCpuPercent();
  const memUsage = process.memoryUsage();

  const rssMb = Number((memUsage.rss / (1024 * 1024)).toFixed(1));
  const heapUsedMb = Number((memUsage.heapUsed / (1024 * 1024)).toFixed(1));
  const heapTotalMb = Number((memUsage.heapTotal / (1024 * 1024)).toFixed(1));

  const [activeSosCount, hqCount] = await Promise.all([
    SosEvent.countDocuments({ status: 'ACTIVE' }).catch(() => 0),
    Headquarters.countDocuments().catch(() => 0)
  ]);

  return {
    status: 'operational',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    cpu: {
      usagePercent: cpuPercent,
      cores: require('os').cpus().length || 1,
      model: require('os').cpus()[0]?.model || 'Render Shared CPU'
    },
    memory: {
      rssMb,
      heapUsedMb,
      heapTotalMb,
      externalMb: Number((memUsage.external / (1024 * 1024)).toFixed(1))
    },
    telemetry: {
      activeSosCount,
      hqCount,
      renderDeployment: process.env.RENDER ? 'Render Cloud (Free Tier)' : 'Localhost Dev'
    }
  };
}

module.exports = {
  register,
  httpDurationHistogram,
  getPrometheusMetrics,
  getSystemTelemetry
};
