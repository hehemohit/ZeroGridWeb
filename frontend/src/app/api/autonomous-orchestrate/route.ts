import { NextRequest, NextResponse } from 'next/server';
import { createFallbackOrchestration } from '@/lib/voiceAgent';

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload = {
    incident_id: body.incident_id || body.id || 'INC_01',
    incident_type: body.incident_type || 'SUBSTATION_WATER_INGRESS',
    severity: body.severity || 'CRITICAL',
    coordinates: body.coordinates || [19.456, 72.812],
    water_depth_cm: body.water_depth_cm ?? body.waterDepthCm ?? 45.0,
    temperature_c: body.temperature_c ?? 32.0,
    affected_node_id: body.affected_node_id || 'SUB_VIRAR_EAST_01',
    message: body.message || 'Emergency incident reported near power grid asset',
    telemetry: body.telemetry || null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Call Express /api/flow/run
    const response = await fetch(`${BACKEND_BASE_URL}/api/flow/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incident: payload,
        run_full_autonomous: true,
      }),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    if (response.ok) {
      const data = await response.json();
      if (data && (data.circular_phase || data.agent_zero_directive || data.execution_timeline)) {
        // Map flow response into AutonomousOrchestrationResponse structure
        const fallback = createFallbackOrchestration(payload);
        const merged = {
          ...fallback,
          incident_id: data.incident_id || payload.incident_id,
          circular_phase: {
            ...fallback.circular_phase,
            confidence_data: data.confidence || fallback.circular_phase?.confidence_data,
            agent_zero_classification: data.classification || fallback.circular_phase?.agent_zero_classification,
            domain_demand: data.domain_demand || fallback.circular_phase?.domain_demand,
            workforce_allocation: data.workforce_allocation || fallback.circular_phase?.workforce_allocation,
            timeline: data.execution_timeline || fallback.circular_phase?.timeline,
          },
        };
        return NextResponse.json(merged, {
          headers: { 'x-zerogrid-source': 'express-circular-flow' },
        });
      }
    }
  } catch (error: any) {
    console.warn('Flow runner local proxy engaged fallback simulation:', error?.message);
  }

  // Resilient deterministic circular simulation fallback
  const fallback = createFallbackOrchestration(payload);
  return NextResponse.json(fallback, {
    headers: { 'x-zerogrid-source': 'fallback-circular-pipeline' },
  });
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/admin/workforce/stats`, {
      method: 'GET',
    });
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({ status: 'active', data });
    }
    return NextResponse.json({ status: 'active', mode: 'deterministic-pipeline' });
  } catch (error: any) {
    return NextResponse.json({ status: 'active', mode: 'offline-contingency' });
  }
}

