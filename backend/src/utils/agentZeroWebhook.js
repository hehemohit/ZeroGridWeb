/**
 * ZeroGrid Agent Zero Automated Webhook Trigger
 * Dispatches asynchronous event webhooks to the AWS Lambda Agent Zero microservice
 * upon arrival of severe flood telemetry or high-priority SOS distress packets.
 */

const SosEvent = require('../models/SosEvent');
const { resolveNearestGridNode } = require('./gridNodeResolver');
const { redisLockManager } = require('./redisLockClient');
const { executeDeterministicPipeline, classifyCrisisDomain } = require('../controllers/flowController');

const VOICE_AGENT_LAMBDA_URL = process.env.VOICE_AGENT_LAMBDA_URL || '';

/**
 * Evaluates whether an incoming SOS event qualifies for automated Agent Zero orchestration.
 */
function shouldTriggerAgentZero(sosEvent) {
  if (!sosEvent) return false;
  // Trigger Agent Zero for all active SOS events so teams are autonomously assigned and visible on /flow
  if (sosEvent.status === 'RESOLVED') return false;
  return true;
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

      const waterDepth = sosEvent.waterDepthCm !== undefined && sosEvent.waterDepthCm !== null ? Number(sosEvent.waterDepthCm) : 0;
      const tempC = sosEvent.temperatureC !== undefined && sosEvent.temperatureC !== null ? Number(sosEvent.temperatureC) : 28;

      const payload = {
        action: 'flow',
        incident_id: sosEvent._id.toString(),
        incident_type: sosEvent.category || 'SUBSTATION_WATER_INGRESS',
        severity: waterDepth >= 40 ? 'CRITICAL' : 'HIGH',
        coordinates: [resolvedNode.coordinates[0], resolvedNode.coordinates[1]],
        water_depth_cm: waterDepth,
        temperature_c: tempC,
        affected_node_id: resolvedNode.nodeId,
        message:
          sosEvent.message ||
          `Emergency incident logged at coordinates [${coordinates.join(', ')}] with category ${sosEvent.category || 'EMERGENCY'} (water depth: ${waterDepth}cm).`,
        telemetry: {
          batteryPercentage: sosEvent.batteryPercentage,
          transport: sosEvent.transport,
          passability: sosEvent.passability,
          relayedByMule: sosEvent.relayedByMule,
        },
      };

      const weatherContext = {
        rainfall_mm_per_hr: (waterDepth > 30 ? 45 : 10),
        tidal_surge_m: 2.1,
        source: 'ZONE_WEATHER_RADAR'
      };

      // Broadcast initial step updates to Socket.io /sos namespace
      if (io) {
        io.of('/sos').emit('flow:step:update', {
          incident_id: sosEvent._id.toString(),
          step: 'INIT',
          status: 'RUNNING',
          summary: `Incoming Live SOS ${sosEvent._id} triggered Agent Zero for node ${resolvedNode.nodeId}`,
          timestamp: new Date().toISOString()
        });
        io.of('/sos').emit('flow:step:update', {
          incident_id: sosEvent._id.toString(),
          step: 'CONFIDENCE_CALCULATION',
          status: 'RUNNING',
          summary: `Evaluating alert credibility against zone telemetry (Category: ${sosEvent.category || 'EMERGENCY'}, Depth: ${waterDepth}cm, Temp: ${tempC}°C)...`,
          timestamp: new Date().toISOString()
        });
      }

      let pipelineResponse = null;

      // Check remote microservice if explicitly configured and responsive
      if (VOICE_AGENT_LAMBDA_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout
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
          if (response.ok) {
            pipelineResponse = await response.json();
          }
        } catch (reqErr) {
          console.warn(`[Agent Zero Webhook] Remote microservice lookup: ${reqErr.message}`);
        }
      }

      // Execute unified authentic 4-Phase Circular Agent 0 Pipeline with MongoDB 160 Admin Workforce
      if (!pipelineResponse || !pipelineResponse.workforce_allocation) {
        console.log(`[Agent Zero Webhook] Executing unified autonomous 4-phase Agent 0 pipeline for SOS ${sosEvent._id}...`);
        pipelineResponse = executeDeterministicPipeline(payload, weatherContext);
      }

      const directive = pipelineResponse.agent_zero_directive;
      const workforce = pipelineResponse.workforce_allocation;
      const targetDepartment = pipelineResponse.domain_demand?.targetDepartment || workforce?.target_department || 'FLOOD_MANAGEMENT';
      const requiredTags = pipelineResponse.domain_demand?.requiredTags || workforce?.required_tags || [];
      const fallbackTags = pipelineResponse.domain_demand?.fallbackTags || workforce?.fallback_tags || [];
      const dispatchMessage = pipelineResponse.dispatch_message || workforce?.dispatch_message || '';
      const assignedNames = pipelineResponse.assigned_teams || workforce?.assigned_teams || [];
      const primaryLead = pipelineResponse.lead_commander || assignedNames[0] || 'Operational Commander';

      console.log(
        `[Agent Zero Webhook] Autonomous orchestration completed for SOS ${sosEvent._id}. Domain: ${targetDepartment}, Threat: ${directive?.overall_threat_score || 85}/100, Mobilized: ${assignedNames.join(', ')}`
      );

      // Lock primary assigned personnel email or ID in Redis instead of legacy TEAM_NDRF_ALPHA
      const primaryLockKey = workforce?.personnel_details?.[0]?.email || assignedNames[0] || `${targetDepartment}_LEAD`;
      let assignedSquad = primaryLead;
      if (primaryLockKey) {
        try {
          const lockResult = await redisLockManager.acquireTeamLock(primaryLockKey, sosEvent._id.toString());
          if (lockResult.success) {
            console.log(`[Agent Zero Webhook] Atomically locked personnel ${primaryLockKey} for SOS ${sosEvent._id}`);
          } else {
            console.warn(`[Agent Zero Webhook] Personnel ${primaryLockKey} lock status: ${lockResult.error}`);
          }
        } catch (lockErr) {
          console.warn('[Agent Zero Webhook] Redis lock acquisition error:', lockErr.message);
        }
      }

      // Construct automated system note summarizing Agent Zero's directive and requiredTags loadout
      const automatedNote = {
        authorId: sosEvent.triggeredBy || sosEvent._id,
        text: `[AGENT ZERO AUTONOMOUS DIRECTIVE]
Threat Score: ${directive?.overall_threat_score || 85}/100
Executive Summary: ${directive?.executive_summary || 'Autonomous response initialized.'}
Department: ${targetDepartment}
Mandatory Tags: [${requiredTags.join(', ')}]
Automated Actions: ${directive?.immediate_automated_actions?.join(', ') || 'None'}
Hospital Lifeline: ${directive?.hospital_lifeline_protocol || 'Standard Backup'}
Assigned Squad: ${assignedSquad || 'None'}

[DISPATCH LOADOUT DIRECTIVE]
${dispatchMessage || `Mandatory gear loadout: [${requiredTags.join(', ')}]`}`.trim(),
        timestamp: new Date(),
      };

      const updateFields = {
        agentZeroAdvisory: pipelineResponse,
        affectedNodeId: resolvedNode.nodeId,
        assignedSquad: assignedSquad
      };

      if (workforce) {
        updateFields.workforceDemand = {
          targetDepartment: workforce.target_department || targetDepartment,
          requiredRole: pipelineResponse.domain_demand?.requiredRole || `${workforce.demanded_count || 1} units`,
          teamCount: workforce.demanded_count || 1,
          requiredTags: workforce.required_tags || requiredTags,
          fallbackDepartment: workforce.fallback_department_used || null,
          fallbackTags: workforce.fallback_tags || fallbackTags,
          shortfallHandled: Boolean(workforce.fallback_department_used),
          dispatchedMessage: dispatchMessage
        };
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
        // 1. Emit chronological steps so /flow canvas updates dynamically
        const timeline = pipelineResponse.pipeline_checkpoint?.execution_timeline || pipelineResponse.execution_timeline || [];
        timeline.forEach((stepItem) => {
          io.of('/sos').emit('flow:step:update', {
            incident_id: sosEvent._id.toString(),
            step: stepItem.step,
            status: stepItem.status,
            summary: stepItem.summary,
            timestamp: stepItem.time_iso || new Date().toISOString()
          });
        });

        // 2. Broadcast comprehensive orchestrated payload to /flow and all admin dashboards
        io.of('/sos').emit('sos:agent_zero_orchestrated', {
          sosId: sosEvent._id.toString(),
          affectedNodeId: resolvedNode.nodeId,
          threatScore: directive?.overall_threat_score || 85,
          directive: directive,
          assignedSquad: assignedSquad,
          orchestration: pipelineResponse,
          pipeline_result: pipelineResponse,
          targetDepartment,
          requiredTags,
          fallbackTags,
          dispatchMessage,
          workforce_allocation: workforce,
          domain_demand: pipelineResponse.domain_demand,
          agent_zero_classification: pipelineResponse.agent_zero_classification,
          confidence_data: pipelineResponse.confidence_data,
          deduplication: pipelineResponse.deduplication
        });

        // 3. Broadcast specialized workforce dispatch event with mandatory requiredTags
        io.of('/sos').emit('sos:workforce:dispatched', {
          sosId: sosEvent._id.toString(),
          targetDepartment,
          fallbackDepartment: workforce?.fallback_department_used,
          requiredTags,
          fallbackTags,
          dispatchMessage,
          assignedSquad: assignedSquad,
          personnel_details: workforce?.personnel_details || [],
          threatScore: directive?.overall_threat_score || 85,
        });

        // 4. Broadcast to specific department room for targeted admin alerts
        io.of('/sos').to(targetDepartment).emit('sos:department_alert', {
          sosId: sosEvent._id.toString(),
          targetDepartment,
          requiredTags,
          dispatchMessage,
          threatScore: directive?.overall_threat_score || 85,
        });

        // 5. Complete flow pipeline step
        io.of('/sos').emit('flow:completed', {
          incident_id: sosEvent._id.toString(),
          status: pipelineResponse.status,
          pipeline_result: pipelineResponse,
          timestamp: new Date().toISOString()
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
