import { NextRequest, NextResponse } from 'next/server';

const AWS_VOICE_AGENT_ENDPOINT =
  process.env.NEXT_PUBLIC_VOICE_AGENT_URL ||
  'https://j6uweuhbak.execute-api.ap-south-1.amazonaws.com/default/voice-agent-microservice';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Microservice error: ${response.statusText}`, details: errText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Proxy to Voice Agent failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to communicate with Voice Agent microservice' },
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
