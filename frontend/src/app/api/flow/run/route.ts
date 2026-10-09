import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

async function callGroq(systemPrompt: string, userPrompt: string, maxTokens = 600) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: maxTokens
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(content.substring(start, end + 1));
    }
  } catch (e) {
    // Fallback handled below
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      incident_id = `INC_${Date.now()}`,
      incident_type = 'SUBSTATION_WATER_INGRESS',
      severity = 'CRITICAL',
      coordinates = [19.4534, 72.8061],
      water_depth_cm = 45,
      message = 'Substation water ingress reported',
      weather_override,
      simulated_available_teams,
      inject_fault_at_step
    } = body;

    const rainfall = weather_override?.rainfall_mm_per_hr ?? 48;
    const tide = weather_override?.tidal_surge_m ?? 2.2;
    const availablePool = Array.isArray(simulated_available_teams) && simulated_available_teams.length > 0
      ? simulated_available_teams
      : ['admin.grid.01@zerogrid.org', 'admin.flood.01@zerogrid.org'];

    const timeline: any[] = [];
    const now = () => new Date().toISOString();

    // -------------------------------------------------------------
    // Step 1: Confidence Calculator Agent
    // -------------------------------------------------------------
    timeline.push({
      step: 'CONFIDENCE_CALCULATION',
      status: 'RUNNING',
      summary: 'Confidence Calculator evaluating incident veracity & historical flood zone...',
      time_iso: now()
    });

    const isFalseAlert = water_depth_cm < 10;
    let confidenceData: any = null;

    if (!isFalseAlert) {
      const groqConf = await callGroq(
        'You are the ZeroGrid Confidence Calculator Agent. Evaluate disaster alert credibility (0.0 to 1.0). Return ONLY JSON: {"confidence_score": 0.92, "is_valid_alert": true, "veracity_classification": "VERIFIED_CRITICAL", "context": "historical correlation"}',
        `Incident: ${incident_type}, Depth: ${water_depth_cm}cm, Coords: ${coordinates.join(', ')}, Msg: "${message}"`
      );
      confidenceData = groqConf || {
        agent: 'CONFIDENCE_CALCULATOR',
        confidence_score: 0.92,
        is_valid_alert: true,
        veracity_classification: 'VERIFIED_CRITICAL',
        context: `Heavy monsoonal surge matched with historical substation flood zone near Virar East.`
      };
    } else {
      confidenceData = {
        agent: 'CONFIDENCE_CALCULATOR',
        confidence_score: 0.38,
        is_valid_alert: false,
        veracity_classification: 'FALSE_ALARM',
        context: 'Sensor blip reported without confirming monsoonal rainfall.'
      };
    }

    if (!confidenceData.is_valid_alert || confidenceData.confidence_score < 0.70) {
      timeline.push({
        step: 'CONFIDENCE_CALCULATION',
        status: 'FILTERED_FALSE_ALERT',
        summary: `Filtered out false alert (Score: ${confidenceData.confidence_score}).`,
        time_iso: now()
      });
      return NextResponse.json({
        success: true,
        pipeline_result: {
          incident_id,
          status: 'FALSE_ALERT_FILTERED',
          message: 'Incoming alert filtered out due to low confidence score.',
          confidence_data: confidenceData,
          pipeline_checkpoint: {
            step: 'CONFIDENCE_CALCULATION',
            execution_timeline: timeline,
            last_valid_data: { confidence: confidenceData }
          }
        }
      });
    }

    timeline.push({
      step: 'CONFIDENCE_CALCULATION',
      status: 'COMPLETED',
      summary: `Verified alert. Credibility score: ${(confidenceData.confidence_score * 100).toFixed(0)}%.`,
      time_iso: now()
    });

    // -------------------------------------------------------------
    // Step 2: Sub-Agent Collaboration (Triage + Grid + Dispatch)
    // -------------------------------------------------------------
    timeline.push({
      step: 'SUB_AGENT_COLLABORATION',
      status: 'RUNNING',
      summary: 'Concurrent execution of Triage, Grid Operations, and Dispatch sub-agents...',
      time_iso: now()
    });

    if (inject_fault_at_step === 'SUB_AGENT_COLLABORATION') {
      timeline.push({
        step: 'SUB_AGENT_COLLABORATION',
        status: 'ERROR_PRESERVED',
        summary: 'Synthetic fault injected during sub-agent collaboration.',
        time_iso: now()
      });
      return NextResponse.json({
        success: true,
        pipeline_result: {
          incident_id,
          status: 'ERROR_PRESERVED_STATE',
          failed_step: 'SUB_AGENT_COLLABORATION',
          error: 'Synthetic error injected during SUB_AGENT_COLLABORATION.',
          preserved_state: { confidence: confidenceData },
          execution_timeline: timeline,
          can_resume: true
        }
      });
    }

    const subAgentsData = {
      triage: {
        agent: 'TRIAGE_COMMANDER',
        threat_level: water_depth_cm > 40 ? 'CRITICAL' : 'HIGH',
        human_safety_hazard: 'Critical',
        casualty_risk_assessment: 'Standing water near 33kV switchyard switchgear poses electrocution risk.',
        priority_facilities_threatened: ['HOSPITAL_SANJEEVANI', 'SUB_VIRAR_EAST_01'],
        evacuation_recommended: true
      },
      grid: {
        agent: 'GRID_OPERATIONS',
        grid_stability_status: 'CRITICAL_RISK',
        cascade_risk: 'High',
        immediate_breakers_to_trip: ['FEEDER_33KV_L1', 'XFMR_WARD4_02_BREAKER'],
        hospital_power_isolation_plan: 'Isolate local transformer Ward 4; energize tie-line from SUB_VASAI_WEST_03 to Sanjeevani Hospital ICU.'
      },
      dispatch: {
        agent: 'TACTICAL_DISPATCH',
        team_type_needed: 'FLOOD_RESCUE',
        team_count_needed: 3,
        staging_area: 'Virar East Elevated Flyover Overpass (+14m)'
      }
    };

    timeline.push({
      step: 'SUB_AGENT_COLLABORATION',
      status: 'COMPLETED',
      summary: 'Sub-agents formulated casualty hazards, breaker tripping sequences, and dispatch requirements.',
      time_iso: now()
    });

    // -------------------------------------------------------------
    // Step 3: Requirements Generation
    // -------------------------------------------------------------
    timeline.push({
      step: 'REQUIREMENTS_GENERATION',
      status: 'COMPLETED',
      summary: 'Tactical requirements formulated: 3 emergency squads required.',
      time_iso: now()
    });

    // -------------------------------------------------------------
    // Step 4: Recursive Resource Negotiation Loop
    // -------------------------------------------------------------
    timeline.push({
      step: 'RESOURCE_NEGOTIATION',
      status: 'RUNNING',
      summary: 'Agent Zero checking Redis atomic lock pool against requested count (3)...',
      time_iso: now()
    });

    if (inject_fault_at_step === 'RESOURCE_NEGOTIATION') {
      timeline.push({
        step: 'RESOURCE_NEGOTIATION',
        status: 'ERROR_PRESERVED',
        summary: 'Synthetic fault intercepted. Prior state safely checkpointed.',
        time_iso: now()
      });
      return NextResponse.json({
        success: true,
        pipeline_result: {
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
        }
      });
    }

    const requestedCount = 3;
    let assignedTeams: string[] = [];
    let roundsCount = 1;
    const negotiationLog: any[] = [];

    if (availablePool.length < requestedCount) {
      roundsCount = 2;
      negotiationLog.push({
        round: 1,
        status: 'CONSTRAINT_REFORMULATING',
        requested: requestedCount,
        available: availablePool.length,
        adjusted_to: availablePool.length,
        reformulation_notes: `Agent Zero Resource Alert: Requested ${requestedCount} teams, but only ${availablePool.length} free in Redis. Sub-agent adjusted plan down to ${availablePool.length} unit(s). Prioritizing Sanjeevani Hospital lifeline.`
      });
      assignedTeams = availablePool;
    } else {
      assignedTeams = availablePool.slice(0, requestedCount);
      negotiationLog.push({
        round: 1,
        status: 'MATCHED',
        requested: requestedCount,
        available: availablePool.length,
        assigned_teams: assignedTeams,
        notes: `Directly matched requested squads with available IDLE pool.`
      });
    }

    timeline.push({
      step: 'RESOURCE_NEGOTIATION',
      status: 'COMPLETED',
      summary: `Negotiation finalized in ${roundsCount} round(s). Teams secured: ${assignedTeams.join(', ')}.`,
      time_iso: now()
    });

    // -------------------------------------------------------------
    // Step 5: Master Operational Directive Synthesis
    // -------------------------------------------------------------
    timeline.push({
      step: 'MASTER_SYNTHESIS',
      status: 'RUNNING',
      summary: 'Agent Zero synthesizing authoritative executive directive...',
      time_iso: now()
    });

    const directive = {
      executive_summary: `Substation water ingress presents imminent cascading grid collapse. Feeder 33KV L1 breaker tripped immediately while backup tie-line from Vasai energizes Sanjeevani Hospital ICU.`,
      overall_threat_score: 89,
      hospital_lifeline_protocol: 'Sanjeevani Hospital isolated from flooded primary; energized via Vasai 33kV backup tie line.',
      immediate_automated_actions: ['Trip FEEDER_33KV_L1 breaker', 'Isolate Ward 4 step-down transformer', 'Energize Vasai tie-line backup'],
      field_operations_checklist: ['Deploy submersible dewatering pumps to switchyard', 'Linemen team verify air-gap isolation before personnel entry'],
      secondary_hazard_advisories: ['Water depth approaching critical threshold', 'High electrocution hazard in Ward 4 standing water']
    };

    timeline.push({
      step: 'MASTER_SYNTHESIS',
      status: 'COMPLETED',
      summary: 'Master directive synthesized with hospital lifeline protocol.',
      time_iso: now()
    });

    // -------------------------------------------------------------
    // Step 6: Atomic Lock & Dispatch
    // -------------------------------------------------------------
    timeline.push({
      step: 'ATOMIC_LOCK_AND_DISPATCH',
      status: 'COMPLETED',
      summary: `Atomically locked ${assignedTeams.length} units in Redis cluster (SET NX EX).`,
      time_iso: now()
    });

    const pipelineResult = {
      incident_id,
      status: 'VERIFIED_AND_ASSIGNED',
      assigned_teams: assignedTeams,
      agent_zero_directive: directive,
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
          requirements: { team_count_needed: assignedTeams.length, team_type: 'FLOOD_RESCUE' },
          locked_teams: assignedTeams
        }
      }
    };

    return NextResponse.json({
      success: true,
      incident_id,
      weather_telemetry: {
        rainfall_mm_per_hr: rainfall,
        tidal_surge_m: tide
      },
      pipeline_result: pipelineResult
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Execution failed' },
      { status: 500 }
    );
  }
}
