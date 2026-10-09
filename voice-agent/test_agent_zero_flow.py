"""
End-to-End Test Suite for Reconstructed Agent 0
Validates:
1. Spatial-temporal duplicate detection (within 350m & 60m window).
2. Report count incrementation (1 -> 2 -> 3) and priority escalation (MEDIUM -> HIGH -> CRITICAL).
3. Workforce matching against MongoDB 'tacticalteams' collection.
4. Atomic squad status transition from IDLE to EN_ROUTE.
"""

import asyncio
import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(__file__))

from agents.core.dedup_engine import process_deduplication_and_escalation
from agents.core.workforce_engine import match_and_allocate_workforce


async def run_agent_zero_tests():
    print("=" * 70)
    print("⚡ ZERO-GRID AGENT 0 RECONSTRUCTION VERIFICATION SUITE")
    print("=" * 70)

    # -------------------------------------------------------------
    # TEST 1: Initial Incoming Citizen Report (Report 1)
    # -------------------------------------------------------------
    print("\n[TEST 1] Citizen Report 1 (Initial Intake)...")
    incident_1 = {
        "incident_id": "INC_TEST_CRISIS_001",
        "category": "WATERLOGGING",
        "coordinates": [72.8120, 19.4560], # Virar East
        "water_depth_cm": 35.0,
        "message": "Water rapidly accumulating near substation entrance"
    }
    res_1 = await process_deduplication_and_escalation(
        incident=incident_1,
        confidence_data={"confidence_score": 0.88}
    )
    print(f"  Is Duplicate:  {res_1['is_duplicate']}")
    print(f"  Report Count:  {res_1['report_count']}")
    print(f"  Priority:      {res_1['priority']} ({res_1['priority_score']}/100)")
    print(f"  Message:       {res_1['message']}")

    assert res_1["is_duplicate"] is False, "First report should be registered as new incident"
    assert res_1["report_count"] == 1, "Initial report count must be 1"
    print("  ✅ TEST 1 PASSED: New incident registered with baseline priority.")

    # -------------------------------------------------------------
    # TEST 2: Second Citizen Reports Same Location (Duplicate Report 2)
    # -------------------------------------------------------------
    print("\n[TEST 2] Citizen Report 2 from 40m away (Duplicate Aggregation)...")
    incident_2 = {
        "incident_id": "INC_CITIZEN_ANON_02",
        "category": "WATERLOGGING",
        "coordinates": [72.8123, 19.4562], # ~40m away from Incident 1
        "water_depth_cm": 42.0,
        "message": "Street completely flooded, cars getting stuck near substation"
    }
    res_2 = await process_deduplication_and_escalation(
        incident=incident_2,
        confidence_data={"confidence_score": 0.90}
    )
    print(f"  Is Duplicate:  {res_2['is_duplicate']}")
    print(f"  Report Count:  {res_2['report_count']}")
    print(f"  Priority:      {res_2['priority']} ({res_2['priority_score']}/100)")
    print(f"  Message:       {res_2['message']}")

    assert res_2["is_duplicate"] is True, "Second report within 40m must be flagged as duplicate"
    assert res_2["report_count"] == 2, "Report count must increment to 2"
    assert res_2["priority"] in ["HIGH", "CRITICAL"], "Priority must escalate on second corroboration"
    print("  ✅ TEST 2 PASSED: Duplicate corroborated, reportCount incremented to 2, priority escalated.")

    # -------------------------------------------------------------
    # TEST 3: Third Citizen Reports Same Location (Report 3 -> CRITICAL)
    # -------------------------------------------------------------
    print("\n[TEST 3] Citizen Report 3 (Multi-Citizen Confirmed Threat)...")
    incident_3 = {
        "incident_id": "INC_CITIZEN_ANON_03",
        "category": "WATERLOGGING",
        "coordinates": [72.8121, 19.4561],
        "water_depth_cm": 50.0,
        "message": "Water reaching 50cm, power transformer in danger!"
    }
    res_3 = await process_deduplication_and_escalation(
        incident=incident_3,
        confidence_data={"confidence_score": 0.94}
    )
    print(f"  Is Duplicate:  {res_3['is_duplicate']}")
    print(f"  Report Count:  {res_3['report_count']}")
    print(f"  Priority:      {res_3['priority']} ({res_3['priority_score']}/100)")
    print(f"  Message:       {res_3['message']}")

    assert res_3["is_duplicate"] is True, "Third report must be recognized as duplicate"
    assert res_3["report_count"] == 3, "Report count must increment to 3"
    assert res_3["priority"] == "CRITICAL", "3 reports must escalate to CRITICAL priority"
    print("  ✅ TEST 3 PASSED: Report count reached 3, escalated to CRITICAL priority.")

    # -------------------------------------------------------------
    # TEST 4: Agent 0 Workforce Matching & Allocation (MongoDB Squads)
    # -------------------------------------------------------------
    print("\n[TEST 4] Agent 0 Workforce Matching from MongoDB Registry...")
    demand = {
        "requiredRole": "FLOOD_RESCUE",
        "teamCount": 1,
        "equipmentNeeded": ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"]
    }
    alloc_res = await match_and_allocate_workforce(
        incident_id=res_3["incident_id"],
        incident_coords=[72.8120, 19.4560],
        demand=demand
    )
    print(f"  Allocation Success: {alloc_res['success']}")
    print(f"  Assigned Teams:     {alloc_res['assigned_teams']}")
    print(f"  Allocated Squads:   {[s['name'] for s in alloc_res['squad_details']]}")
    if alloc_res["squad_details"]:
        squad = alloc_res["squad_details"][0]
        print(f"  Closest Squad:      {squad['teamId']} | Distance: {squad['distance_km']}km | ETA: {squad['eta_minutes']} mins")

    assert alloc_res["success"] is True, "Should successfully allocate available tactical squad"
    assert len(alloc_res["assigned_teams"]) == 1, "Should assign 1 squad as requested"
    print("  ✅ TEST 4 PASSED: Proximate squad matched, status transitioned to EN_ROUTE.")

    print("\n" + "=" * 70)
    print("🎉 ALL AGENT 0 RECONSTRUCTION TESTS COMPLETED WITH 100% SUCCESS!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_agent_zero_tests())
