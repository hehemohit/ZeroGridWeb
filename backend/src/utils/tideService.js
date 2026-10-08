/**
 * tideService.js
 * Coastal Tidal Telemetry Service for Vasai-Virar & Mumbai Metropolitan Region.
 * Combines astronomical harmonic tidal physics (Apollo Bunder / Vasai Creek datum)
 * with Open-Meteo Marine wave and swell telemetry.
 * 
 * Physics of Coastal Inundation:
 * - When tide > 3.8m: Municipal sea sluice gates are shut to prevent Arabian Sea backflow into city stormwater drains.
 * - While gates are shut: Gravity drainage drops to 0 mm/hr. Water accumulates and requires diesel pumps.
 * - Drainage resumes: After tide crests and recedes below 2.8m.
 */

const axios = require('axios');

// Thresholds defined by Municipal Disaster Management Plan (MCGM / VVMC)
const SLUICE_GATE_CLOSE_METERS = 3.8;
const GRAVITY_DRAINAGE_RESUME_METERS = 2.8;
const MEAN_SEA_LEVEL_METERS = 2.55;

// Reference astronomical epoch for Arabian Sea harmonic alignment (New Moon / Spring tide alignment)
const EPOCH_REF_MS = new Date('2026-09-11T07:15:00Z').getTime();
const M2_PERIOD_HOURS = 12.4206012; // Principal lunar semidiurnal period
const S2_PERIOD_HOURS = 12.0000000; // Principal solar semidiurnal period
const SPRING_NEAP_PERIOD_HOURS = 354.367; // ~14.765 days spring/neap modulation cycle

/**
 * Calculate astronomical tide height at a specific timestamp for Mumbai/Vasai coast
 * @param {Date|number} timestamp
 * @returns {number} Tide height in meters (rounded to 2 decimal places)
 */
function calculateAstronomicalTide(timestamp) {
  const timeMs = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const deltaHours = (timeMs - EPOCH_REF_MS) / (1000 * 60 * 60);

  // Semidiurnal lunar phase
  const m2Phase = (2 * Math.PI * deltaHours) / M2_PERIOD_HOURS;
  // Semidiurnal solar phase
  const s2Phase = (2 * Math.PI * deltaHours) / S2_PERIOD_HOURS;
  // Spring-neap lunar modulation (spring tides near full/new moon, neap tides near quarters)
  const springNeapPhase = (2 * Math.PI * deltaHours) / SPRING_NEAP_PERIOD_HOURS;

  // Harmonic amplitudes for Arabian Sea Mumbai coastal basin
  // Spring high tide ~4.3m - 4.8m; Neap high tide ~3.2m - 3.7m; Low tides ~0.6m - 1.5m
  const m2Amp = 1.35;
  const s2Amp = 0.45;
  const springModulation = 0.35 * Math.cos(springNeapPhase);

  const shallowWaterDistortion = 0.12 * Math.cos(2 * m2Phase + 0.4);

  const rawHeight = MEAN_SEA_LEVEL_METERS 
    + (m2Amp + springModulation) * Math.cos(m2Phase) 
    + s2Amp * Math.cos(s2Phase)
    + shallowWaterDistortion;

  // Clamp within physical coastal boundaries [0.3m, 5.2m]
  const clampedHeight = Math.max(0.3, Math.min(5.2, rawHeight));
  return Number(clampedHeight.toFixed(2));
}

/**
 * Find next high tide peak, low tide peak, and recession times around reference date
 */
function analyzeTidalTrajectory(currentDate, stepMinutes = 5, lookAheadHours = 14) {
  const currentMs = currentDate.getTime();
  const currentTide = calculateAstronomicalTide(currentMs);
  const next5MinTide = calculateAstronomicalTide(currentMs + 5 * 60 * 1000);
  const prev5MinTide = calculateAstronomicalTide(currentMs - 5 * 60 * 1000);

  const tidePhase = next5MinTide >= currentTide ? 'RISING' : 'FALLING';

  let peakHighTide = { height: -99, time: null };
  let peakLowTide = { height: 99, time: null };
  let expectedDrainageResumeTime = null;

  const totalSteps = Math.floor((lookAheadHours * 60) / stepMinutes);

  // Scan forward looking for crests, troughs, and threshold crossings
  for (let i = 0; i <= totalSteps; i++) {
    const scanTimeMs = currentMs + i * stepMinutes * 60 * 1000;
    const scanDate = new Date(scanTimeMs);
    const height = calculateAstronomicalTide(scanTimeMs);

    // Track highest crest in window
    if (height > peakHighTide.height) {
      peakHighTide = { height, time: scanDate };
    }

    // Track lowest trough in window
    if (height < peakLowTide.height) {
      peakLowTide = { height, time: scanDate };
    }

    // Check when falling tide drops below 2.8m for gravity drainage resumption
    if (currentTide >= GRAVITY_DRAINAGE_RESUME_METERS && !expectedDrainageResumeTime) {
      // Must be past peak high tide and height <= 2.8m
      if (scanTimeMs >= (peakHighTide.time?.getTime() || currentMs) && height <= GRAVITY_DRAINAGE_RESUME_METERS) {
        expectedDrainageResumeTime = scanDate;
      }
    }
  }

  // If already below 2.8m, drainage is active now
  if (currentTide < GRAVITY_DRAINAGE_RESUME_METERS) {
    expectedDrainageResumeTime = 'NOW (Active)';
  }

  return {
    currentTide,
    tidePhase,
    peakHighTide,
    peakLowTide,
    expectedDrainageResumeTime
  };
}

const marineCache = new Map();
const MARINE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch Open-Meteo Marine wave telemetry for additional coastal swell context
 */
async function fetchMarineTelemetry(lat, lng) {
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  const cached = marineCache.get(key);
  if (cached && Date.now() - cached.timestamp < MARINE_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = 'https://marine-api.open-meteo.com/v1/marine';
  const params = {
    latitude: lat,
    longitude: lng,
    hourly: 'wave_height,wave_direction,wave_period',
    forecast_days: 1,
    timezone: 'auto'
  };

  try {
    const response = await axios.get(url, { params, timeout: 5000 });
    const hourly = response.data?.hourly;
    const currentWaveHeight = hourly?.wave_height?.[0] ?? null;
    const wavePeriod = hourly?.wave_period?.[0] ?? null;

    const data = {
      waveHeightMeters: currentWaveHeight !== null ? Number(currentWaveHeight.toFixed(2)) : 0.45,
      wavePeriodSeconds: wavePeriod !== null ? Number(wavePeriod.toFixed(1)) : 6.0,
      marineSource: 'Open-Meteo Marine SWAN Model'
    };
    marineCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    const fallback = {
      waveHeightMeters: 0.45,
      wavePeriodSeconds: 6.0,
      marineSource: 'Fallback Baseline Marine Swell'
    };
    marineCache.set(key, { data: fallback, timestamp: Date.now() });
    return fallback;
  }
}

/**
 * Format Date to HH:MM (IST or local)
 */
function formatTimeHHMM(date) {
  if (!date || typeof date === 'string') return date || '--:--';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata'
  });
}

/**
 * Get comprehensive coastal tidal conditions and sluice gate impact
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} [options] - Optional overrides { overrideTideMeters, date }
 * @returns {Promise<Object>} Tidal status and municipal drainage impact
 */
async function getTideConditions(lat = 19.4534, lng = 72.8061, options = {}) {
  const targetDate = options.date ? new Date(options.date) : new Date();
  const trajectory = analyzeTidalTrajectory(targetDate);

  // Allow optional simulation override for drills / demos
  const currentTideMeters = options.overrideTideMeters !== undefined 
    ? Number(options.overrideTideMeters.toFixed(2))
    : trajectory.currentTide;

  const isSluiceClosed = currentTideMeters >= SLUICE_GATE_CLOSE_METERS;
  const gravityDrainagePossible = currentTideMeters < SLUICE_GATE_CLOSE_METERS;

  // Retrieve marine swell context
  const marineData = await fetchMarineTelemetry(lat, lng);

  const highTideTimeFormatted = formatTimeHHMM(trajectory.peakHighTide.time);
  const lowTideTimeFormatted = formatTimeHHMM(trajectory.peakLowTide.time);
  const resumeTimeFormatted = typeof trajectory.expectedDrainageResumeTime === 'string'
    ? trajectory.expectedDrainageResumeTime
    : formatTimeHHMM(trajectory.expectedDrainageResumeTime);

  let warning = null;
  if (isSluiceClosed) {
    warning = `CRITICAL: Arabian Sea tide height (${currentTideMeters}m) exceeds municipal threshold (${SLUICE_GATE_CLOSE_METERS}m). Sea sluice gates are LOCKED SHUT to prevent backflow. Gravity drainage is 0 mm/hr until tide drops below ${GRAVITY_DRAINAGE_RESUME_METERS}m.`;
  } else if (currentTideMeters >= GRAVITY_DRAINAGE_RESUME_METERS) {
    warning = `ADVISORY: Tide height (${currentTideMeters}m) restricts stormwater outfall velocity. Gravity discharge operates at diminished capacity.`;
  }

  return {
    success: true,
    coordinates: { lat, lng },
    currentTideMeters,
    tidePhase: trajectory.tidePhase,
    highTidePeakTime: highTideTimeFormatted,
    highTidePeakMeters: trajectory.peakHighTide.height,
    lowTidePeakTime: lowTideTimeFormatted,
    lowTidePeakMeters: trajectory.peakLowTide.height,
    gravityDrainagePossible,
    sluiceGateStatus: isSluiceClosed ? 'CLOSED' : 'OPEN',
    expectedDrainageResumeTime: resumeTimeFormatted,
    waveHeightMeters: marineData.waveHeightMeters,
    wavePeriodSeconds: marineData.wavePeriodSeconds,
    thresholds: {
      sluiceCloseMeters: SLUICE_GATE_CLOSE_METERS,
      drainageResumeMeters: GRAVITY_DRAINAGE_RESUME_METERS
    },
    warning,
    evaluatedAt: targetDate.toISOString(),
    harmonicStation: 'Apollo Bunder / Vasai Creek Harmonic Reference'
  };
}

module.exports = {
  getTideConditions,
  calculateAstronomicalTide,
  SLUICE_GATE_CLOSE_METERS,
  GRAVITY_DRAINAGE_RESUME_METERS
};
