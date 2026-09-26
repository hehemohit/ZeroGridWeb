/**
 * ZeroGrid Frontend Hexagonal Spatial Utilities
 * Calculates regular 10-15 km hexagonal polygons for Google Maps rendering.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface HexCellData {
  id: string;
  code: string;
  name: string;
  center: LatLngLiteral;
  path: LatLngLiteral[];
  hasActiveSos?: boolean;
}

/**
 * Generate a 6-vertex regular hexagon polygon path given center point and radius.
 * @param center - { lat, lng }
 * @param radiusKm - Radius in km (default 12 km => ~14 km diameter)
 */
export function calculateHexagonPath(center: LatLngLiteral, radiusKm = 12.0): LatLngLiteral[] {
  const path: LatLngLiteral[] = [];
  const latRad = (center.lat * Math.PI) / 180;

  for (let i = 0; i < 6; i++) {
    const angleRad = (i * 60 * Math.PI) / 180;
    const dLat = (radiusKm * Math.sin(angleRad)) / 111.32;
    const dLng = (radiusKm * Math.cos(angleRad)) / (111.32 * Math.cos(latRad));

    path.push({
      lat: Number((center.lat + dLat).toFixed(6)),
      lng: Number((center.lng + dLng).toFixed(6)),
    });
  }

  return path;
}

/**
 * Generate a single 10-15 km Hexagonal Zone directly centered on a Headquarters location.
 * @param hqId - ID of parent HQ
 * @param hqName - Name of HQ
 * @param center - HQ { lat, lng } coordinates
 * @param radiusKm - Hexagon radius in km (default 12 km => ~14 km diameter)
 */
export function generateHqHexagon(
  hqId: string,
  hqName: string,
  center: LatLngLiteral,
  radiusKm = 12.0
): HexCellData {
  return {
    id: `hex-${hqId}`,
    code: `HEX-${hqId.slice(-4)}`,
    name: `${hqName} Operational Zone`,
    center,
    path: calculateHexagonPath(center, radiusKm),
  };
}

/**
 * Generate 10-15 km Hexagonal Zones for HQs.
 */
export function generateHqHexHoneycomb(
  hqId: string,
  hqName: string,
  center: LatLngLiteral,
  radiusKm = 12.0
): HexCellData[] {
  return [generateHqHexagon(hqId, hqName, center, radiusKm)];
}

/**
 * Basic Point-in-Polygon check to see if an SOS falls within a hexagon path.
 */
export function isPointInPolygon(point: LatLngLiteral, vs: LatLngLiteral[]): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lng;
    const yi = vs[i].lat;
    const xj = vs[j].lng;
    const yj = vs[j].lat;

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}
