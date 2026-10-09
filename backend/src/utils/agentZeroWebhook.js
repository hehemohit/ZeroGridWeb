/**
 * ZeroGrid Agent Zero Automated Webhook Trigger
 * Dispatches asynchronous event webhooks to the AWS Lambda Agent Zero microservice
 * upon arrival of severe flood telemetry or high-priority SOS distress packets.
 */

const SosEvent = require('../models/SosEvent');
const { resolveNearestGridNode } = require('./gridNodeResolver');
const { redisLockManager } = require('./redisLockClient');

const VOICE_AGENT_LAMBDA_URL = process.env.VOICE_AGENT_LAMBDA_URL || '';

/**
 * Evaluates whether an incoming SOS event qualifies for automated Agent Zero orchestration.
 */
function shouldTriggerAgentZero(sosEvent) {
  if (!sosEvent) return false;

  const waterDepth = sosEvent.waterDepthCm || 0;
  const category = (sosEvent.category || '').toUpperCase();

  // Trigger if severe water depth or high-hazard category
  if (waterDepth >= 25) return true;
  if (['FALLEN_GRID', 'WATERLOGGING', 'SUBMERGED_UNDERPASS', 'DISASTER', 'TRAPPED'].includes(category)) {
    return true;
  }

  return false;
}

/**
 * Fires an asynchronous, non-blocking webhook to Agent Zero microservice.
 * Updates the MongoDB document and broadcasts Socket.io live updates upon completion.
 *
 * @param {Object} sosEvent - The created or updated SosEvent document
 * @param {Object} [io] - Socket.io instance
 */
function triggerAgentZeroOrchestrationAsync(sosEvent, io) {
  if (!shouldTriggerAgentZero(sosEvent)) {
    return;
  }

  // Execute asynchronously off the critical path
  setImmediate(async () => {
    try {
      const coordinates = sosEvent.location?.coordinates || [72.812, 19.456];
      const resolvedNode = resolveNearestGridNode(coordinates);

      console.log(
        `[Agent Zero Webhook] Triggering autonomous orchestration for SOS ${sosEvent._id} -> Node ${resolvedNode.nodeId} (${resolvedNode.name})`
      );

      const payload = {
        action: 'orchestrate',
        incident_id: sosEvent._id.toString(),
        incident_type: sosEvent.category || 'SUBSTATION_WATER_INGRESS',
        severity: (sosEvent.waterDepthCm || 0) >= 40 ? 'CRITICAL' : 'HIGH',
        coordinates: [resolvedNode.coordinates[0], resolvedNode.coordinates[1]],
        water_depth_cm: sosEvent.waterDepthCm || 35,
        affected_node_id: resolvedNode.nodeId,
        message:
          sosEvent.message ||
          `Emergency incident logged at coordinates [${coordinates.join(', ')}] with water depth ${sosEvent.waterDepthCm || 0}cm.`,
        telemetry: {
          batteryPercentage: sosEvent.batteryPercentage,
          transport: sosEvent.transport,
          passability: sosEvent.passability,
          relayedByMule: sosEvent.relayedByMule,
        },
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s safety timeout

      const response = await fetch(VOICE_AGENT_LAMBDA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ZeroGrid-Backend-Webhook/2.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Agent Zero Webhook] HTTP ${response.status} from Lambda: ${errText}`);
        return;
      }

      const orchestrationData = await response.json();
      const directive = orchestrationData.agent_zero_directive;

      if (!directive) {
        console.warn('[Agent Zero Webhook] Received empty directive from microservice');
        return;
      }

      console.log(
        `[Agent Zero Webhook] Orchestration completed successfully for SOS ${sosEvent._id}. Threat Score: ${directive.overall_threat_score}/100`
      );

      // Check for recommended squad in dispatch plan or candidate proximity teams
      const recommendedSquad =
        orchestrationData.dispatch_plan?.assigned_squad_id ||
        (orchestrationData.candidate_proximity_teams && orchestrationData.candidate_proximity_teams[0]?.team_id);

      let assignedSquad = null;
      if (recommendedSquad && !sosEvent.assignedSquad) {
        try {
          const lockResult = await redisLockManager.acquireTeamLock(recommendedSquad, sosEvent._id.toString());
          if (lockResult.success) {
            assignedSquad = recommendedSquad;
            console.log(`[Agent Zero Webhook] Atomically locked squad ${recommendedSquad} for SOS ${sosEvent._id}`);
          } else {
            console.warn(`[Agent Zero Webhook] Squad ${recommendedSquad} collision: ${lockResult.error}`);
          }
        } catch (lockErr) {
          console.warn('[Agent Zero Webhook] Redis lock acquisition error:', lockErr.message);
        }
      }

      // Construct automated system note summarizing Agent Zero's directive
      const automatedNote = {
        authorId: sosEvent.triggeredBy || sosEvent._id,
        text: `[AGENT ZERO AUTONOMOUS DIRECTIVE]
Threat Score: ${directive.overall_threat_score}/100
Executive Summary: ${directive.executive_summary}
Automated Actions: ${directive.immediate_automated_actions?.join(', ') || 'None'}
Hospital Lifeline: ${directive.hospital_lifeline_protocol || 'Standard Backup'}
Assigned Squad: ${assignedSquad || sosEvent.assignedSquad || 'None'}`.trim(),
        timestamp: new Date(),
      };

      const updateFields = {
        agentZeroAdvisory: orchestrationData,
        affectedNodeId: resolvedNode.nodeId,
      };
      if (assignedSquad) {
        updateFields.assignedSquad = assignedSquad;
      }

      // Persist advisory, affectedNodeId, and assignedSquad into MongoDB
      const updatedDoc = await SosEvent.findByIdAndUpdate(
        sosEvent._id,
        {
          $set: updateFields,
          $push: {
            notes: automatedNote,
          },
        },
        { returnDocument: 'after' }
      ).populate({
        path: 'triggeredBy',
        select: 'displayName email phoneNumber photoUrl',
      });

      // Broadcast live Socket.io notification to all connected admins
      if (io) {
        io.of('/sos').emit('sos:agent_zero_orchestrated', {
          sosId: sosEvent._id.toString(),
          affectedNodeId: resolvedNode.nodeId,
          threatScore: directive.overall_threat_score,
          directive: directive,
          orchestration: orchestrationData,
        });

        // Also emit updated SOS event to refresh drawers and lists
        io.of('/sos').emit('sos:updated', {
          id: updatedDoc._id,
          ...updatedDoc.toObject(),
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[Agent Zero Webhook] Request timed out for SOS ${sosEvent._id}`);
      } else {
        console.error(`[Agent Zero Webhook] Error executing autonomous orchestration:`, err.message);
      }
    }
  });
}

module.exports = {
  VOICE_AGENT_LAMBDA_URL,
  shouldTriggerAgentZero,
  triggerAgentZeroOrchestrationAsync,
};
