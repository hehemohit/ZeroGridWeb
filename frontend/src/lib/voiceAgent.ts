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
