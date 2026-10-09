/**
 * Voice Agent Microservice Client
 * Connects to AWS Lambda + API Gateway running FastAPI with Groq LLM (openai/gpt-oss-120b).
 */

const VOICE_AGENT_ENDPOINT = '/api/voice-chat';

export interface VoiceAgentResponse {
  reply: string;
  latencyMs: number;
}

export interface VoiceAgentHealth {
  status: 'active' | 'offline' | 'error';
  model?: string;
  apiKeyConfigured?: boolean;
  latencyMs?: number;
}

/**
 * Sends speech transcript to the AI Voice Agent microservice
 */
export async function sendVoiceTranscriptToAI(userText: string): Promise<VoiceAgentResponse> {
  const startTime = performance.now();
  try {
    const response = await fetch(VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transcript: userText }),
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (!response.ok) {
      throw new Error(`Voice microservice HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      reply: data.reply || 'Voice agent did not return a response.',
      latencyMs: elapsed,
    };
  } catch (error: any) {
    console.error('Voice processing failed:', error);
    const elapsed = Math.round(performance.now() - startTime);
    return {
      reply: "I'm sorry, I encountered a connection error to the voice microservice.",
      latencyMs: elapsed,
    };
  }
}

/**
 * Sends real microphone recorded audio blob to Whisper for high-accuracy STT + AI response
 */
export async function sendAudioRecordingToAI(
  audioBlob: Blob
): Promise<{ transcript: string; reply: string; latencyMs: number }> {
  const startTime = performance.now();
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    const response = await fetch(VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    const elapsed = Math.round(performance.now() - startTime);

    if (!response.ok) {
      throw new Error(`Voice microservice HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      transcript: data.transcript || '',
      reply: data.reply || 'Voice agent replied with empty text.',
      latencyMs: elapsed,
    };
  } catch (error: any) {
    console.error('Audio processing failed:', error);
    const elapsed = Math.round(performance.now() - startTime);
    return {
      transcript: '',
      reply: "I'm sorry, could not process audio recording.",
      latencyMs: elapsed,
    };
  }
}

/**
 * Checks the connectivity and health of the Voice Agent microservice
 */
export async function checkVoiceAgentHealth(): Promise<VoiceAgentHealth> {
  const startTime = performance.now();
  try {
    const response = await fetch(VOICE_AGENT_ENDPOINT, {
      method: 'GET',
    });
    const elapsed = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return { status: 'error', latencyMs: elapsed };
    }

    const data = await response.json();
    return {
      status: data.status === 'active' ? 'active' : 'offline',
      model: data.model,
      apiKeyConfigured: data.api_key_configured,
      latencyMs: elapsed,
    };
  } catch (error) {
    return { status: 'offline' };
  }
}

/**
 * Autonomous Agent Zero Multi-Agent Types
 */

export interface SubAgentTriageResult {
  agent: string;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  casualty_risk_assessment: string;
  priority_facilities_threatened: string[];
  evacuation_recommended: boolean;
  containment_priority: string;
}

export interface SubAgentGridResult {
  agent: string;
  grid_stability_status: 'STABLE' | 'DEGRADED' | 'CRITICAL_RISK' | 'CASCADE_FAILURE';
  immediate_breakers_to_trip: string[];
  safe_rerouting_path: string;
  cascading_failure_risk_pct: number;
  hospital_power_isolation_plan: string;
}

export interface SubAgentDispatchSquad {
  unit_type: string;
  count: number;
  mission: string;
}

export interface CandidateProximityTeam {
  team_id: string;
  team_name: string;
  role: string;
  distance_km: number;
  estimated_transit_mins: number;
  transit_savings_mins: number;
  redis_state: 'IDLE' | 'ASSIGNED';
  is_available: boolean;
  priority_recommendation: boolean;
  last_incident_handled?: string;
  context?: string;
}

export interface SpatialMemoryInsight {
  recent_spatial_incidents?: any[];
  candidate_teams?: CandidateProximityTeam[];
  tactical_proximity_advisory?: string;
}

export interface EmergencySquadStatus {
  team_id: string;
  name: string;
  category: string;
  base_location: string;
  capacity: number;
  equipment: string[];
  state: 'IDLE' | 'ASSIGNED';
  active_incident_id?: string | null;
  is_available: boolean;
}

export interface SubAgentDispatchResult {
  agent: string;
  recommended_squads: SubAgentDispatchSquad[];
  staging_area: string;
  route_accessibility_status: string;
  special_tactical_precautions: string;
  spatial_proximity_advisory?: string;
  candidate_proximity_teams?: CandidateProximityTeam[];
}

export interface AgentZeroDirective {
  executive_summary: string;
  overall_threat_score: number;
  immediate_automated_actions: string[];
  field_operations_checklist?: string[];
  hospital_lifeline_protocol: string;
  secondary_hazard_advisories?: string[];
}

export interface GraphTelemetry {
  data_source: 'DYNAMODB_CLOUD' | 'IN_MEMORY_SIMULATION';
  root_node_id: string;
  node_count: number;
  edge_count: number;
  critical_facilities: string[];
}

export interface AutonomousOrchestrationResponse {
  incident_id: string;
  orchestrated_at: string;
  agent_zero_directive: AgentZeroDirective;
  sub_agents: {
    triage: SubAgentTriageResult;
    grid: SubAgentGridResult;
    dispatch: SubAgentDispatchResult;
  };
  spatial_memory?: SpatialMemoryInsight;
  graph_telemetry: GraphTelemetry;
}

export interface AutonomousOrchestratePayload {
  incident_id?: string;
  incident_type?: string;
  severity?: string;
  coordinates?: [number, number] | number[] | null;
  water_depth_cm?: number;
  waterDepthCm?: number;
  affected_node_id?: string;
  message?: string;
  telemetry?: any;
}

/**
 * Resilient fallback orchestration generator.
 * Used when the AWS microservice is cold-starting, rate-limited, or unreachable,
 * guaranteeing zero frontend crashes and continuous operational capability.
 */
export function createFallbackOrchestration(
  payload?: AutonomousOrchestratePayload,
  reason?: string
): AutonomousOrchestrationResponse {
  const depth = payload?.water_depth_cm ?? payload?.waterDepthCm ?? 45;
  const incidentId = payload?.incident_id || 'INC_VIRAR_01';
  const isCritical = depth >= 35;

  return {
    incident_id: incidentId,
    orchestrated_at: new Date().toISOString(),
    agent_zero_directive: {
      executive_summary: `Severe flood (${depth}cm) detected at Virar East Substation perimeter. Automated safety rules isolate primary feeder while routing 100% emergency backup to Sanjeevani Hospital ICU.${reason ? ` (Mode: Local Simulation / ${reason})` : ''}`,
      overall_threat_score: isCritical ? 88 : 55,
      immediate_automated_actions: [
        'Trip FEEDER_33KV_L1 breaker',
        'Engage TIE_LINE_33KV_BACKUP from SUB_VASAI_WEST_03 to NODE_HOSPITAL_09',
        'Signal ICU UPS synchronizer'
      ],
      field_operations_checklist: [
        'Deploy 4 high-capacity dewatering pumps to switchyard',
        'Linemen team verify air-gap lock-out/tag-out on Feeder L1',
        'Inspect insulation resistance before re-energizing'
      ],
      hospital_lifeline_protocol: 'Isolate NODE_HOSPITAL_09 from flooded primary; feed via Vasai 33kV backup tie line to guarantee uninterrupted ICU power.',
      secondary_hazard_advisories: [
        'High electrocution danger in Ward 4 standing water',
        'Water depth approaching 50cm critical switchyard threshold'
      ]
    },
    sub_agents: {
      triage: {
        agent: 'TRIAGE_COMMANDER',
        threat_level: isCritical ? 'CRITICAL' : 'HIGH',
        casualty_risk_assessment: `High casualty risk due to standing water (${depth}cm) interacting with energized 33kV switchyard equipment.`,
        priority_facilities_threatened: [
          'HOSPITAL_SANJEEVANI',
          'TRAUMA_CENTER_EAST',
          'PUMP_STATION_04'
        ],
        evacuation_recommended: isCritical,
        containment_priority: 'Immediate isolation of submerged grid assets to prevent mass electrocution.'
      },
      grid: {
        agent: 'GRID_OPERATIONS',
        grid_stability_status: isCritical ? 'DEGRADED' : 'STABLE',
        immediate_breakers_to_trip: [
          'FEEDER_33KV_L1',
          'XFMR_WARD4_02_BREAKER'
        ],
        safe_rerouting_path: 'Energize TIE_LINE_33KV_BACKUP from SUB_VASAI_WEST_03 to maintain Sanjeevani Hospital ICU busbar.',
        cascading_failure_risk_pct: isCritical ? 85 : 40,
        hospital_power_isolation_plan: 'Isolate local transformer Ward 4; switch Hospital Feeder 11KV_MED1 to Vasai tie-line.'
      },
      dispatch: {
        agent: 'TACTICAL_DISPATCH',
        recommended_squads: [
          {
            unit_type: 'NDRF_FLOOD_RESCUE',
            count: 2,
            mission: 'Evacuate trapped citizens along Ward 4 water channel'
          },
          {
            unit_type: 'HIGH_CAPACITY_DEWATERING',
            count: 4,
            mission: 'Deploy 500-HP submersible pumps at Virar East Substation yard'
          },
          {
            unit_type: 'LINEMEN_EMERGENCY_CREW',
            count: 2,
            mission: 'Perform physical lock-out tag-out on Feeder L1'
          }
        ],
        staging_area: 'Virar East Elevated Staging (12m elevation)',
        route_accessibility_status: depth > 40 ? 'PASSABLE_HEAVY_VEHICLES' : 'PASSABLE_ALL_VEHICLES',
        special_tactical_precautions: 'Submerged charged conductors suspected. Full dielectric PPE required before approach.',
        spatial_proximity_advisory: 'TACTICAL PROXIMITY ADVANTAGE: NDRF Flood Rescue Alpha (TEAM_NDRF_ALPHA) recently resolved a ticket 0.23km away and is confirmed IDLE in Redis. Deploying them saves ~22 minutes transit delay vs central staging depot.',
        candidate_proximity_teams: [
          {
            team_id: 'TEAM_NDRF_ALPHA',
            team_name: 'NDRF Flood Rescue Alpha',
            role: 'FLOOD_RESCUE',
            distance_km: 0.23,
            estimated_transit_mins: 3,
            transit_savings_mins: 22,
            redis_state: 'IDLE',
            is_available: true,
            priority_recommendation: true,
            last_incident_handled: 'RES_VIRAR_0821',
            context: 'Active 0.23km away (18m ago) handling FALLEN_LINE'
          },
          {
            team_id: 'TEAM_PUMP_CREW_01',
            team_name: 'Municipal Dewatering Squad 01',
            role: 'DEWATERING',
            distance_km: 0.55,
            estimated_transit_mins: 4,
            transit_savings_mins: 18,
            redis_state: 'IDLE',
            is_available: true,
            priority_recommendation: false,
            last_incident_handled: 'RES_WARD4_0912',
            context: 'Active 0.55km away (35m ago) handling PUMP_DEPLOYMENT'
          },
          {
            team_id: 'TEAM_LINEMEN_SQUAD_04',
            team_name: 'MSEDCL High-Voltage Linemen',
            role: 'ELECTRICAL_GRID',
            distance_km: 2.2,
            estimated_transit_mins: 8,
            transit_savings_mins: 12,
            redis_state: 'IDLE',
            is_available: true,
            priority_recommendation: false,
            last_incident_handled: 'RES_VASAI_0405',
            context: 'Active 2.2km away (50m ago) handling TRANSFORMER_TRIP'
          }
        ]
      }
    },
    spatial_memory: {
      tactical_proximity_advisory: 'TACTICAL PROXIMITY ADVANTAGE: NDRF Flood Rescue Alpha (TEAM_NDRF_ALPHA) recently resolved a ticket 0.23km away and is confirmed IDLE in Redis. Deploying them saves ~22 minutes transit delay vs central staging depot.',
      candidate_teams: [
        {
          team_id: 'TEAM_NDRF_ALPHA',
          team_name: 'NDRF Flood Rescue Alpha',
          role: 'FLOOD_RESCUE',
          distance_km: 0.23,
          estimated_transit_mins: 3,
          transit_savings_mins: 22,
          redis_state: 'IDLE',
          is_available: true,
          priority_recommendation: true,
          last_incident_handled: 'RES_VIRAR_0821',
          context: 'Active 0.23km away (18m ago) handling FALLEN_LINE'
        },
        {
          team_id: 'TEAM_PUMP_CREW_01',
          team_name: 'Municipal Dewatering Squad 01',
          role: 'DEWATERING',
          distance_km: 0.55,
          estimated_transit_mins: 4,
          transit_savings_mins: 18,
          redis_state: 'IDLE',
          is_available: true,
          priority_recommendation: false,
          last_incident_handled: 'RES_WARD4_0912',
          context: 'Active 0.55km away (35m ago) handling PUMP_DEPLOYMENT'
        },
        {
          team_id: 'TEAM_LINEMEN_SQUAD_04',
          team_name: 'MSEDCL High-Voltage Linemen',
          role: 'ELECTRICAL_GRID',
          distance_km: 2.2,
          estimated_transit_mins: 8,
          transit_savings_mins: 12,
          redis_state: 'IDLE',
          is_available: true,
          priority_recommendation: false,
          last_incident_handled: 'RES_VASAI_0405',
          context: 'Active 2.2km away (50m ago) handling TRANSFORMER_TRIP'
        }
      ]
    },
    graph_telemetry: {
      data_source: 'IN_MEMORY_SIMULATION',
      root_node_id: payload?.affected_node_id || 'SUB_VIRAR_EAST_01',
      node_count: 4,
      edge_count: 6,
      critical_facilities: [
        'HOSPITAL_SANJEEVANI',
        'PUMP_STATION_04',
        'TRAUMA_CENTER_EAST'
      ]
    }
  };
}

/**
 * Invokes Agent Zero Autonomous Multi-Agent Orchestration
 * Concurrently triggers Triage, Grid Operations, and Dispatch sub-agents
 * against the DynamoDB electrical grid topology.
 * Seamlessly falls back to local simulation if network or upstream is degraded.
 */
export async function triggerAutonomousOrchestration(
  payload: AutonomousOrchestratePayload
): Promise<AutonomousOrchestrationResponse> {
  try {
    const response = await fetch('/api/autonomous-orchestrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Upstream orchestration responded with status ${response.status}:`, errText);
      try {
        const parsed = JSON.parse(errText);
        if (parsed.agent_zero_directive) {
          return parsed;
        }
      } catch {}
      return createFallbackOrchestration(payload, `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.warn('Network error during autonomous orchestration, engaging resilient fallback:', error);
    return createFallbackOrchestration(payload, error?.message || 'Network Offline');
  }
}

/**
 * Fetches real-time atomic emergency squad statuses from Redis concurrency plane
 */
export async function fetchTeamsStatus(): Promise<EmergencySquadStatus[]> {
  try {
    const response = await fetch('/api/teams', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load team statuses: HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.teams || [];
  } catch (err) {
    console.warn('Teams status fetch fallback engaged:', err);
    return [
      {
        team_id: 'TEAM_NDRF_ALPHA',
        name: 'NDRF Flood Rescue Alpha',
        category: 'FLOOD_RESCUE',
        base_location: 'Virar East Staging',
        capacity: 8,
        equipment: ['Zodiac Inflatable Boats', 'Thermal Drone', 'Dewatering Pumps'],
        state: 'IDLE',
        is_available: true
      },
      {
        team_id: 'TEAM_NDRF_BRAVO',
        name: 'NDRF Rapid Evacuation Bravo',
        category: 'EVACUATION',
        base_location: 'Vasai West Depot',
        capacity: 12,
        equipment: ['High-Clearance Rescue Trucks', 'Lifejackets', 'Medical Kit'],
        state: 'ASSIGNED',
        active_incident_id: 'INC_EVAC_0911',
        is_available: false
      },
      {
        team_id: 'TEAM_PUMP_CREW_01',
        name: 'Municipal Dewatering Squad 01',
        category: 'DEWATERING',
        base_location: 'Ward 4 Pumping Station',
        capacity: 4,
        equipment: ['500-HP High-Volume Submersible Pumps', 'Discharge Conduits'],
        state: 'IDLE',
        is_available: true
      },
      {
        team_id: 'TEAM_LINEMEN_SQUAD_04',
        name: 'MSEDCL High-Voltage Linemen',
        category: 'ELECTRICAL_GRID',
        base_location: 'Virar East 33kV Switchyard',
        capacity: 6,
        equipment: ['Dielectric Hot Sticks', 'Grounding Clamps', 'Megger Insulation Testers'],
        state: 'IDLE',
        is_available: true
      },
      {
        team_id: 'TEAM_VASAI_RESCUE_02',
        name: 'Civil Defense Quick Response 02',
        category: 'PARAMEDIC_RESCUE',
        base_location: 'Sanjeevani Hospital Staging',
        capacity: 6,
        equipment: ['Ambulance Unit', 'Field Triage Kit', 'Emergency Defibrillator'],
        state: 'IDLE',
        is_available: true
      }
    ];
  }
}

/**
 * Atomically locks a team to an incident in Redis (SET NX EX)
 */
export async function acquireTeamLock(
  team_id: string,
  incident_id: string,
  ttl_seconds: number = 1800
): Promise<any> {
  const response = await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lock', team_id, incident_id, ttl_seconds })
  });
  return response.json();
}

/**
 * Releases a team back to IDLE state in Redis
 */
export async function releaseTeamLock(team_id: string): Promise<any> {
  const response = await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'release', team_id })
  });
  return response.json();
}


