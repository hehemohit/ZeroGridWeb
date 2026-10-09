"""
ZeroGrid Autonomous Multi-Agent Fault-Tolerant Pipeline
Coordinates Confidence Scoring -> Sub-Agent Collaboration -> Recursive Resource Negotiation -> Master Directive.
Implements robust state preservation at every step so execution can inspect, retry, or resume upon failure.
"""

import time
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable

from .confidence_agent import confidence_calculator_agent
from .triage_agent import run_triage_agent
from .grid_agent import run_grid_agent
from .dispatch_agent import run_dispatch_agent
from .agent_zero import (
    run_master_synthesis,
    negotiate_resources_loop,
    process_deduplication_and_escalation,
    match_and_allocate_workforce
)

logger = logging.getLogger("zerogrid.agents.pipeline")


async def run_autonomous_negotiation_pipeline(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any],
    spatial_context: Optional[Dict[str, Any]] = None,
    weather_context: Optional[Dict[str, Any]] = None,
    redis_manager_instance: Any = None,
    simulated_available_teams: Optional[List[str]] = None,
    inject_fault_at_step: Optional[str] = None,
    step_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """
    Executes the complete autonomous multi-agent pipeline with state checkpointing and fault tolerance.

    Steps:
    1. CONFIDENCE_CALCULATION: Verifies alert validity, historical flood correlation & noise filtering.
    2. SUB_AGENT_COLLABORATION: Triage, Grid, and Dispatch run concurrently.
    3. REQUIREMENTS_GENERATION: Quantifies squad and equipment requirements.
    4. RESOURCE_NEGOTIATION: Agent Zero checks Redis pool; triggers feedback loop if resources scarce.
    5. MASTER_SYNTHESIS: Agent Zero executive operational directive.
    6. ATOMIC_LOCK_AND_DISPATCH: Distributed locks (SET NX EX) secured in Redis.
    """
    incident_id = incident.get("incident_id", "INC_01")
    node_id = graph_context.get("root_node_id", "SUB_VIRAR_EAST_01")
    coords = incident.get("coordinates") or [19.4534, 72.8061]

    state_checkpoint = {
        "step": "INIT",
        "last_valid_data": {},
        "execution_timeline": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    def record_step(step_name: str, status: str, details: Dict[str, Any]):
        entry = {
            "step": step_name,
            "status": status,
            "timestamp": time.time(),
            "time_iso": datetime.now(timezone.utc).isoformat(),
            "summary": details.get("summary", "")
        }
        state_checkpoint["step"] = step_name
        state_checkpoint["execution_timeline"].append(entry)
        if step_callback:
            try:
                step_callback(step_name, {"status": status, "entry": entry, "data": details})
            except Exception as cb_err:
                logger.warning(f"Step callback error: {cb_err}")

    try:
        # Check for initial fault injection
        if inject_fault_at_step == "INIT":
            raise RuntimeError("Synthetic error injected at pipeline INIT step.")

        # =========================================================================
        # STEP 1: Confidence Calculator Agent
        # =========================================================================
        record_step("CONFIDENCE_CALCULATION", "RUNNING", {"summary": "Evaluating incoming alert credibility."})
        if inject_fault_at_step == "CONFIDENCE_CALCULATION":
            raise RuntimeError("Synthetic error injected during CONFIDENCE_CALCULATION.")

        confidence_res = await confidence_calculator_agent(
            incident=incident,
            coordinates=coords,
            weather_context=weather_context
        )
        state_checkpoint["last_valid_data"]["confidence"] = confidence_res

        if not confidence_res.get("is_valid_alert") or confidence_res.get("confidence_score", 0) < 0.65:
            score_pct = int(confidence_res.get("raw_score", confidence_res.get("confidence_score", 0) * 100))
            record_step("CONFIDENCE_CALCULATION", "FILTERED_FALSE_ALERT", {
                "summary": f"Alert flagged as low-confidence/spam ({score_pct}% < 65% threshold). Awaiting HITL approval."
            })
            return {
                "incident_id": incident_id,
                "status": "LOW_CONFIDENCE_FLAGGED_HITL",
                "message": f"Alert failed confidence threshold ({score_pct}% < 65%). Dispatched to Admin Console awaiting human-in-the-loop review.",
                "confidence_data": confidence_res,
                "pipeline_checkpoint": state_checkpoint
            }

        score_pct = int(confidence_res.get("raw_score", confidence_res.get("confidence_score", 0) * 100))
        record_step("CONFIDENCE_CALCULATION", "COMPLETED", {
            "summary": f"Alert verified ({score_pct}% >= 65%). Base 50 + Modifiers. Forwarded to Agent Zero."
        })

        # =========================================================================
        # STEP 1.5: Agent 0 Spatial Deduplication & Priority Escalation
        # =========================================================================
        record_step("DEDUPLICATION_AND_PRIORITY", "RUNNING", {"summary": "Querying MongoDB active incidents for spatial-temporal duplicates."})
        dedup_res = await process_deduplication_and_escalation(incident, confidence_res)
        state_checkpoint["last_valid_data"]["deduplication"] = dedup_res

        # Merge updated priority and reportCount into incident payload
        incident["reportCount"] = dedup_res.get("report_count", 1)
        incident["priority"] = dedup_res.get("priority", "MEDIUM")
        incident["domain"] = dedup_res.get("domain", "FLOOD")

        record_step("DEDUPLICATION_AND_PRIORITY", "COMPLETED", {
            "summary": (
                f"{'Corroborated duplicate incident' if dedup_res.get('is_duplicate') else 'New incident registered'}: "
                f"Report Count={dedup_res.get('report_count')} | Priority={dedup_res.get('priority')} ({dedup_res.get('priority_score')}/100)."
            )
        })

        # =========================================================================
        # STEP 2: Sub-Agent Concurrent Collaboration (Triage + Grid + Dispatch)
        # =========================================================================
        record_step("SUB_AGENT_COLLABORATION", "RUNNING", {"summary": "Executing Triage, Grid, and Dispatch sub-agents concurrently."})
        if inject_fault_at_step == "SUB_AGENT_COLLABORATION":
            raise RuntimeError("Synthetic error injected during SUB_AGENT_COLLABORATION.")

        triage_res, grid_res, dispatch_res = await asyncio.gather(
            run_triage_agent(incident, graph_context, weather_context),
            run_grid_agent(incident, graph_context),
            run_dispatch_agent(incident, graph_context, spatial_context)
        )
        state_checkpoint["last_valid_data"]["sub_agents"] = {
            "triage": triage_res,
            "grid": grid_res,
            "dispatch": dispatch_res
        }
        record_step("SUB_AGENT_COLLABORATION", "COMPLETED", {
            "summary": f"Sub-agents synthesized threat level={triage_res.get('threat_level')} & cascade risk={grid_res.get('cascade_risk')}."
        })

        # =========================================================================
        # STEP 3: Requirements Formulation
        # =========================================================================
        record_step("REQUIREMENTS_GENERATION", "RUNNING", {"summary": "Formulating tactical personnel and squad requirements."})
        if inject_fault_at_step == "REQUIREMENTS_GENERATION":
            raise RuntimeError("Synthetic error injected during REQUIREMENTS_GENERATION.")

        initial_requirements = {
            "team_type_needed": dispatch_res.get("team_type_needed", "FLOOD_RESCUE"),
            "team_count_needed": dispatch_res.get("team_count_needed", 3),
            "recommended_squads": dispatch_res.get("recommended_squads", []),
            "staging_area": dispatch_res.get("staging_area", "Virar East Elevated Flyover"),
            "special_tactical_precautions": dispatch_res.get("special_tactical_precautions", "Air-gap verification required")
        }
        state_checkpoint["last_valid_data"]["requirements"] = initial_requirements
        record_step("REQUIREMENTS_GENERATION", "COMPLETED", {
            "summary": f"Requirements formulated: {initial_requirements['team_count_needed']} squads of type {initial_requirements['team_type_needed']}."
        })

        # =========================================================================
        # STEP 4: Agent Zero Recursive Resource Negotiation Loop
        # =========================================================================
        record_step("RESOURCE_NEGOTIATION", "RUNNING", {"summary": "Agent Zero evaluating Redis pool against sub-agent requirements."})
        if inject_fault_at_step == "RESOURCE_NEGOTIATION":
            raise RuntimeError("Synthetic error injected during RESOURCE_NEGOTIATION.")

        negotiation_res = negotiate_resources_loop(
            requirements=initial_requirements,
            redis_manager_instance=redis_manager_instance,
            max_retries=2,
            simulated_available_teams=simulated_available_teams
        )
        state_checkpoint["last_valid_data"]["negotiation"] = negotiation_res

        # Query and mobilize workforce teams from MongoDB tacticalteams collection
        try:
            allocated_workforce = await match_and_allocate_workforce(
                incident_id=incident_id,
                incident_coords=coords,
                demand=initial_requirements,
                redis_manager_instance=redis_manager_instance
            )
            if allocated_workforce.get("assigned_teams"):
                negotiation_res["assigned_teams"] = allocated_workforce["assigned_teams"]
                negotiation_res["workforce_allocation"] = allocated_workforce
        except Exception as alloc_err:
            logger.warning(f"MongoDB workforce allocation warning: {alloc_err}")

        if not negotiation_res.get("success"):
            record_step("RESOURCE_NEGOTIATION", "FAILED_DEPLETED", {
                "summary": "Resource negotiation failed: insufficient idle units in pool."
            })
            raise RuntimeError("Resource negotiation failed: All tactical units committed.")

        record_step("RESOURCE_NEGOTIATION", "COMPLETED", {
            "summary": f"Negotiation finalized in {negotiation_res.get('rounds_count', 1)} round(s). Teams secured: {negotiation_res.get('assigned_teams')}."
        })

        # =========================================================================
        # STEP 5: Master Operational Directive Synthesis
        # =========================================================================
        record_step("MASTER_SYNTHESIS", "RUNNING", {"summary": "Agent Zero synthesizing authoritative operational directive."})
        if inject_fault_at_step == "MASTER_SYNTHESIS":
            raise RuntimeError("Synthetic error injected during MASTER_SYNTHESIS.")

        synthesis_res = await run_master_synthesis(
            incident=incident,
            graph_context=graph_context,
            triage_res=triage_res,
            grid_res=grid_res,
            dispatch_res=dispatch_res,
            spatial_context=spatial_context
        )
        state_checkpoint["last_valid_data"]["master_synthesis"] = synthesis_res
        record_step("MASTER_SYNTHESIS", "COMPLETED", {
            "summary": f"Master synthesis complete. Overall threat score: {synthesis_res.get('overall_threat_score')}."
        })

        # =========================================================================
        # STEP 6: Atomic Lock Acquisition & Dispatch Finalization
        # =========================================================================
        record_step("ATOMIC_LOCK_AND_DISPATCH", "RUNNING", {"summary": "Acquiring distributed locks (SET NX EX) in Redis."})
        if inject_fault_at_step == "ATOMIC_LOCK_AND_DISPATCH":
            raise RuntimeError("Synthetic error injected during ATOMIC_LOCK_AND_DISPATCH.")

        assigned_teams = negotiation_res.get("assigned_teams", [])
        locked_teams = []
        lock_details = []

        if redis_manager_instance:
            for team_id in assigned_teams:
                res = redis_manager_instance.acquire_team_lock(team_id, incident_id)
                lock_details.append(res)
                if res.get("success"):
                    locked_teams.append(team_id)
        else:
            locked_teams = assigned_teams
            lock_details = [{"team_id": tid, "success": True, "state": "ASSIGNED"} for tid in assigned_teams]

        state_checkpoint["last_valid_data"]["locked_teams"] = locked_teams
        record_step("ATOMIC_LOCK_AND_DISPATCH", "COMPLETED", {
            "summary": f"Atomically locked {len(locked_teams)} teams in Redis."
        })

        # Final Return
        return {
            "incident_id": incident_id,
            "status": "VERIFIED_AND_ASSIGNED",
            "assigned_teams": locked_teams,
            "lock_details": lock_details,
            "agent_zero_directive": synthesis_res,
            "sub_agents": state_checkpoint["last_valid_data"]["sub_agents"],
            "confidence_data": confidence_res,
            "resource_negotiation": negotiation_res,
            "pipeline_checkpoint": state_checkpoint,
            "completed_at": datetime.now(timezone.utc).isoformat()
        }

    except Exception as e:
        # Fault-Tolerant State Preservation
        logger.error(f"[-] Pipeline caught error at step [{state_checkpoint['step']}]: {e}", exc_info=True)
        record_step(state_checkpoint["step"], "ERROR_PRESERVED", {
            "summary": f"Pipeline failure caught: {str(e)}. Preserving state checkpoint."
        })
        return {
            "incident_id": incident_id,
            "status": "ERROR_PRESERVED_STATE",
            "failed_step": state_checkpoint["step"],
            "error": str(e),
            "preserved_state": state_checkpoint["last_valid_data"],
            "execution_timeline": state_checkpoint["execution_timeline"],
            "can_resume": True,
            "checkpoint_timestamp": datetime.now(timezone.utc).isoformat()
        }
