/**
 * ZeroGrid Electrical Grid Node Resolver
 * Maps geospatial incident telemetry (GeoJSON [lng, lat] or [lat, lng])
 * to the nearest electrical grid node in the DynamoDB ZeroGrid-State topology.
 */

const KNOWN_GRID_NODES = [
  {
    nodeId: 'SUB_VIRAR_EAST_01',
    name: 'Virar East Main Substation (33kV)',
    type: 'SUBSTATION',
    lat: 19.456,
    lng: 72.812,
    criticalFacilities: ['HOSPITAL_SANJEEVANI', 'PUMP_STATION_04']
  },
  {
    nodeId: 'XFMR_WARD4_02',
    name: 'Ward 4 Step-Down Transformer (11kV)',
    type: 'TRANSFORMER',
    lat: 19.458,
    lng: 72.815,
    criticalFacilities: ['PUMP_STATION_04']
  },
  {
    nodeId: 'NODE_HOSPITAL_09',
    name: 'Sanjeevani Hospital Critical Feeder Point',
    type: 'TRANSFORMER',
    lat: 19.454,
    lng: 72.818,
    criticalFacilities: ['HOSPITAL_SANJEEVANI_ICU', 'TRAUMA_CENTER']
  },
  {
    nodeId: 'SUB_VASAI_WEST_03',
    name: 'Vasai West Auxiliary Backup Substation (33kV)',
    type: 'SUBSTATION',
    lat: 19.432,
    lng: 72.801,
    criticalFacilities: ['VASAI_CIVIL_HOSPITAL']
  }
];

/**
 * Calculates Euclidean distance squared between two coordinates.
 */
function calculateDistanceSq(lat1, lng1, lat2, lng2) {
  return Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2);
}

/**
 * Resolves the closest electrical grid node from incoming GeoJSON coordinates or explicit identifier.
 * @param {Array<number>} coordinates - Either [lng, lat] (GeoJSON standard) or [lat, lng]
 * @param {string} [explicitNodeId] - Optional explicit node identifier
 * @returns {{ nodeId: string, name: string, type: string, coordinates: [number, number] }}
 */
function resolveNearestGridNode(coordinates, explicitNodeId) {
  if (explicitNodeId) {
    const found = KNOWN_GRID_NODES.find((n) => n.nodeId === explicitNodeId);
    if (found) {
      return {
        nodeId: found.nodeId,
        name: found.name,
        type: found.type,
        coordinates: [found.lat, found.lng],
        criticalFacilities: found.criticalFacilities
      };
    }
  }

  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    let lat, lng;
    const c0 = parseFloat(coordinates[0]);
    const c1 = parseFloat(coordinates[1]);

    // Handle GeoJSON [lng, lat] vs traditional [lat, lng]
    // Mumbai region: latitude is ~19.4, longitude is ~72.8
    if (c0 > 50) {
      // c0 is longitude
      lng = c0;
      lat = c1;
    } else {
      // c0 is latitude
      lat = c0;
      lng = c1;
    }

    let nearest = KNOWN_GRID_NODES[0];
    let minDistance = Infinity;

    for (const node of KNOWN_GRID_NODES) {
      const dist = calculateDistanceSq(lat, lng, node.lat, node.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = node;
      }
    }

    return {
      nodeId: nearest.nodeId,
      name: nearest.name,
      type: nearest.type,
      coordinates: [nearest.lat, nearest.lng],
      criticalFacilities: nearest.criticalFacilities
    };
  }

  // Regional primary fallback
  const fallback = KNOWN_GRID_NODES[0];
  return {
    nodeId: fallback.nodeId,
    name: fallback.name,
    type: fallback.type,
    coordinates: [fallback.lat, fallback.lng],
    criticalFacilities: fallback.criticalFacilities
  };
}

module.exports = {
  KNOWN_GRID_NODES,
  resolveNearestGridNode
};
