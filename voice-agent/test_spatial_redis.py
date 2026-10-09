"""
ZeroGrid Spatial-Temporal Memory & Redis Atomic Concurrency Verification Script
Tests:
1. Redis atomic team locks (SET NX EX, collision prevention, lock release).
2. MongoDB spatial-temporal operational memory (proximity querying, transit savings calculation).
3. DynamoDB dynamic node incident metric tracking.
4. End-to-end Agent Zero synthesis with spatial context injection.
"""

import asyncio
import json
import logging
from redis_manager import redis_manager
from spatial_memory import spatial_memory
from grid_graph import record_node_incident_metric
from main import autonomous_orchestrate, AutonomousOrchestrateRequest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_spatial_redis")


async def run_verification():
    print("=" * 70)
    print(" ZeroGrid Phase 1 Verification: Spatial-Temporal Memory & Redis Locks")
    print("=" * 70)

    # -------------------------------------------------------------
    # TEST 1: Redis Atomic Lock Manager & Concurrency State
    # -------------------------------------------------------------
    print("\n[STEP 1] Testing Atomic Team Lock Engine (SET NX EX)...")
    test_team = "TEAM_NDRF_ALPHA"
    test_inc_1 = "INC_TEST_CRISIS_01"
    test_inc_2 = "INC_TEST_CRISIS_02"

    # Ensure clean starting state
    redis_manager.release_team_lock(test_team)

    # 1. Acquire initial lock
    lock_1 = redis_manager.acquire_team_lock(test_team, test_inc_1, ttl_seconds=60)
    print(f" -> Initial Lock Attempt on {test_team}: {lock_1['success']} (State: {lock_1.get('state')})")
    assert lock_1["success"] is True, "Expected initial lock acquisition to succeed."

    # 2. Attempt duplicate lock (must be blocked by NX)
    lock_2 = redis_manager.acquire_team_lock(test_team, test_inc_2, ttl_seconds=60)
    print(f" -> Collision Attempt on {test_team}: {lock_2['success']} (Error: {lock_2.get('error')})")
    assert lock_2["success"] is False, "Expected double-booking prevention to reject second lock."

    # 3. Check status
    status = redis_manager.get_team_status(test_team)
    print(f" -> Current Unit State: {status['state']} (Assigned Incident: {status['active_incident_id']})")
    assert status["state"] == "ASSIGNED"

    # 4. Release lock
    release = redis_manager.release_team_lock(test_team)
    print(f" -> Release Lock on {test_team}: {release['success']} (State: {release.get('state')})")
    assert release["state"] == "IDLE"

    all_statuses = redis_manager.get_all_team_statuses()
    print(f" -> Total Emergency Squads Tracked: {len(all_statuses)} (Active Plane: {'SIMULATION' if redis_manager.is_simulation else 'ELASTICACHE'})")
    print(" [PASS] Atomic distributed lock semantics verified.")

    # -------------------------------------------------------------
    # TEST 2: MongoDB Spatial-Temporal Operational Memory
    # -------------------------------------------------------------
    print("\n[STEP 2] Testing Spatial-Temporal Memory & Proximity Engine...")
    target_coords = [72.8125, 19.4565] # Virar East Substation
    spatial_intel = spatial_memory.synthesize_proximity_recommendations(target_coords, redis_manager)

    print(f" -> Nearby Historical Incidents Found: {len(spatial_intel['recent_spatial_incidents'])}")
    print(f" -> Candidate Squads Evaluated     : {len(spatial_intel['candidate_teams'])}")
    print(f" -> Tactical Proximity Advisory    : {spatial_intel['tactical_proximity_advisory']}")

    assert len(spatial_intel["candidate_teams"]) > 0, "Expected at least 1 candidate team from spatial memory."
    top_candidate = spatial_intel["candidate_teams"][0]
    print(f" -> Top Squad Proximity: {top_candidate['team_name']} ({top_candidate['distance_km']}km away, saving {top_candidate['transit_savings_mins']} mins transit)")
    print(" [PASS] Spatial-temporal operational memory successfully queried.")

    # -------------------------------------------------------------
    # TEST 3: Dynamic Grid Node Failure Metric Increment
    # -------------------------------------------------------------
    print("\n[STEP 3] Testing Dynamic Grid Node Failure Tracking...")
    node_res = record_node_incident_metric("SUB_VIRAR_EAST_01")
    print(f" -> Node ID                  : {node_res['node_id']}")
    print(f" -> Historical Incident Count: {node_res.get('historical_incident_count')}")
    print(f" -> Source Plane             : {node_res.get('source')}")
    assert node_res["success"] is True, "Expected node incident metric recording to succeed."
    print(" [PASS] Dynamic topological node metrics updated.")

    # -------------------------------------------------------------
    # TEST 4: End-to-End Autonomous Orchestration
    # -------------------------------------------------------------
    print("\n[STEP 4] Testing Full Agent Zero Orchestration with Spatial-Redis Context...")
    req = AutonomousOrchestrateRequest(
        incident_id="VERIFY_PHASE_1_001",
        incident_type="SUBSTATION_WATER_INGRESS",
        severity="CRITICAL",
        coordinates=[72.8125, 19.4565],
        water_depth_cm=48.0,
        affected_node_id="SUB_VIRAR_EAST_01",
        message="33kV switchyard submerged. Severe flood threat to downstream Sanjeevani Hospital."
    )

    result = await autonomous_orchestrate(req)

    print("\n[SYNTHESIS COMPLETE]")
    directive = result["agent_zero_directive"]
    print(f" -> Overall Threat Score: {directive['overall_threat_score']}/100")
    print(f" -> Executive Summary   : {str(directive.get('executive_summary', '')).encode('ascii', 'ignore').decode()}")
    print(f" -> Hospital Lifeline   : {str(directive.get('hospital_lifeline_protocol', '')).encode('ascii', 'ignore').decode()}")
    print(f" -> Immediate Breakers  : {result['sub_agents']['grid'].get('immediate_breakers_to_trip', [])}")
    squads = result['sub_agents']['dispatch'].get('recommended_squads', [])
    print(f" -> Mobilized Squads    : {[s.get('unit_type', 'UNIT') for s in squads]}")
    print(f" -> Spatial Advisory    : {str(result['sub_agents']['dispatch'].get('spatial_proximity_advisory')).encode('ascii', 'ignore').decode()}")

    assert "executive_summary" in directive
    assert result["sub_agents"]["triage"]["threat_level"] in ["HIGH", "CRITICAL"]

    print("\n" + "=" * 70)
    print(" [ALL TESTS PASSED] Phase 1 Core Architecture Verified Successfully!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_verification())
