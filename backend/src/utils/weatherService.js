/**
 * weatherService.js
 * Real-time meteorological rainfall telemetry connector using Open-Meteo.
 * Free, keyless, high-resolution precipitation and forecast trends.
 */

const axios = require('axios');

/**
 * Categorize rainfall intensity according to meteorological standards (mm/hr)
 * - 0: NONE
 * - 0.1 - 7.5: LIGHT
 * - 7.6 - 35.0: MODERATE
 * - 35.1 - 65.0: HEAVY
 * - > 65.0: TORRENTIAL (Monsoon cloudburst)
 */
function categorizeRainfall(mmHr) {
  if (mmHr <= 0.05) return 'NONE';
  if (mmHr <= 7.5) return 'LIGHT';
  if (mmHr <= 35.0) return 'MODERATE';
  if (mmHr <= 65.0) return 'HEAVY';
  return 'TORRENTIAL';
}

/**
 * Weather description mapping based on WMO weather interpretation codes
 */
function getWeatherDescription(code, mmHr) {
  if (mmHr > 35) return 'Heavy monsoon downpour with potential localized flash-waterlogging';
  if (mmHr > 7.5) return 'Moderate continuous monsoon rain';
  if (mmHr > 0.1) return 'Light intermittent rain / drizzle';

  const codeMap = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };

  return codeMap[code] || 'Overcast conditions';
}

/**
 * Fetch real-time precipitation and 6-hour forecast for coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Precipitation metrics and forecast trend
 */
async function getRainfall(lat, lng) {
  const latitude = typeof lat === 'number' ? lat : parseFloat(lat);
  const longitude = typeof lng === 'number' ? lng : parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error(`Invalid coordinates: lat=${lat}, lng=${lng}`);
  }

  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude,
    longitude,
    current: 'precipitation,rain,weather_code',
    hourly: 'precipitation,weather_code',
    forecast_days: 1,
    timezone: 'auto'
  };

  const fetchWithRetry = async (attempt = 1) => {
    try {
      return await axios.get(url, { params, timeout: 6000 });
    } catch (err) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400));
        return fetchWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const response = await fetchWithRetry();
    const data = response.data;

    const currentPrecip = data.current?.precipitation ?? data.current?.rain ?? 0;
    const currentWeatherCode = data.current?.weather_code ?? 0;

    // Process 6-hour hourly trend
    const hourlyTimes = data.hourly?.time || [];
    const hourlyPrecip = data.hourly?.precipitation || [];
    const hourlyCodes = data.hourly?.weather_code || [];

    const forecast6h = hourlyTimes.slice(0, 6).map((timeStr, idx) => ({
      time: timeStr,
      precipitationMmHr: Number((hourlyPrecip[idx] ?? 0).toFixed(1)),
      weatherCode: hourlyCodes[idx] ?? 0
    }));

    // Calculate trend over next 3 hours
    let trend = 'STEADY';
    if (forecast6h.length >= 2) {
      const avgNext = (forecast6h.slice(1, 4).reduce((acc, f) => acc + f.precipitationMmHr, 0)) / Math.min(3, forecast6h.length - 1);
      if (avgNext > currentPrecip + 2.0) {
        trend = 'INCREASING';
      } else if (avgNext < currentPrecip - 2.0) {
        trend = 'DECREASING';
      }
    }

    const intensityLevel = categorizeRainfall(currentPrecip);
    const summary = getWeatherDescription(currentWeatherCode, currentPrecip);

    return {
      success: true,
      coordinates: { lat: latitude, lng: longitude },
      precipitationMmHr: Number(currentPrecip.toFixed(1)),
      intensityLevel,
      trend,
      weatherCode: currentWeatherCode,
      summary,
      forecast6h,
      timestamp: data.current?.time || new Date().toISOString(),
      dataSource: 'Open-Meteo High-Resolution Forecast'
    };
  } catch (error) {
    console.warn(`[weatherService] Open-Meteo query failed (${error.message}). Returning estimated baseline.`);
    // Robust fallback to prevent downtime during offline demos
    return {
      success: false,
      isEstimated: true,
      coordinates: { lat: latitude, lng: longitude },
      precipitationMmHr: 0,
      intensityLevel: 'NONE',
      trend: 'STEADY',
      weatherCode: 0,
      summary: 'Telemetry offline — Baseline normal meteorological conditions assumed',
      forecast6h: [],
      timestamp: new Date().toISOString(),
      dataSource: 'Fallback Baseline Telemetry'
    };
  }
}

module.exports = {
  getRainfall,
  categorizeRainfall,
  getWeatherDescription
};
