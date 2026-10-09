import { NextRequest, NextResponse } from 'next/server';
import { createFallbackOrchestration } from '@/lib/voiceAgent';

const AWS_VOICE_AGENT_ENDPOINT = process.env.NEXT_PUBLIC_VOICE_AGENT_URL || '';

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Ensure action is set to 'orchestrate' for universal gateway compatibility
  const payload = {
    action: 'orchestrate',
    incident_id: body.incident_id || body.id || 'INC_01',
    incident_type: body.incident_type || 'SUBSTATION_WATER_INGRESS',
    severity: body.severity || 'CRITICAL',
    coordinates: body.coordinates || null,
    water_depth_cm: body.water_depth_cm ?? body.waterDepthCm ?? 45.0,
    affected_node_id: body.affected_node_id || null,
    message: body.message || 'Emergency incident reported near power grid asset',
    telemetry: body.telemetry || null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Lambda upstream status', response.status, errText);
      // Return high-fidelity fallback with 200 so UI never experiences a 500 crash
      const fallback = createFallbackOrchestration(payload, `Upstream HTTP ${response.status}`);
      return NextResponse.json(fallback, {
        headers: { 'x-zerogrid-source': 'fallback-simulation' }
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.warn('Proxy to Agent Zero microservice timed out or failed, using local simulation:', error?.message);
    const fallback = createFallbackOrchestration(payload, error?.message || 'Upstream Timeout');
    return NextResponse.json(fallback, {
      headers: { 'x-zerogrid-source': 'fallback-simulation' }
    });
  }
}

export async function GET() {
  try {
    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'GET',
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { status: 'offline', error: error?.message },
      { status: 500 }
    );
  }
}
