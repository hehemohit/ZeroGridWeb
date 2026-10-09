/**
 * ZeroGrid Autonomous 5-Minute Batch Consolidation & Dispatch Agent
 *
 * Scans all ACTIVE distress beacons in MongoDB every 5 minutes,
 * clusters proximate alerts (e.g. 3-4 alerts within 1.2 km of each other),
 * contextualizes the common root cause, assigns a single optimal tactical squad
 * to cover the cluster, locks the team in Redis (SET NX EX), and marks all
 * clustered events as ACKNOWLEDGED with real-time Socket.io broadcast.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const SosEvent = require('../models/SosEvent');
const { redisLockManager, DEFAULT_TEAMS } = require('./redisLockClient');

const CLUSTER_RADIUS_KM = 1.2; // 1.2 km tactical radius for spatial grouping
const BATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Groups active SOS events into spatial clusters using greedy density clustering.
 */
function clusterActiveEvents(events, radiusKm = CLUSTER_RADIUS_KM) {
  const radiusMeters = radiusKm * 1000;
  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventId = event._id.toString();
    if (visited.has(eventId)) continue;

    const coords = event.location?.coordinates || [];
    if (coords.length < 2) {
      clusters.push([event]);
      visited.add(eventId);
      continue;
    }

    const [lng, lat] = coords;
    const cluster = [event];
    visited.add(eventId);

    for (let j = 0; j < events.length; j++) {
      if (i === j) continue;
      const other = events[j];
      const otherId = other._id.toString();
      if (visited.has(otherId)) continue;

      const otherCoords = other.location?.coordinates || [];
      if (otherCoords.length < 2) continue;

      const dist = haversineDistanceMeters(lat, lng, otherCoords[1], otherCoords[0]);
      if (dist <= radiusMeters) {
        visited.add(otherId);
        cluster.push(other);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Determines the most appropriate tactical emergency squad based on incident cluster hazards.
 */
function chooseOptimalTeamCategory(cluster) {
  let maxWaterDepth = 0;
  const categoryCounts = {};

  cluster.forEach((ev) => {
    const depth = Number(ev.waterDepthCm) || 0;
    if (depth > maxWaterDepth) maxWaterDepth = depth;
    const cat = ev.category || 'OTHER';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const dominantCategory =
    Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0] ||
    'OTHER';

  if (dominantCategory === 'FALLEN_GRID') {
    return 'TEAM_LINEMEN_SQUAD_04';
  }
  if (dominantCategory === 'MEDICAL') {
    return 'TEAM_VASAI_RESCUE_02';
  }
  if (maxWaterDepth >= 40 || dominantCategory === 'TRAPPED' || dominantCategory === 'DISASTER') {
    return 'TEAM_NDRF_ALPHA';
  }
  if (dominantCategory === 'DRAINAGE_OVERFLOW' || dominantCategory === 'SUBMERGED_UNDERPASS') {
    return 'TEAM_PUMP_CREW_01';
  }
  return 'TEAM_NDRF_BRAVO';
}

/**
 * Runs one cycle of the Autonomous Batch Consolidation & Dispatch engine.
 *
 * @param {Object} options
 * @param {Object} [options.io] - Socket.io instance
 * @param {boolean} [options.manual=false] - True if triggered by admin click
 * @returns {Promise<Object>} Summary of consolidation actions
 */
async function runAutonomousBatchDispatchCycle({ io, manual = false } = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Batch Dispatch Agent] Starting autonomous cycle at ${timestamp} (manual: ${manual})`);

  try {
    // 1. Fetch all ACTIVE SOS events from MongoDB
    const activeEvents = await SosEvent.find({ status: 'ACTIVE' })
      .populate('triggeredBy', 'displayName email phoneNumber role photoUrl')
      .sort({ createdAt: 1 });

    if (!activeEvents || activeEvents.length === 0) {
      console.log('[Batch Dispatch Agent] 0 active SOS requests. No consolidation needed.');
      return {
        success: true,
        totalActive: 0,
        clustersProcessed: 0,
        acknowledgedCount: 0,
        message: 'No active SOS alerts found. Emergency response pool in standby.'
      };
    }

    console.log(
      `[Batch Dispatch Agent] Discovered ${activeEvents.length} active alerts. Performing spatial clustering...`
    );

    // 2. Spatial Clustering
    const clusters = clusterActiveEvents(activeEvents, CLUSTER_RADIUS_KM);
    console.log(`[Batch Dispatch Agent] Formed ${clusters.length} spatial cluster(s).`);

    let totalAcknowledged = 0;
    const clusterSummaries = [];

    // 3. Process each cluster
    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      const cluster = clusters[cIdx];
      const clusterSize = cluster.length;
      const preferredTeam = chooseOptimalTeamCategory(cluster);

      // Centroid calculation
      const coordsList = cluster
        .map((e) => e.location?.coordinates)
        .filter((c) => Array.isArray(c) && c.length === 2);

      let centroid = [72.812, 19.456];
      if (coordsList.length > 0) {
        const avgLng = coordsList.reduce((sum, c) => sum + c[0], 0) / coordsList.length;
        const avgLat = coordsList.reduce((sum, c) => sum + c[1], 0) / coordsList.length;
        centroid = [Number(avgLng.toFixed(5)), Number(avgLat.toFixed(5))];
      }

      const maxWaterDepth = Math.max(...cluster.map((e) => Number(e.waterDepthCm) || 0));
      const categories = [...new Set(cluster.map((e) => e.category || 'OTHER'))];

      // Contextual synthesis
      const clusterContext =
        clusterSize > 1
          ? `Consolidated cluster of ${clusterSize} alerts within ${CLUSTER_RADIUS_KM}km. Primary hazard: ${categories.join(
              ', '
            )} with peak flood depth ${maxWaterDepth}cm. Unified tactical mission dispatched to centroid [${centroid.join(
              ', '
            )}].`
          : `Standalone emergency beacon (${categories[0]}) at [${centroid.join(', ')}]. Water depth: ${maxWaterDepth}cm.`;

      // Acquire atomic Redis lock
      let assignedSquad = preferredTeam;
      try {
        const lockRes = await redisLockManager.acquireTeamLock(
          preferredTeam,
          `cluster-${cluster[0]._id}`
        );
        if (!lockRes.success) {
          // If preferred team is locked, select next available team
          const allStatuses = await redisLockManager.getAllTeamStatuses();
          const freeTeam = allStatuses.find((t) => t.isAvailable);
          if (freeTeam) {
            assignedSquad = freeTeam.team_id;
            await redisLockManager.acquireTeamLock(assignedSquad, `cluster-${cluster[0]._id}`);
          }
        }
      } catch (lockErr) {
        console.warn(`[Batch Dispatch Agent] Redis lock warning: ${lockErr.message}`);
      }

      const clusterEventIds = cluster.map((e) => e._id);

      // Update all events in this cluster in MongoDB
      const automatedNote = {
        authorId: cluster[0].triggeredBy?._id || cluster[0]._id,
        text: `[AUTONOMOUS 5-MIN BATCH DISPATCH]
Cluster Size: ${clusterSize} alerts consolidated
Context: ${clusterContext}
Allocated Tactical Squad: ${assignedSquad} (Locked in Redis)
Status Transition: ACKNOWLEDGED (Unified response en route)`.trim(),
        timestamp: new Date()
      };

      await SosEvent.updateMany(
        { _id: { $in: clusterEventIds } },
        {
          $set: {
            status: 'ACKNOWLEDGED',
            assignedSquad: assignedSquad,
            agentZeroAdvisory: {
              batch_cluster_size: clusterSize,
              cluster_centroid: centroid,
              dominant_hazards: categories,
              max_water_depth_cm: maxWaterDepth,
              contextual_synthesis: clusterContext,
              assigned_team: assignedSquad,
              dispatched_at: timestamp
            }
          },
          $push: {
            notes: automatedNote
          }
        }
      );

      totalAcknowledged += clusterSize;

      clusterSummaries.push({
        clusterIndex: cIdx + 1,
        alertCount: clusterSize,
        eventIds: clusterEventIds.map((id) => id.toString()),
        centroid,
        assignedSquad,
        categories,
        context: clusterContext
      });

      console.log(
        `[Batch Dispatch Agent] Cluster ${cIdx + 1}/${clusters.length}: Consolidated ${clusterSize} alerts -> Assigned & Locked ${assignedSquad} (All ACKNOWLEDGED)`
      );

      // 4. Broadcast live Socket.io notifications
      if (io) {
        const sosNamespace = io.of('/sos');

        // Broadcast batch consolidation event
        sosNamespace.emit('sos:batch_consolidated', {
          clusterIndex: cIdx + 1,
          alertCount: clusterSize,
          eventIds: clusterEventIds.map((id) => id.toString()),
          centroid,
          assignedSquad,
          context: clusterContext,
          timestamp
        });

        // Broadcast individual updated event payloads to refresh admin cards & drawers
        for (const ev of cluster) {
          sosNamespace.emit('sos:updated', {
            id: ev._id.toString(),
            status: 'ACKNOWLEDGED',
            assignedSquad: assignedSquad,
            category: ev.category,
            location: ev.location,
            waterDepthCm: ev.waterDepthCm,
            message: ev.message,
            notes: [...(ev.notes || []), automatedNote]
          });
        }

        // Notify /flow visualizer page
        sosNamespace.emit('flow:step:update', {
          incident_id: `CLUSTER_${cIdx + 1}`,
          step: 'RESOURCE_NEGOTIATION',
          status: 'COMPLETED',
          summary: `5-Min Batch Consolidation: Grouped ${clusterSize} alerts -> Dispatched ${assignedSquad}`,
          timestamp
        });
        sosNamespace.emit('flow:completed', {
          incident_id: `CLUSTER_${cIdx + 1}`,
          status: 'VERIFIED_AND_ASSIGNED',
          assigned_teams: [assignedSquad],
          context: clusterContext,
          timestamp
        });
      }
    }

    console.log(
      `[Batch Dispatch Agent] Cycle completed: ${activeEvents.length} alerts grouped into ${clusters.length} clusters, ${totalAcknowledged} marked ACKNOWLEDGED.`
    );

    return {
      success: true,
      totalActive: activeEvents.length,
      clustersProcessed: clusters.length,
      acknowledgedCount: totalAcknowledged,
      clusters: clusterSummaries,
      timestamp
    };
  } catch (error) {
    console.error('[Batch Dispatch Agent] Error in batch cycle:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Initializes the recurring 5-minute background loop for the server.
 */
function initBatchDispatchScheduler(io) {
  console.log(`[Batch Dispatch Agent] Scheduler initialized (running every 5 minutes).`);

  // Run initial pass after a short delay on server start (10 seconds)
  setTimeout(() => {
    runAutonomousBatchDispatchCycle({ io, manual: false });
  }, 10000);

  // Recurring 5-minute timer
  const intervalId = setInterval(() => {
    runAutonomousBatchDispatchCycle({ io, manual: false });
  }, BATCH_INTERVAL_MS);

  return intervalId;
}

module.exports = {
  runAutonomousBatchDispatchCycle,
  initBatchDispatchScheduler,
  clusterActiveEvents,
  chooseOptimalTeamCategory,
  CLUSTER_RADIUS_KM,
  BATCH_INTERVAL_MS
};
