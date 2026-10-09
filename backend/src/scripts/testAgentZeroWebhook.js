/**
 * Verification Script for Agent Zero Automated Express Webhook Hook
 * Tests:
 * 1. Coordinates to DynamoDB Node Resolver (gridNodeResolver.js)
 * 2. Automated webhook dispatch to AWS Lambda Agent Zero microservice
 * 3. Structured multi-agent response validation
 */

require('dotenv').config();
const { resolveNearestGridNode } = require('../utils/gridNodeResolver');
const { VOICE_AGENT_LAMBDA_URL } = require('../utils/agentZeroWebhook');

async function runWebhookTest() {
  console.log('='.repeat(65));
  console.log(' ZeroGrid Backend Webhook: Agent Zero Automated Hook Verification');
  console.log('='.repeat(65));

  console.log(`\n[STEP 1] Testing Grid Node Coordinate Resolver...`);
  const testCoords = [72.8125, 19.4565]; // [lng, lat] near Virar East
  const resolved = resolveNearestGridNode(testCoords);
  console.log(` -> Input Coordinates: [${testCoords.join(', ')}]`);
  console.log(` -> Resolved Node ID : ${resolved.nodeId} (${resolved.name})`);
  console.log(` -> Critical Facilities: ${resolved.criticalFacilities.join(', ')}`);

  if (resolved.nodeId !== 'SUB_VIRAR_EAST_01') {
    throw new Error(`Expected SUB_VIRAR_EAST_01, got ${resolved.nodeId}`);
  }
  console.log(' [PASS] Grid node resolver correctly mapped coordinates to Virar East Substation.');

  console.log(`\n[STEP 2] Testing Outbound Webhook to AWS Lambda Microservice...`);
  console.log(` -> Target Endpoint: ${VOICE_AGENT_LAMBDA_URL}`);

  const testPayload = {
    action: 'orchestrate',
    incident_id: 'BACKEND_WEBHOOK_VERIFY_01',
    incident_type: 'FALLEN_GRID',
    severity: 'CRITICAL',
    coordinates: [resolved.coordinates[0], resolved.coordinates[1]],
    water_depth_cm: 48,
    affected_node_id: resolved.nodeId,
    message: 'High tension 33kV line dropped into standing water (48cm) near Virar East substation yard.',
    telemetry: {
      batteryPercentage: 74,
      transport: 'ONLINE',
      passability: 'IMPASSABLE'
    }
  };

  const t0 = Date.now();
  const response = await fetch(VOICE_AGENT_LAMBDA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ZeroGrid-Backend-Verification/2.0'
    },
    body: JSON.stringify(testPayload)
  });

  const durationMs = Date.now() - t0;
  console.log(` -> Response Status: ${response.status} in ${durationMs}ms`);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Microservice returned HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const directive = data.agent_zero_directive;
  const subAgents = data.sub_agents;
  const telemetry = data.graph_telemetry;

  console.log(`\n[STEP 3] Validating Multi-Agent Decision Payload...`);
  console.log(` -> Data Source Plane     : ${telemetry?.data_source}`);
  console.log(` -> Root Node             : ${telemetry?.root_node_id}`);
  console.log(` -> Nodes Traversed       : ${telemetry?.node_count}`);
  console.log(` -> Threat Score          : ${directive?.overall_threat_score}/100`);
  console.log(` -> Executive Directive   : ${directive?.executive_summary}`);
  console.log(` -> Immediate Actions     : ${directive?.immediate_automated_actions?.join(', ')}`);
  console.log(` -> Hospital Lifeline     : ${directive?.hospital_lifeline_protocol}`);
  console.log(` -> Triage Threat Level   : ${subAgents?.triage?.threat_level}`);
  console.log(` -> Grid Stability Status : ${subAgents?.grid?.grid_stability_status}`);
  console.log(` -> Mobilized Units       : ${subAgents?.dispatch?.recommended_squads?.length || 0} squads`);

  if (!directive || !subAgents || !telemetry) {
    throw new Error('Missing core multi-agent sections in response');
  }

  console.log('\n' + '='.repeat(65));
  console.log(' [ALL TESTS PASSED] Express Backend Webhook Integration Verified!');
  console.log('='.repeat(65));
}

runWebhookTest().catch((err) => {
  console.error('\n[X] Webhook Test Failed:', err.message);
  process.exit(1);
});
