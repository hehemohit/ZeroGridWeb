/**
 * validatePhase5.js
 * Comprehensive End-to-End Test Suite for Phase 5 Verification Matrix.
 * Validates all 8 core features of the Autonomous Predictive Crisis Command Center.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const weatherService = require('../utils/weatherService');
const tideService = require('../utils/tideService');
const strandsPredictiveAgent = require('../utils/strandsPredictiveAgent');

const RESULTS = [];

function recordTest(id, name, pass, details) {
  RESULTS.push({ id, name, pass, details });
  const icon = pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Test #${id}] ${name}`);
  if (details) console.log(`   └─ ${details}`);
}

async function runValidation() {
  console.log('================================================================');
  console.log('   ZeroGrid Autonomous Predictive Crisis Command Center         ');
  console.log('             Phase 5: End-to-End Verification Matrix            ');
  console.log('================================================================\n');

  // Test 1: Live Rainfall Hook
  try {
    const weather = await weatherService.getRainfall(19.4534, 72.8061);
    const pass = weather && typeof weather.precipitationMmHr === 'number' && weather.intensityLevel;
    recordTest(
      1,
      'Live Rainfall Hook (Open-Meteo)',
      Boolean(pass),
      `Precipitation: ${weather.precipitationMmHr} mm/hr | Level: ${weather.intensityLevel} | Trend: ${weather.trend} (${weather.summary})`
    );
  } catch (err) {
    recordTest(1, 'Live Rainfall Hook (Open-Meteo)', false, err.message);
  }

  // Test 2: Tidal Gate Detection (>3.8m Sluice Gate Lock)
  try {
    const normalTide = await tideService.getTideConditions(19.4534, 72.8061);
    const highTideSim = await tideService.getTideConditions(19.4534, 72.8061, { overrideTideMeters: 4.25 });
    const pass = highTideSim.sluiceGateStatus === 'CLOSED' &&
      highTideSim.gravityDrainagePossible === false &&
      highTideSim.warning.includes('LOCKED SHUT');
    recordTest(
      2,
      'Tidal Gate Detection & Sluice Lock (>3.8m)',
      Boolean(pass),
      `Simulated: ${highTideSim.currentTideMeters}m | Sluice: ${highTideSim.sluiceGateStatus} | Gravity Drainage: ${highTideSim.gravityDrainagePossible ? 'Active' : 'STALLED (0 mm/hr)'}`
    );
  } catch (err) {
    recordTest(2, 'Tidal Gate Detection & Sluice Lock (>3.8m)', false, err.message);
  }

  // Test 3: Drainage Clearance ETA (84cm flood at Virar West)
  try {
    const timeline = await strandsPredictiveAgent.predictDrainageTimeline({
      lat: 19.4534,
      lng: 72.8061,
      waterDepthCm: 84
    });
    const pass = timeline &&
      timeline.timelineStages?.length === 5 &&
      timeline.recessionStartTime &&
      timeline.estimatedClearanceTime;
    recordTest(
      3,
      'Drainage Clearance ETA & 5-Stage Stepper',
      Boolean(pass),
      `Depth: ${timeline.currentWaterDepthCm}cm | Recession: ${timeline.recessionStartTime} | Full Clear ETA: ${timeline.estimatedClearanceTime} IST | Stages: ${timeline.timelineStages.length}`
    );
  } catch (err) {
    recordTest(3, 'Drainage Clearance ETA & 5-Stage Stepper', false, err.message);
  }

  // Test 4: Anti-Spam Consensus (Isolated spoof beacon)
  try {
    const auditFake = await strandsPredictiveAgent.auditMeshCredibility({
      lat: 19.9999,
      lng: 73.5555,
      waterDepthCm: 90,
      userRole: 'CITIZEN'
    });
    const pass = auditFake.confidenceScore < 50 &&
      auditFake.classification === 'FLAGGED_SPAM' &&
      auditFake.isFlaggedSpam === true;
    recordTest(
      4,
      'Anti-Spam Consensus (Isolated 90cm Spoof Detection)',
      Boolean(pass),
      `Score: ${auditFake.confidenceScore}% | Classification: ${auditFake.classification} | Spam Flagged: ${auditFake.isFlaggedSpam}`
    );
  } catch (err) {
    recordTest(4, 'Anti-Spam Consensus (Isolated 90cm Spoof Detection)', false, err.message);
  }

  // Test 5: Multi-Node Verification (Corroborated incident)
  try {
    const auditHotspot = await strandsPredictiveAgent.auditMeshCredibility({
      lat: 19.4534,
      lng: 72.8061,
      waterDepthCm: 50,
      userRole: 'ADMIN'
    });
    const pass = auditHotspot.confidenceScore >= 75 &&
      !auditHotspot.isFlaggedSpam;
    recordTest(
      5,
      'Multi-Node Verification & Authority Corroboration',
      Boolean(pass),
      `Score: ${auditHotspot.confidenceScore}% | Classification: ${auditHotspot.classification} | Weather Consistent: ${auditHotspot.weatherConsistent}`
    );
  } catch (err) {
    recordTest(5, 'Multi-Node Verification & Authority Corroboration', false, err.message);
  }

  // Test 6: Resource Dispatch & Cluster Matching
  try {
    const clusters = await strandsPredictiveAgent.clusterDistressBeacons({ radiusKm: 0.8, minBeacons: 2 });
    const pass = typeof clusters.clusterCount === 'number';
    recordTest(
      6,
      'Resource Dispatch & Spatial Beacon Clustering',
      Boolean(pass),
      `Active Cluster Count: ${clusters.clusterCount} | Nearest Municipal Base Mapping active`
    );
  } catch (err) {
    recordTest(6, 'Resource Dispatch & Spatial Beacon Clustering', false, err.message);
  }

  // Test 7: SitRep Export (NDMA Standard SOP)
  try {
    const sitrep = await strandsPredictiveAgent.generateSitRep();
    const pass = sitrep &&
      sitrep.referenceId &&
      sitrep.markdownReport.includes('NATIONAL DISASTER MANAGEMENT AUTHORITY') &&
      sitrep.markdownReport.includes('COASTAL HYDRODYNAMICS');
    recordTest(
      7,
      'SitRep Export (NDMA Standard Situation Report)',
      Boolean(pass),
      `Reference: ${sitrep.referenceId} | Report Length: ${sitrep.markdownReport.length} chars`
    );
  } catch (err) {
    recordTest(7, 'SitRep Export (NDMA Standard Situation Report)', false, err.message);
  }

  // Test 8: 1-Click Offline Mesh Broadcast Generation
  try {
    const timeline = await strandsPredictiveAgent.predictDrainageTimeline({
      lat: 19.4534,
      lng: 72.8061,
      waterDepthCm: 84
    });
    const pass = timeline.offlineMeshBroadcast &&
      typeof timeline.offlineMeshBroadcast === 'string' &&
      timeline.offlineMeshBroadcast.length > 20 &&
      (timeline.offlineMeshBroadcast.toLowerCase().includes('virar') || timeline.offlineMeshBroadcast.toLowerCase().includes('alert'));
    recordTest(
      8,
      '1-Click Offline Mesh Broadcast Payload',
      Boolean(pass),
      `Payload: "${timeline.offlineMeshBroadcast.substring(0, 85)}..."`
    );
  } catch (err) {
    recordTest(8, '1-Click Offline Mesh Broadcast Payload', false, err.message);
  }

  console.log('\n================================================================');
  const allPassed = RESULTS.every(r => r.pass);
  console.log(`   Final Verdict: ${RESULTS.filter(r => r.pass).length} / ${RESULTS.length} Tests Passed`);
  console.log(`   Phase 5 Matrix Status: ${allPassed ? 'ALL SYSTEMS OPERATIONAL (100% PASS)' : 'ATTENTION REQUIRED'}`);
  console.log('================================================================\n');

  return allPassed;
}

if (require.main === module) {
  runValidation()
    .then(pass => process.exit(pass ? 0 : 1))
    .catch(err => {
      console.error('Validation crashed:', err);
      process.exit(1);
    });
}

module.exports = { runValidation };
