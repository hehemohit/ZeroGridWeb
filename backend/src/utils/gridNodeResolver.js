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

// ─── Electrical Wire & Transmission Line Placement Topology ─────────────────
const KNOWN_POWER_LINES = [
  {
    lineId: 'LINE_33KV_VIRAR_CORRIDOR',
    name: '33kV Virar East-West Overhead Corridor',
    voltage: '33kV',
    type: 'OVERHEAD',
    fromNode: 'SUB_VIRAR_EAST_01',
    toNode: 'XFMR_WARD4_02',
    pathCoordinates: [
      [19.456, 72.812],
      [19.457, 72.8135],
      [19.458, 72.815]
    ],
    groundClearanceM: 6.2,
    floodVulnerability: 'HIGH', // Traverses low-lying flood bowl
    windThresholdKmh: 45,
    criticalFacilities: ['PUMP_STATION_04', 'COMMUNITY_CENTER']
  },
  {
    lineId: 'LINE_11KV_HOSPITAL_FEEDER',
    name: '11kV Sanjeevani Dedicated Underground Feeder',
    voltage: '11kV',
    type: 'UNDERGROUND_CONDUIT',
    fromNode: 'XFMR_WARD4_02',
    toNode: 'NODE_HOSPITAL_09',
    pathCoordinates: [
      [19.458, 72.815],
      [19.456, 72.8165],
      [19.454, 72.818]
    ],
    groundClearanceM: -1.2, // Subsurface conduit
    floodVulnerability: 'CRITICAL', // Submersible trench vulnerable to road water ingress
    waterIngressThresholdCm: 35,
    criticalFacilities: ['HOSPITAL_SANJEEVANI_ICU', 'TRAUMA_CENTER']
  },
  {
    lineId: 'LINE_33KV_VASAI_TIE_LINE',
    name: '33kV Vasai-Virar Substation Interconnect',
    voltage: '33kV',
    type: 'OVERHEAD_INTERCONNECT',
    fromNode: 'SUB_VIRAR_EAST_01',
    toNode: 'SUB_VASAI_WEST_03',
    pathCoordinates: [
      [19.456, 72.812],
      [19.444, 72.806],
      [19.432, 72.801]
    ],
    groundClearanceM: 7.5,
    floodVulnerability: 'MEDIUM',
    windThresholdKmh: 50,
    criticalFacilities: ['VASAI_CIVIL_HOSPITAL', 'TRANSIT_TERMINAL']
  },
  {
    lineId: 'LINE_11KV_PUMPING_FEEDER',
    name: '11kV Municipal Pumping Station Arterial Conduit',
    voltage: '11kV',
    type: 'UNDERGROUND_CONDUIT',
    fromNode: 'XFMR_WARD4_02',
    toNode: 'SUB_VIRAR_EAST_01',
    pathCoordinates: [
      [19.458, 72.815],
      [19.457, 72.813],
      [19.456, 72.812]
    ],
    groundClearanceM: -0.8,
    floodVulnerability: 'HIGH',
    waterIngressThresholdCm: 45,
    criticalFacilities: ['PUMP_STATION_04']
  }
];

/**
 * Returns power lines in the vicinity of given coordinates
 */
function getPowerLinesNearLocation(lat, lng, radiusKm = 2.5) {
  return KNOWN_POWER_LINES.filter(line => {
    return line.pathCoordinates.some(([pLat, pLng]) => {
      const dLat = (pLat - lat) * 111;
      const dLng = (pLng - lng) * 111 * Math.cos(lat * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng) <= radiusKm;
    });
  });
}

module.exports = {
  KNOWN_GRID_NODES,
  KNOWN_POWER_LINES,
  resolveNearestGridNode,
  getPowerLinesNearLocation
};
