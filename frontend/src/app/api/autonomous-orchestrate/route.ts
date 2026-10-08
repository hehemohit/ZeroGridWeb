import { NextRequest, NextResponse } from 'next/server';

const AWS_VOICE_AGENT_ENDPOINT =
  process.env.NEXT_PUBLIC_VOICE_AGENT_URL ||
  'https://j6uweuhbak.execute-api.ap-south-1.amazonaws.com/default/voice-agent-microservice';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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

    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Lambda orchestration error:', response.status, errText);
      return NextResponse.json(
        { error: `Agent Zero Microservice error: ${response.statusText}`, details: errText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Failed to proxy to Agent Zero Microservice:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to communicate with Agent Zero microservice' },
      { status: 500 }
    );
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
