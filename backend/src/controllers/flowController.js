/**
 * ZeroGrid Autonomous Multi-Agent Flow Controller
 * Bridges frontend `/flow` test bench to the Agent Zero microservice,
 * integrates live hybrid weather/tidal telemetry, broadcasts real-time Socket.io steps,
 * and handles scenario presets and error injection tests.
 */

const tideService = require('../utils/tideService');
const weatherService = require('../utils/weatherService');
const { resolveNearestGridNode } = require('../utils/gridNodeResolver');

const VOICE_AGENT_LAMBDA_URL =
  process.env.VOICE_AGENT_LAMBDA_URL ||
  'https://j6uweuhbak.execute-api.ap-south-1.amazonaws.com/default/voice-agent-microservice';
const VOICE_AGENT_LOCAL_URL = process.env.VOICE_AGENT_LOCAL_URL || 'http://localhost:8000';

/**
 * Returns available scenario presets for the /flow test bench.
 */
function getScenarioPresets(req, res) {
  const presets = [
    {
      id: 'scenario_resource_deficit',
      title: 'Resource Deficit & Sub-Agent Reformulation Loop',
      badge: 'Negotiation Loop',
      badgeColor: 'amber',
      description: 'Sub-agent requests 4 rescue squads, but only 1 IDLE unit is free in Redis. Triggers live recursive feedback loop and plan reformulation.',
      incident: {
        incident_id: 'INC_DEFICIT_VIRAR_01',
        incident_type: 'SUBSTATION_WATER_INGRESS',
        severity: 'CRITICAL',
        coordinates: [19.4534, 72.8061],
        water_depth_cm: 55.0,
        message: 'Severe flood surge in Virar East switchyard. Standing water approaching 33kV busbars. Immediate multi-squad intervention demanded.'
      },
      simulated_available_teams: ['TEAM_NDRF_ALPHA'], // Only 1 team free
      inject_fault_at_step: null
    },
    {
      id: 'scenario_optimal_dispatch',
      title: 'Optimal Multi-Agent Dispatch (Direct Allocation)',
      badge: 'Happy Path',
      badgeColor: 'emerald',
      description: 'Sufficient emergency units are free in Redis. Triage, Grid, and Dispatch sub-agents formulate requirements and Agent Zero locks units in single pass.',
      incident: {
        incident_id: 'INC_OPTIMAL_VASAI_02',
        incident_type: 'SUBSTATION_WATER_INGRESS',
        severity: 'HIGH',
        coordinates: [19.3820, 72.8280],
        water_depth_cm: 38.0,
        message: 'Water ingress at Vasai West primary substation. Drain channels obstructed. Linemen and pump crews required.'
      },
      simulated_available_teams: ['TEAM_NDRF_ALPHA', 'TEAM_PUMP_CREW_01', 'TEAM_LINEMEN_SQUAD_04'],
      inject_fault_at_step: null
    },
    {
      id: 'scenario_false_alert',
      title: 'False Alarm & Anomaly Noise Filtering',
      badge: 'Confidence Filter',
      badgeColor: 'blue',
      description: 'Spurious sensor noise or unverified report. Confidence Calculator Agent evaluates low credibility (< 0.70) and short-circuits before downstream runs.',
      incident: {
        incident_id: 'INC_FALSE_ALARM_03',
        incident_type: 'SENSOR_ANOMALY',
        severity: 'LOW',
        coordinates: [19.4500, 72.8100],
        water_depth_cm: 4.0,
        message: 'Brief water sensor flicker detected during dry clear skies. No visual flooding confirmed.'
      },
      simulated_available_teams: null,
      inject_fault_at_step: null
    },
    {
      id: 'scenario_fault_injection',
      title: 'Mid-Pipeline Fault Injection & State Preservation',
      badge: 'Fault Recovery',
      badgeColor: 'red',
      description: 'Injects a synthetic failure at Step 4 (Resource Negotiation). The checkpoint engine intercepts error, preserves last valid agent state, and allows recovery.',
      incident: {
        incident_id: 'INC_FAULT_TEST_04',
        incident_type: 'SUBSTATION_WATER_INGRESS',
        severity: 'CRITICAL',
        coordinates: [19.4534, 72.8061],
        water_depth_cm: 60.0,
        message: 'Critical emergency scenario used to verify fault resilience and state checkpoint integrity.'
      },
      simulated_available_teams: ['TEAM_NDRF_ALPHA'],
      inject_fault_at_step: 'RESOURCE_NEGOTIATION'
    }
  ];

  return res.status(200).json({ success: true, presets });
}

/**
 * Executes the Autonomous Multi-Agent Negotiation Pipeline with live hybrid weather/tides,
 * Socket.io step broadcasting, and proxy to the voice-agent microservice.
 */
async function executeFlowPipeline(req, res) {
  const io = req.app.get('io');
  const sosNamespace = io ? io.of('/sos') : null;

  try {
    const {
      incident_id = `FLOW_INC_${Date.now()}`,
      incident_type = 'SUBSTATION_WATER_INGRESS',
      severity = 'CRITICAL',
      coordinates = [19.4534, 72.8061],
      water_depth_cm = 45.0,
      affected_node_id,
      message,
      weather_override,
      simulated_available_teams,
      inject_fault_at_step
    } = req.body;

    const lat = coordinates[0] || 19.4534;
    const lng = coordinates[1] || 72.8061;

    // 1. Resolve Grid Node
    const resolvedNode = resolveNearestGridNode([lng, lat]);
    const finalNodeId = affected_node_id || resolvedNode.nodeId || 'SUB_VIRAR_EAST_01';

    // Broadcast Pipeline Initiated
    if (sosNamespace) {
      sosNamespace.emit('flow:step:update', {
        incident_id,
        step: 'INIT',
        status: 'RUNNING',
        summary: `Initiating multi-agent pipeline for node ${finalNodeId} (${resolvedNode.name || 'Virar'})`,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Hybrid Weather & Tidal Telemetry Resolution
    let weatherContext = {
      rainfall_mm_per_hr: 45.0,
      tidal_surge_m: 2.1,
      source: 'SIMULATED_DEFAULTS'
    };

    try {
      const [liveTide, liveRain] = await Promise.allSettled([
        tideService.getTideConditions(lat, lng),
        weatherService.getRainfall(lat, lng)
      ]);

      if (liveRain.status === 'fulfilled' && liveRain.value) {
        weatherContext.rainfall_mm_per_hr = liveRain.value.hourlyRainfallMm || liveRain.value.rainfallMm || 45.0;
        weatherContext.source = 'LIVE_TELEMETRY';
      }
      if (liveTide.status === 'fulfilled' && liveTide.value) {
        weatherContext.tidal_surge_m = liveTide.value.currentHeightM || liveTide.value.surgeHeightM || 2.1;
        weatherContext.source = 'LIVE_TELEMETRY';
      }
    } catch (e) {
      console.warn('[FlowController] Telemetry lookup fallback:', e.message);
    }

    // Merge manual overrides from UI sliders if supplied
    if (weather_override) {
      if (weather_override.rainfall_mm_per_hr !== undefined) {
        weatherContext.rainfall_mm_per_hr = Number(weather_override.rainfall_mm_per_hr);
        weatherContext.source = 'UI_MANUAL_OVERRIDE';
      }
      if (weather_override.tidal_surge_m !== undefined) {
        weatherContext.tidal_surge_m = Number(weather_override.tidal_surge_m);
        weatherContext.source = 'UI_MANUAL_OVERRIDE';
      }
    }

    // Broadcast Step 1: Confidence
    if (sosNamespace) {
      sosNamespace.emit('flow:step:update', {
        incident_id,
        step: 'CONFIDENCE_CALCULATION',
        status: 'RUNNING',
        summary: 'Confidence Calculator Agent evaluating alert credibility and historical correlation...',
        timestamp: new Date().toISOString()
      });
    }

    // 3. Assemble Microservice Request Payload
    const pipelinePayload = {
      incident_id,
      incident_type,
      severity,
      coordinates: [lat, lng],
      water_depth_cm: Number(water_depth_cm),
      affected_node_id: finalNodeId,
      message: message || `Severe flood threat reported near node ${finalNodeId}. Water ingress at ${water_depth_cm}cm.`,
      weather_context: weatherContext,
      simulated_available_teams: Array.isArray(simulated_available_teams) ? simulated_available_teams : undefined,
      inject_fault_at_step: inject_fault_at_step || undefined
    };

    // 4. Try Local or Lambda Microservice
    let pipelineResponse = null;
    let targetEndpoint = null;

    // Check Local microservice first, then Lambda
    const candidateUrls = [
      `${VOICE_AGENT_LOCAL_URL}/api/negotiation-pipeline`,
      `${VOICE_AGENT_LAMBDA_URL}/api/negotiation-pipeline`,
      VOICE_AGENT_LAMBDA_URL // fallback universal POST
    ];

    for (const url of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for LLMs

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ZeroGrid-Flow-Controller/2.0'
          },
          body: JSON.stringify(
            url === VOICE_AGENT_LAMBDA_URL && !url.includes('/api/')
              ? { action: 'flow', ...pipelinePayload }
              : pipelinePayload
          ),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          pipelineResponse = await res.json();
          targetEndpoint = url;
          break;
        }
      } catch (err) {
        // Try next candidate endpoint
      }
    }

    // 5. Resilient Local Fallback Engine if remote microservice is offline or error injected
    if (!pipelineResponse || inject_fault_at_step) {
      if (inject_fault_at_step) {
        console.log(`[FlowController] Synthetic fault injected at step [${inject_fault_at_step}]`);
      } else {
        console.warn('[FlowController] Microservice offline. Executing built-in deterministic flow engine...');
      }
      pipelineResponse = executeDeterministicPipeline(pipelinePayload, weatherContext);
    }

    // 6. Normalize pipelineResponse fields for consistent frontend contracts
    if (pipelineResponse) {
      if (!pipelineResponse.status && pipelineResponse.agent_zero_directive) {
        pipelineResponse.status = 'VERIFIED_AND_ASSIGNED';
      }
      if (!pipelineResponse.assigned_teams && pipelineResponse.resource_negotiation?.assigned_teams) {
        pipelineResponse.assigned_teams = pipelineResponse.resource_negotiation.assigned_teams;
      } else if (!pipelineResponse.assigned_teams) {
        pipelineResponse.assigned_teams =
          Array.isArray(simulated_available_teams) && simulated_available_teams.length > 0
            ? simulated_available_teams
            : ['TEAM_NDRF_ALPHA', 'TEAM_PUMP_CREW_01'];
      }
      if (!pipelineResponse.resource_negotiation) {
        const isDeficit = Array.isArray(simulated_available_teams) && simulated_available_teams.length < 3;
        pipelineResponse.resource_negotiation = {
          success: true,
          rounds_count: isDeficit ? 2 : 1,
          assigned_teams: pipelineResponse.assigned_teams,
          negotiation_log: [
            {
              round: 1,
              status: isDeficit ? 'CONSTRAINT_REFORMULATING' : 'MATCHED',
              available: pipelineResponse.assigned_teams.length,
              requested: 3,
              notes: isDeficit
                ? `Sub-agent adjusted requirements down to ${pipelineResponse.assigned_teams.length} units due to field pool limit.`
                : 'Directly matched requested squads with available IDLE pool.'
            }
          ]
        };
      }
      if (!pipelineResponse.confidence_data) {
        pipelineResponse.confidence_data = {
          agent: 'CONFIDENCE_CALCULATOR',
          confidence_score: 0.91,
          is_valid_alert: true,
          veracity_classification: 'VERIFIED_CRITICAL',
          context: `Validated against monsoonal flood parameters near ${finalNodeId}.`
        };
      }
    }

    // 7. Broadcast Real-Time Steps & Completion over Socket.io
    if (sosNamespace && pipelineResponse) {
      const timeline = pipelineResponse.pipeline_checkpoint?.execution_timeline || pipelineResponse.execution_timeline || [];
      
      // Emit chronological steps to any connected clients
      timeline.forEach((stepItem) => {
        sosNamespace.emit('flow:step:update', {
          incident_id,
          step: stepItem.step,
          status: stepItem.status,
          summary: stepItem.summary,
          timestamp: stepItem.time_iso || new Date().toISOString()
        });
      });

      if (pipelineResponse.status === 'ERROR_PRESERVED_STATE') {
        sosNamespace.emit('flow:error', {
          incident_id,
          failed_step: pipelineResponse.failed_step,
          error: pipelineResponse.error,
          preserved_state: pipelineResponse.preserved_state,
          timestamp: new Date().toISOString()
        });
      } else {
        sosNamespace.emit('flow:completed', {
          incident_id,
          status: pipelineResponse.status,
          assigned_teams: pipelineResponse.assigned_teams,
          rounds_count: pipelineResponse.resource_negotiation?.rounds_count || 1,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({
      success: true,
      incident_id,
      resolved_node: resolvedNode,
      weather_telemetry: weatherContext,
      service_endpoint: targetEndpoint || 'BUILTIN_DETERMINISTIC_ENGINE',
      pipeline_result: pipelineResponse
    });

  } catch (err) {
    console.error('[FlowController Error]', err);
    if (sosNamespace) {
      sosNamespace.emit('flow:error', {
        incident_id: req.body?.incident_id || 'UNKNOWN',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

/**
 * Built-in fallback execution engine that mirrors the Python logic
 * when the Python FastAPI server is not currently running.
 */
function executeDeterministicPipeline(payload, weatherContext) {
  const { incident_id, water_depth_cm, inject_fault_at_step, simulated_available_teams } = payload;
  const isFalseAlert = water_depth_cm < 10.0;

  const timeline = [];
  const now = () => new Date().toISOString();

  // Step 1: Confidence
  timeline.push({ step: 'CONFIDENCE_CALCULATION', status: 'RUNNING', summary: 'Scoring alert credibility...', time_iso: now() });
  
  const confidenceScore = isFalseAlert ? 0.42 : 0.91;
  const confidenceData = {
    agent: 'CONFIDENCE_CALCULATOR',
    confidence_score: confidenceScore,
    is_valid_alert: !isFalseAlert,
    veracity_classification: isFalseAlert ? 'FALSE_ALARM' : 'VERIFIED_CRITICAL',
    context: `Correlated with high-risk coastal drainage corridor (Rain: ${weatherContext.rainfall_mm_per_hr}mm/hr).`
  };

  if (isFalseAlert) {
    timeline.push({ step: 'CONFIDENCE_CALCULATION', status: 'FILTERED_FALSE_ALERT', summary: 'Alert filtered due to low confidence score.', time_iso: now() });
    return {
      incident_id,
      status: 'FALSE_ALERT_FILTERED',
      confidence_data: confidenceData,
      execution_timeline: timeline
    };
  }

  timeline.push({ step: 'CONFIDENCE_CALCULATION', status: 'COMPLETED', summary: `Confidence validated at ${confidenceScore * 100}%`, time_iso: now() });

  // Step 2: Sub-Agents
  timeline.push({ step: 'SUB_AGENT_COLLABORATION', status: 'RUNNING', summary: 'Executing Triage, Grid, and Dispatch sub-agents...', time_iso: now() });
  
  if (inject_fault_at_step === 'SUB_AGENT_COLLABORATION') {
    timeline.push({ step: 'SUB_AGENT_COLLABORATION', status: 'ERROR_PRESERVED', summary: 'Synthetic error injected.', time_iso: now() });
    return {
      incident_id,
      status: 'ERROR_PRESERVED_STATE',
      failed_step: 'SUB_AGENT_COLLABORATION',
      error: 'Synthetic error injected during SUB_AGENT_COLLABORATION.',
      preserved_state: { confidence: confidenceData },
      execution_timeline: timeline,
      can_resume: true
    };
  }

  const subAgentsData = {
    triage: {
      agent: 'TRIAGE_COMMANDER',
      threat_level: 'CRITICAL',
      human_safety_hazard: 'Critical',
      casualty_risk_assessment: 'Standing water approaching live transformer busbar.',
      evacuation_recommended: true
    },
    grid: {
      agent: 'GRID_OPERATIONS',
      grid_stability_status: 'CRITICAL_RISK',
      cascade_risk: 'High',
      immediate_breakers_to_trip: ['FEEDER_33KV_L1', 'XFMR_WARD4_02_BREAKER'],
      hospital_power_isolation_plan: 'Energize tie-line from SUB_VASAI_WEST_03 to Sanjeevani Hospital ICU.'
    },
    dispatch: {
      agent: 'TACTICAL_DISPATCH',
      team_type_needed: 'FLOOD_RESCUE',
      team_count_needed: 3,
      staging_area: 'Virar East Elevated Overpass (+14m)'
    }
  };

  timeline.push({ step: 'SUB_AGENT_COLLABORATION', status: 'COMPLETED', summary: 'Sub-agents formulated triage, grid isolation, and dispatch requirements.', time_iso: now() });

  // Step 3: Requirements
  timeline.push({ step: 'REQUIREMENTS_GENERATION', status: 'COMPLETED', summary: 'Requirements generated: 3 squads needed.', time_iso: now() });

  // Step 4: Resource Negotiation Loop
  timeline.push({ step: 'RESOURCE_NEGOTIATION', status: 'RUNNING', summary: 'Agent Zero checking Redis atomic lock pool...', time_iso: now() });

  if (inject_fault_at_step === 'RESOURCE_NEGOTIATION') {
    timeline.push({ step: 'RESOURCE_NEGOTIATION', status: 'ERROR_PRESERVED', summary: 'Synthetic error intercepted. Prior state safely checkpointed.', time_iso: now() });
    return {
      incident_id,
      status: 'ERROR_PRESERVED_STATE',
      failed_step: 'RESOURCE_NEGOTIATION',
      error: 'Synthetic error injected during RESOURCE_NEGOTIATION.',
      preserved_state: {
        confidence: confidenceData,
        sub_agents: subAgentsData,
        requirements: { team_count_needed: 3, team_type: 'FLOOD_RESCUE' }
      },
      execution_timeline: timeline,
      can_resume: true
    };
  }

  const availablePool = Array.isArray(simulated_available_teams) ? simulated_available_teams : ['TEAM_NDRF_ALPHA'];
  let assignedTeams = [];
  let roundsCount = 1;
  const negotiationLog = [];

  if (availablePool.length < 3) {
    roundsCount = 2;
    negotiationLog.push({
      round: 1,
      status: 'CONSTRAINT_REFORMULATING',
      requested: 3,
      available: availablePool.length,
      adjusted_to: availablePool.length,
      reformulation_notes: `Sub-agent adjusted requirements from 3 down to ${availablePool.length} units. Prioritizing primary lifeline transformer.`
    });
    assignedTeams = availablePool;
  } else {
    assignedTeams = availablePool.slice(0, 3);
  }

  timeline.push({
    step: 'RESOURCE_NEGOTIATION',
    status: 'COMPLETED',
    summary: `Resource negotiation finalized in ${roundsCount} round(s). Teams secured: ${assignedTeams.join(', ')}.`,
    time_iso: now()
  });

  // Step 5: Master Synthesis
  timeline.push({ step: 'MASTER_SYNTHESIS', status: 'COMPLETED', summary: 'Agent Zero master directive synthesized with hospital lifeline protocol.', time_iso: now() });

  // Step 6: Atomic Lock
  timeline.push({ step: 'ATOMIC_LOCK_AND_DISPATCH', status: 'COMPLETED', summary: `Atomically locked ${assignedTeams.length} units in Redis cluster.`, time_iso: now() });

  return {
    incident_id,
    status: 'VERIFIED_AND_ASSIGNED',
    assigned_teams: assignedTeams,
    agent_zero_directive: {
      executive_summary: 'Critical water intrusion at Virar East Substation threatens 33kV switchyard. Feeder L1 trip executed; hospital backup tie-line energized.',
      overall_threat_score: 89,
      hospital_lifeline_protocol: 'Sanjeevani Hospital isolated from flooded primary; energized via Vasai 33kV backup tie line.',
      immediate_automated_actions: ['Trip FEEDER_33KV_L1 breaker', 'Energize Vasai backup tie-line'],
      field_operations_checklist: ['Deploy dewatering pumps at switchyard', 'Linemen confirm zero-voltage verification']
    },
    sub_agents: subAgentsData,
    confidence_data: confidenceData,
    resource_negotiation: {
      success: true,
      rounds_count: roundsCount,
      assigned_teams: assignedTeams,
      negotiation_log: negotiationLog
    },
    pipeline_checkpoint: {
      step: 'ATOMIC_LOCK_AND_DISPATCH',
      execution_timeline: timeline,
      last_valid_data: {
        confidence: confidenceData,
        sub_agents: subAgentsData,
        locked_teams: assignedTeams
      }
    }
  };
}

module.exports = {
  getScenarioPresets,
  executeFlowPipeline
};
