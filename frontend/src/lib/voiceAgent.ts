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

export interface SubAgentDispatchResult {
  agent: string;
  recommended_squads: SubAgentDispatchSquad[];
  staging_area: string;
  route_accessibility_status: string;
  special_tactical_precautions: string;
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
 * Invokes Agent Zero Autonomous Multi-Agent Orchestration
 * Concurrently triggers Triage, Grid Operations, and Dispatch sub-agents
 * against the DynamoDB electrical grid topology.
 */
export async function triggerAutonomousOrchestration(
  payload: AutonomousOrchestratePayload
): Promise<AutonomousOrchestrationResponse> {
  const response = await fetch('/api/autonomous-orchestrate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Orchestration failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}
