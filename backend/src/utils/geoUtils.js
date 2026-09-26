/**
 * ZeroGrid Hexagonal Geo-Spatial Utilities
 * Provides mathematical generation of 10-15 km regular hexagonal polygons
 * and spatial containment queries.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Generate a 6-vertex GeoJSON Polygon representing a regular hexagon around (lat, lng).
 * @param {number} centerLat - Latitude of center
 * @param {number} centerLng - Longitude of center
 * @param {number} radiusKm - Radius from center to vertices in km (default 12 km => ~13-15 km diameter)
 * @returns {Object} GeoJSON Polygon geometry { type: 'Polygon', coordinates: [[[lng, lat], ...]] }
 */
function generateHexagonPolygon(centerLat, centerLng, radiusKm = 12.0) {
  const latRad = (centerLat * Math.PI) / 180;
  const coordinates = [];

  // Angles 0, 60, 120, 180, 240, 300, and back to 0 (7 points to close ring)
  for (let i = 0; i <= 6; i++) {
    const angleRad = (i * 60 * Math.PI) / 180;
    
    // Latitude delta (in degrees)
    const dLat = (radiusKm * Math.sin(angleRad)) / 111.32;
    // Longitude delta (adjusted for latitude cosine)
    const dLng = (radiusKm * Math.cos(angleRad)) / (111.32 * Math.cos(latRad));

    const pLat = Number((centerLat + dLat).toFixed(6));
    const pLng = Number((centerLng + dLng).toFixed(6));

    // GeoJSON uses [longitude, latitude] order
    coordinates.push([pLng, pLat]);
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  };
}

/**
 * Generate a single 10-15 km Hexagonal Zone directly centered around a Headquarters.
 * @param {number} hqLat - Latitude of HQ
 * @param {number} hqLng - Longitude of HQ
 * @param {number} radiusKm - Radius of hexagon in km (default 12 km => ~14 km diameter)
 * @returns {Array} List containing 1 zone definition { suffix, name, centerLat, centerLng, boundary }
 */
function generateHqHexGrid(hqLat, hqLng, radiusKm = 12.0) {
  return [
    {
      suffix: 'HEX-ZONE',
      name: 'Operational Zone',
      centerLat: Number(hqLat.toFixed(6)),
      centerLng: Number(hqLng.toFixed(6)),
      boundary: generateHexagonPolygon(hqLat, hqLng, radiusKm)
    }
  ];
}

module.exports = {
  generateHexagonPolygon,
  generateHqHexGrid
};
