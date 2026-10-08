"""
ZeroGrid Autonomous Orchestration & Checkpoint 1 Verification Suite
Tests:
1. Grid topology retrieval & nearest node resolution.
2. Concurrent sub-agent execution (Triage, Grid, Dispatch).
3. Agent Zero master tactical synthesis.
4. FastAPI local endpoint integration.
"""

import sys
import os
import json
import asyncio
import time
from dotenv import load_dotenv

load_dotenv()

from grid_graph import resolve_nearest_node, fetch_localized_subgraph
from agents import run_triage_agent, run_grid_agent, run_dispatch_agent, synthesize_agent_zero


async def run_tests():
    print("=" * 60)
    print(" ZeroGrid Checkpoint 1: Autonomous Orchestration Suite")
    print("=" * 60)

    # 1. Test Coordinate Resolution
    print("\n[TEST 1] Testing Coordinate & Node Resolution...")
    test_coords = [19.457, 72.814]  # Between Virar East substation and Ward 4 transformer
    resolved = resolve_nearest_node(coordinates=test_coords)
    print(f" -> Coordinates {test_coords} resolved to Node: {resolved}")
    assert resolved in ["SUB_VIRAR_EAST_01", "XFMR_WARD4_02"]
    print(" [PASS] Nearest node resolution verified.")

    # 2. Test Localized Subgraph Traversal
    print("\n[TEST 2] Testing Adjacency Graph Traversal...")
    subgraph = fetch_localized_subgraph(start_node_id=resolved, max_hops=2)
    print(f" -> Data Source      : {subgraph.get('data_source')}")
    print(f" -> Nodes Gathered   : {subgraph.get('node_count')}")
    print(f" -> Edges Traversed  : {subgraph.get('edge_count')}")
    print(f" -> Facilities Found : {subgraph.get('critical_facilities')}")
    assert subgraph.get("node_count", 0) >= 2
    assert "critical_facilities" in subgraph
    print(" [PASS] Subgraph traversal verified.")

    # 3. Test Multi-Agent Concurrent Synthesis
    print("\n[TEST 3] Testing Concurrent Sub-Agents & Agent Zero Synthesis...")
    mock_incident = {
        "incident_id": "TEST_INC_VIRAR_01",
        "incident_type": "SUBSTATION_WATER_INGRESS",
        "severity": "CRITICAL",
        "coordinates": test_coords,
        "water_depth_cm": 48.5,
        "message": "Water levels at Virar East Substation rising rapidly to 48cm. Feeder 33KV L1 thermal alarm triggered. Hospital Sanjeevani downstream."
    }

    t0 = time.time()
    orchestration = await synthesize_agent_zero(incident=mock_incident, graph_context=subgraph)
    elapsed = time.time() - t0

    print(f" -> Execution Completed in {elapsed:.2f} seconds")
    directive = orchestration.get("agent_zero_directive", {})
    sub_agents = orchestration.get("sub_agents", {})

    def safe_str(val):
        if isinstance(val, str):
            return val.encode("ascii", "replace").decode("ascii")
        return str(val)

    print("\n--- Sub-Agent Results ---")
    print(f" * Triage Threat Level : {sub_agents.get('triage', {}).get('threat_level')}")
    print(f" * Grid Status         : {sub_agents.get('grid', {}).get('grid_stability_status')}")
    print(f" * Breakers to Trip    : {sub_agents.get('grid', {}).get('immediate_breakers_to_trip')}")
    print(f" * Squads Mobilized    : {len(sub_agents.get('dispatch', {}).get('recommended_squads', []))} units")

    print("\n--- Agent Zero Master Directive ---")
    print(f" * Threat Score        : {directive.get('overall_threat_score')}/100")
    print(f" * Executive Summary   : {safe_str(directive.get('executive_summary'))}")
    print(f" * Automated Actions   : {safe_str(directive.get('immediate_automated_actions'))}")
    print(f" * Hospital Lifeline   : {safe_str(directive.get('hospital_lifeline_protocol'))}")

    assert directive.get("executive_summary") is not None
    assert "triage" in sub_agents and "grid" in sub_agents and "dispatch" in sub_agents
    print("\n[PASS] Agent Zero multi-agent synthesis verified successfully!")

    # 4. Test FastAPI ASGI App Endpoints Locally
    print("\n[TEST 4] Testing FastAPI App Endpoints via Async Client...")
    from httpx import AsyncClient, ASGITransport
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Health check
        res_health = await client.get("/api/health")
        assert res_health.status_code == 200
        print(f" -> GET /api/health: {res_health.json()}")

        # Autonomous Orchestrate
        res_orch = await client.post("/api/autonomous-orchestrate", json=mock_incident)
        assert res_orch.status_code == 200
        orch_data = res_orch.json()
        print(f" -> POST /api/autonomous-orchestrate: status {res_orch.status_code}")
        print(f"    Incident ID: {orch_data.get('incident_id')}")
        print(f"    Graph Source: {orch_data.get('graph_telemetry', {}).get('data_source')}")

        # Grid topology endpoint
        res_topo = await client.get(f"/api/grid-topology/{resolved}")
        assert res_topo.status_code == 200
        print(f" -> GET /api/grid-topology/{resolved}: status {res_topo.status_code}, nodes: {res_topo.json().get('node_count')}")

    print("\n" + "=" * 60)
    print(" [ALL TESTS PASSED] Checkpoint 1 Core Architecture Verified!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_tests())
