"""
ZeroGrid Test Suite: Sub-Agent Iterative Workforce Allocation & Fallback Loop
Verifies:
1. Sub-agents demand from teams created for those agents (Flood, Heatwave, Grid, Rescue).
2. Agent 0 checks real-time availability of personnel in MongoDB users collection.
3. Agent 0 decides, locks, and assigns selected personnel to the specific incident ticket.
4. Fallback loop triggers when shortfalls occur, pivoting to the designated fallback team.
5. Mandatory requiredTags are prominently embedded in the dispatch directive.
"""

import sys
import os
import asyncio
import logging

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from agents.domain.flood_agent import run_flood_agent
from agents.domain.heatwave_agent import run_heatwave_agent
from agents.domain.powergrid_agent import run_powergrid_agent
from agents.domain.rescue_agent import run_rescue_agent
from agents.core.workforce_engine import execute_iterative_workforce_allocation

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


async def test_domain_subagents_demand():
    print("\n--- [TEST 1: Domain Sub-Agent Demand from Dedicated Crisis Teams] ---")

    # 1. Flood Agent demanding from FLOOD_MANAGEMENT team
    flood_incident = {
        "incident_id": "TICKET_FLOOD_101",
        "category": "WATERLOGGING",
        "water_depth_cm": 50,
        "priority": "HIGH",
        "coordinates": [72.8140, 19.4580],
        "message": "Underpass submerged with stranded vehicle"
    }
    flood_demand = await run_flood_agent(flood_incident)
    print(f" Flood Agent -> Demanded Department: {flood_demand.get('targetDepartment')} | Tags: {flood_demand.get('requiredTags')}")
    assert flood_demand["targetDepartment"] == "FLOOD_MANAGEMENT"
    assert flood_demand["fallbackDepartment"] == "RESCUE_MANAGEMENT"

    # 2. Heatwave Agent demanding from HEATWAVE_MANAGEMENT team
    heat_incident = {
        "incident_id": "TICKET_HEAT_201",
        "category": "HEATWAVE",
        "temperature_c": 44.5,
        "priority": "HIGH",
        "coordinates": [72.8150, 19.4520],
        "message": "Heat exhaustion in crowded bazaar"
    }
    heat_demand = await run_heatwave_agent(heat_incident)
    print(f" Heatwave Agent -> Demanded Department: {heat_demand.get('targetDepartment')} | Tags: {heat_demand.get('requiredTags')}")
    assert heat_demand["targetDepartment"] == "HEATWAVE_MANAGEMENT"
    assert heat_demand["fallbackDepartment"] == "RESCUE_MANAGEMENT"

    # 3. Power Grid Agent demanding from POWER_GRID_MANAGEMENT team
    grid_incident = {
        "incident_id": "TICKET_GRID_301",
        "category": "FALLEN_GRID",
        "affectedNodeId": "SUB_VIRAR_EAST_01",
        "priority": "CRITICAL",
        "coordinates": [72.8115, 19.4555],
        "message": "Substation 33kV line fault"
    }
    grid_demand = await run_powergrid_agent(grid_incident)
    print(f" Grid Agent -> Demanded Department: {grid_demand.get('targetDepartment')} | Tags: {grid_demand.get('requiredTags')}")
    assert grid_demand["targetDepartment"] == "POWER_GRID_MANAGEMENT"
    assert grid_demand["fallbackDepartment"] == "FLOOD_MANAGEMENT"

    # 4. Rescue Agent demanding from RESCUE_MANAGEMENT team
    rescue_incident = {
        "incident_id": "TICKET_RESCUE_401",
        "category": "TRAPPED",
        "priority": "CRITICAL",
        "coordinates": [72.8020, 19.4420],
        "message": "Structural collapse trapped occupants"
    }
    rescue_demand = await run_rescue_agent(rescue_incident)
    print(f" Rescue Agent -> Demanded Department: {rescue_demand.get('targetDepartment')} | Tags: {rescue_demand.get('requiredTags')}")
    assert rescue_demand["targetDepartment"] == "RESCUE_MANAGEMENT"
    assert rescue_demand["fallbackDepartment"] == "HEATWAVE_MANAGEMENT"

    print("[PASS] TEST 1: All sub-agents correctly demand from their dedicated crisis teams.")


async def test_agent_zero_checks_and_assigns_teams():
    print("\n--- [TEST 2: Agent 0 Checks Availability & Assigns Specific Department Team] ---")
    demand = {
        "targetDepartment": "FLOOD_MANAGEMENT",
        "requiredRole": "DEEP_WATER_RESQ",
        "teamCount": 2,
        "requiredTags": ["WATER_RESCUE", "DEWATERING", "ZODIAC_BOAT"],
        "fallbackDepartment": "RESCUE_MANAGEMENT",
        "fallbackTags": ["SEARCH_RESCUE", "EVACUATION"],
        "operationalBrief": "Underpass rescue for stranded passengers.",
        "tacticalPrecautions": "Ensure zero voltage before entering water."
    }
    incident = {
        "incident_id": "TICKET_FLOOD_101",
        "priority": "HIGH",
        "coordinates": [72.8140, 19.4580]
    }

    result = await execute_iterative_workforce_allocation(incident, demand)
    print(f" Agent 0 Availability Check: Available and assigned {result['allocated_count']}/{result['demanded_count']} personnel.")
    print(f" Assigned Personnel: {result['assigned_teams']}")
    print(f" Lead Commander Assigned: {result['lead_commander']}")
    print(f"\nDispatch Message Generated by Agent 0:\n{result['dispatch_message']}")

    assert result["success"] is True
    assert result["allocated_count"] == 2
    # Verify the assigned units are from FLOOD_MANAGEMENT team, NOT NDRF
    for p in result["personnel_details"]:
        assert p["department"] == "FLOOD_MANAGEMENT"
        assert "NDRF" not in p["name"], "Should NOT be NDRF"
        assert "admin.flood" in p["email"], "Must be an admin from Flood team"

    assert "MANDATORY GEAR & SKILL LOADOUT REQUIRED:" in result["dispatch_message"]
    assert "ZODIAC_BOAT" in result["dispatch_message"] or "WATER_RESCUE" in result["dispatch_message"]
    print("[PASS] TEST 2: Agent 0 verified availability and assigned Flood Management team personnel to ticket.")


async def test_agent_zero_handles_shortfall_and_fallback():
    print("\n--- [TEST 3: Agent 0 Shortfall Check & Fallback Assignment] ---")
    # Sub-agent demands 3 personnel from POWER_GRID_MANAGEMENT team, simulate 1 available (shortfall = 2)
    demand = {
        "targetDepartment": "POWER_GRID_MANAGEMENT",
        "requiredRole": "HV_LINEMAN",
        "teamCount": 3,
        "requiredTags": ["HV_LINEMEN", "SUBSTATION_OPS"],
        "fallbackDepartment": "FLOOD_MANAGEMENT",
        "fallbackTags": ["DEWATERING", "WATER_RESCUE"],
        "operationalBrief": "Substation switchyard flooding with damaged breaker.",
        "tacticalPrecautions": "Air-gap verification mandatory."
    }
    incident = {
        "incident_id": "TICKET_GRID_301",
        "priority": "CRITICAL",
        "coordinates": [72.8115, 19.4555]
    }

    result = await execute_iterative_workforce_allocation(
        incident=incident,
        demand=demand,
        simulated_shortfall=True
    )

    print(f" Agent 0 Iteration Log: {result['iteration_log']}")
    print(f" Fallback Team Mobilized: {result['fallback_department_used']}")
    print(f" Assigned Roster: {result['assigned_teams']}")
    print(f"\nDispatch Message with Fallback Support:\n{result['dispatch_message']}")

    assert result["success"] is True
    assert result["allocated_count"] == 3
    assert result["fallback_department_used"] == "FLOOD_MANAGEMENT"

    # Verify assigned roster contains both Power Grid personnel and Flood Management fallback personnel
    departments_assigned = {p["department"] for p in result["personnel_details"]}
    assert "POWER_GRID_MANAGEMENT" in departments_assigned
    assert "FLOOD_MANAGEMENT" in departments_assigned
    for p in result["personnel_details"]:
        assert "NDRF" not in p["name"] and "Vasai" not in p["name"]

    print("[PASS] TEST 3: Shortfall detected, Agent 0 triggered fallback team, and assigned combined squad.")


async def main():
    print("=================================================================")
    print("[RUN] RUNNING ZERO GRID SUB-AGENT ITERATIVE WORKFORCE TEST SUITE")
    print("=================================================================")
    await test_domain_subagents_demand()
    await test_agent_zero_checks_and_assigns_teams()
    await test_agent_zero_handles_shortfall_and_fallback()
    print("\n=================================================================")
    print("[SUCCESS] ALL SUB-AGENT AND AGENT 0 TEAM ASSIGNMENT TESTS PASSED!")
    print("=================================================================")


if __name__ == "__main__":
    asyncio.run(main())
