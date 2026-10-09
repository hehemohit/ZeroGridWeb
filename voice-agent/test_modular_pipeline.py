"""
End-to-End Verification Test for ZeroGrid Modular Multi-Agent Pipeline
Tests:
1. Confidence Calculator Agent (Credibility Scoring & Noise Filtering)
2. Sub-Agent Collaboration (Triage + Grid + Dispatch)
3. Recursive Resource Negotiation Loop (Sub-agent plan reformulation under constraints)
4. Fault-Tolerant State Checkpoint Engine (Preserves prior state upon synthetic error injection)
"""

import sys
import os
import asyncio
import json

# Ensure voice-agent root is on path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from agents.confidence_agent import confidence_calculator_agent
from agents.triage_agent import run_triage_agent
from agents.grid_agent import run_grid_agent
from agents.dispatch_agent import run_dispatch_agent
from agents.agent_zero import negotiate_resources_loop
from agents.pipeline import run_autonomous_negotiation_pipeline
from grid_graph import fetch_localized_subgraph


async def run_all_tests():
    print("=" * 70)
    print("⚡ ZERO-GRID MODULAR AGENT PIPELINE VERIFICATION")
    print("=" * 70)

    sample_incident = {
        "incident_id": "TEST_INC_VIRAR_01",
        "incident_type": "SUBSTATION_WATER_INGRESS",
        "severity": "CRITICAL",
        "coordinates": [19.4534, 72.8061],
        "water_depth_cm": 52.0,
        "message": "Heavy monsoon ingress reported at Virar East 33kV switchyard. Water rising rapidly near transformer."
    }

    graph_context = fetch_localized_subgraph("SUB_VIRAR_EAST_01", max_hops=2)

    # -------------------------------------------------------------
    # TEST 1: Confidence Calculator Agent
    # -------------------------------------------------------------
    print("\n[TEST 1] Verifying Confidence Calculator Agent...")
    conf_res = await confidence_calculator_agent(sample_incident, sample_incident["coordinates"])
    print(f"  Confidence Score: {conf_res.get('confidence_score')}")
    print(f"  Is Valid Alert:   {conf_res.get('is_valid_alert')}")
    print(f"  Classification:   {conf_res.get('veracity_classification')}")
    assert "confidence_score" in conf_res, "Confidence score missing"
    assert conf_res["confidence_score"] > 0.0, "Confidence score must be > 0"
    print("  ✅ TEST 1 PASSED: Confidence Calculator evaluated alert successfully.")

    # -------------------------------------------------------------
    # TEST 2: Sub-Agent Collaboration
    # -------------------------------------------------------------
    print("\n[TEST 2] Verifying Sub-Agent Collaboration (Triage, Grid, Dispatch)...")
    triage_res, grid_res, dispatch_res = await asyncio.gather(
        run_triage_agent(sample_incident, graph_context, {"rainfall_mm_per_hr": 48.0, "tidal_surge_m": 2.2}),
        run_grid_agent(sample_incident, graph_context),
        run_dispatch_agent(sample_incident, graph_context)
    )
    print(f"  Triage Hazard:  {triage_res.get('human_safety_hazard', triage_res.get('threat_level'))}")
    print(f"  Grid Cascade:   {grid_res.get('cascade_risk', grid_res.get('grid_stability_status'))}")
    print(f"  Dispatch Teams: {dispatch_res.get('team_count_needed')} squads of type {dispatch_res.get('team_type_needed')}")
    assert triage_res.get("agent") == "TRIAGE_COMMANDER", "Triage agent identity mismatch"
    assert grid_res.get("agent") == "GRID_OPERATIONS", "Grid agent identity mismatch"
    assert dispatch_res.get("agent") == "TACTICAL_DISPATCH", "Dispatch agent identity mismatch"
    print("  ✅ TEST 2 PASSED: All 3 sub-agents executed concurrently with structured outputs.")

    # -------------------------------------------------------------
    # TEST 3: Recursive Resource Negotiation Loop
    # -------------------------------------------------------------
    print("\n[TEST 3] Verifying Recursive Resource Negotiation Feedback Loop...")
    # Scenario: Sub-agent requests 4 units, but only 1 IDLE unit is free!
    constrained_reqs = {
        "team_type_needed": "FLOOD_RESCUE",
        "team_count_needed": 4,
        "recommended_squads": [{"unit_type": "NDRF_FLOOD_RESCUE", "count": 4}]
    }
    simulated_pool = ["TEAM_NDRF_ALPHA"]  # Only 1 available

    neg_res = negotiate_resources_loop(
        requirements=constrained_reqs,
        redis_manager_instance=None,
        max_retries=2,
        simulated_available_teams=simulated_pool
    )
    print(f"  Negotiation Success: {neg_res.get('success')}")
    print(f"  Rounds Count:        {neg_res.get('rounds_count')}")
    print(f"  Assigned Units:      {neg_res.get('assigned_teams')}")
    print(f"  Final Requirements:  {neg_res.get('final_requirements', {}).get('team_count_needed')} units")
    print(f"  Reformulation Note:  {neg_res.get('final_requirements', {}).get('reformulation_notes', '')[:70]}...")

    assert neg_res["success"] is True, "Negotiation should successfully allocate available unit"
    assert len(neg_res["assigned_teams"]) == 1, "Should assign the 1 available unit"
    assert neg_res.get("rounds_count", 0) >= 1, "Should record negotiation rounds"
    print("  ✅ TEST 3 PASSED: Recursive resource constraint loop successfully triggered sub-agent reformulation.")

    # -------------------------------------------------------------
    # TEST 4: Fault-Tolerant State Checkpoint Engine (Error Preservation)
    # -------------------------------------------------------------
    print("\n[TEST 4] Verifying Fault-Tolerant State Checkpoint Engine with Injected Error...")
    error_res = await run_autonomous_negotiation_pipeline(
        incident=sample_incident,
        graph_context=graph_context,
        inject_fault_at_step="RESOURCE_NEGOTIATION"
    )
    print(f"  Status:         {error_res.get('status')}")
    print(f"  Failed Step:    {error_res.get('failed_step')}")
    print(f"  Error Message:  {error_res.get('error')}")
    print(f"  Can Resume:     {error_res.get('can_resume')}")
    print(f"  Preserved Keys: {list(error_res.get('preserved_state', {}).keys())}")

    assert error_res.get("status") == "ERROR_PRESERVED_STATE", "Should catch error and preserve state"
    assert error_res.get("failed_step") == "RESOURCE_NEGOTIATION", "Failed step must match injected step"
    assert "confidence" in error_res.get("preserved_state", {}), "Confidence state must be preserved"
    assert "sub_agents" in error_res.get("preserved_state", {}), "Sub-agents state must be preserved"
    assert "requirements" in error_res.get("preserved_state", {}), "Requirements state must be preserved"
    print("  ✅ TEST 4 PASSED: Mid-pipeline failure intercepted, state safely checkpointed without data loss.")

    # -------------------------------------------------------------
    # TEST 5: Full End-to-End Autonomous Pipeline
    # -------------------------------------------------------------
    print("\n[TEST 5] Verifying Full End-to-End Pipeline (Happy Path)...")
    full_res = await run_autonomous_negotiation_pipeline(
        incident=sample_incident,
        graph_context=graph_context,
        weather_context={"rainfall_mm_per_hr": 45.0, "tidal_surge_m": 2.1}
    )
    print(f"  Status:             {full_res.get('status')}")
    print(f"  Assigned Teams:     {full_res.get('assigned_teams')}")
    print(f"  Directive Summary:  {full_res.get('agent_zero_directive', {}).get('executive_summary', '')[:80]}...")
    print(f"  Hospital Protocol:  {full_res.get('agent_zero_directive', {}).get('hospital_lifeline_protocol')}")

    assert full_res.get("status") == "VERIFIED_AND_ASSIGNED", "Full pipeline should verify and assign"
    assert len(full_res.get("assigned_teams", [])) > 0, "Should have locked teams"
    print("  ✅ TEST 5 PASSED: Full autonomous negotiation pipeline completed successfully!")

    print("\n" + "=" * 70)
    print("🎉 ALL 5 MULTI-AGENT VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_all_tests())
