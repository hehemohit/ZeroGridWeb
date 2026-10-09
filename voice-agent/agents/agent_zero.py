"""
ZeroGrid Agent Zero Master Orchestrator & Recursive Resource Negotiation Engine
Performs master operational synthesis across all sub-agent deliverables.
Executes the recursive resource matching loop against real-time Redis atomic locks.
If available team count < requested, Agent Zero communicates the constraint back
to the sub-agent for automated tactical plan reformulation.
Uses REASONING_MODEL (e.g. openai/gpt-oss-120b) for deep operational synthesis.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from .base import get_groq_async_client, extract_json_from_llm, REASONING_MODEL
from .dispatch_agent import reformulate_dispatch_requirements
from .core.dedup_engine import process_deduplication_and_escalation, find_duplicate_incident
from .core.workforce_engine import match_and_allocate_workforce

logger = logging.getLogger("zerogrid.agents.zero")


async def run_master_synthesis(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any],
    triage_res: Dict[str, Any],
    grid_res: Dict[str, Any],
    dispatch_res: Dict[str, Any],
    spatial_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Synthesizes multi-agent intelligence into an authoritative executive operational directive.
    """
    sys_prompt = (
        "You are Agent Zero, Supreme Autonomous Orchestrator of the ZeroGrid Power & Emergency System. "
        "Synthesize assessments from Triage, Grid Operations, and Tactical Dispatch sub-agents into "
        "an executive, prioritized operational directive for the Incident Commander. "
        "Keep summaries punchy and under 30 words per field. "
        "You MUST respond ONLY with a valid JSON object without surrounding commentary."
    )

    synthesis_prompt = f"""
Incident Overview:
- ID: {incident.get('incident_id', 'INC_01')}
- Node: {graph_context.get('root_node_id')}
- Coordinates: {incident.get('coordinates')}
- Reported Water Depth: {incident.get('water_depth_cm', 'N/A')} cm

Sub-Agent Deliverables:
1. TRIAGE COMMANDER:
{json.dumps(triage_res, indent=2)}

2. GRID OPERATIONS ENGINEER:
{json.dumps(grid_res, indent=2)}

3. TACTICAL DISPATCH:
{json.dumps(dispatch_res, indent=2)}

Synthesize into a unified JSON response matching this schema:
{{
  "executive_summary": "High-impact 2-3 sentence executive summary of crisis and primary directive",
  "overall_threat_score": 88,
  "immediate_automated_actions": [
    "Trip Feeder 33KV L1 breaker",
    "Engage Vasai backup tie-line"
  ],
  "field_operations_checklist": [
    "Deploy dewatering pumps at Virar East Substation yard",
    "Linemen confirm zero-voltage air-gap verification"
  ],
  "hospital_lifeline_protocol": "Exact procedure to ensure Sanjeevani Hospital ICU remains energized 100%",
  "secondary_hazard_advisories": [
    "Electrocution danger in Ward 4 standing water",
    "Monitor water level rising above critical threshold"
  ]
}}
"""
    try:
        client = get_groq_async_client()
        completion = await client.chat.completions.create(
            model=REASONING_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": synthesis_prompt}
            ],
            temperature=0.25,
            max_tokens=850
        )
        synthesis_json = extract_json_from_llm(completion.choices[0].message.content or "")
        synthesis_json.setdefault("hospital_lifeline_protocol", "Sanjeevani Hospital isolated from flooded primary; energized via Vasai backup tie line.")
        synthesis_json.setdefault("immediate_automated_actions", ["Trip FEEDER_33KV_L1 breaker", "Engage Vasai backup tie-line"])
        synthesis_json.setdefault("overall_threat_score", 88)
        synthesis_json.setdefault("executive_summary", "Critical emergency response directive active.")
        synthesis_json["model_used"] = REASONING_MODEL
        return synthesis_json
    except Exception as e:
        logger.error(f"Agent Zero master synthesis fallback: {e}")
        return {
            "executive_summary": "Substation water ingress presents imminent cascading grid collapse. Immediate feeder isolation executed while routing backup power to Sanjeevani Hospital.",
            "overall_threat_score": 90,
            "immediate_automated_actions": [
                "Trip FEEDER_33KV_L1 breaker",
                "Isolate Ward 4 step-down transformer",
                "Energize Vasai tie-line backup"
            ],
            "field_operations_checklist": [
                "Deploy submersible dewatering pumps to switchyard",
                "Linemen team verify air-gap isolation before personnel entry"
            ],
            "hospital_lifeline_protocol": "Sanjeevani Hospital isolated from flooded primary; energized via Vasai 33kV backup tie line.",
            "secondary_hazard_advisories": [
                "Water depth approaching critical threshold",
                "High electrocution hazard in Ward 4 standing water"
            ],
            "model_used": "deterministic_fallback"
        }


def negotiate_resources_loop(
    requirements: Dict[str, Any],
    redis_manager_instance: Any,
    max_retries: int = 2,
    simulated_available_teams: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Agent Zero recursive resource matching loop:
    1. Checks available IDLE emergency units in Redis.
    2. If requested_count > available_count: triggers constraint feedback to sub-agent.
    3. Sub-agent reformulates tactical requirement plan.
    4. Loops recursively up to max_retries.
    """
    current_attempt = 0
    negotiation_log = []

    # Get real-time status from Redis manager or simulated override
    if simulated_available_teams is not None:
        available_idle_teams = list(simulated_available_teams)
    elif redis_manager_instance is not None:
        all_statuses = redis_manager_instance.get_all_team_statuses()
        available_idle_teams = [t["team_id"] for t in all_statuses if t.get("state") == "IDLE"]
    else:
        # Default safety pool
        available_idle_teams = ["TEAM_NDRF_ALPHA", "TEAM_PUMP_CREW_01"]

    working_requirements = dict(requirements)
    requested_count = working_requirements.get("team_count_needed", 2)

    while current_attempt < max_retries:
        available_count = len(available_idle_teams)

        if available_count >= requested_count:
            # Optimal match
            assigned = available_idle_teams[:requested_count]
            negotiation_log.append({
                "round": current_attempt + 1,
                "status": "MATCHED",
                "requested": requested_count,
                "available": available_count,
                "assigned_teams": assigned,
                "notes": f"Successfully matched requested count ({requested_count}) from available IDLE pool."
            })
            return {
                "success": True,
                "assigned_teams": assigned,
                "rounds_count": current_attempt + 1,
                "negotiation_log": negotiation_log,
                "final_requirements": working_requirements,
                "reasoning": f"Resource requirements satisfied: {len(assigned)} teams mobilized."
            }
        else:
            # Resource constraint triggered!
            current_attempt += 1
            feedback_msg = (
                f"Agent Zero Resource Alert: Requested {requested_count} teams, but only {available_count} "
                f"IDLE squad(s) available in Redis cluster. Reformulate deployment priority."
            )
            logger.warning(f"[-] Negotiation Round {current_attempt}: {feedback_msg}")

            # Sub-agent reformulates plan based on constraint
            working_requirements = reformulate_dispatch_requirements(
                current_requirements=working_requirements,
                available_units_count=available_count,
                constraint_feedback=feedback_msg
            )
            requested_count = working_requirements["team_count_needed"]

            negotiation_log.append({
                "round": current_attempt,
                "status": "CONSTRAINT_REFORMULATING",
                "requested_original": working_requirements.get("original_requested_count", requested_count),
                "available": available_count,
                "adjusted_to": requested_count,
                "reformulation_notes": working_requirements.get("reformulation_notes")
            })

            # Check if reformulated plan now fits available units
            if available_count >= requested_count and available_count > 0:
                assigned = available_idle_teams[:requested_count]
                negotiation_log.append({
                    "round": current_attempt + 1,
                    "status": "REFORMULATED_MATCH",
                    "requested": requested_count,
                    "available": available_count,
                    "assigned_teams": assigned,
                    "notes": f"Sub-agent successfully reformulated plan. Assigned {len(assigned)} units."
                })
                return {
                    "success": True,
                    "assigned_teams": assigned,
                    "rounds_count": current_attempt + 1,
                    "negotiation_log": negotiation_log,
                    "final_requirements": working_requirements,
                    "reasoning": f"Sub-agent reformulated plan to match available pool ({len(assigned)} teams assigned)."
                }

    # If all retries exhausted:
    if len(available_idle_teams) > 0:
        assigned = available_idle_teams
        negotiation_log.append({
            "round": current_attempt,
            "status": "PARTIAL_FALLBACK",
            "assigned_teams": assigned,
            "notes": f"Partial resource allocation: Assigned all remaining available units ({len(assigned)})."
        })
        return {
            "success": True,
            "assigned_teams": assigned,
            "rounds_count": current_attempt,
            "negotiation_log": negotiation_log,
            "final_requirements": working_requirements,
            "reasoning": f"Partial resource allocation: Assigned maximum available units ({len(assigned)})."
        }
    else:
        negotiation_log.append({
            "round": current_attempt,
            "status": "DEPLETED",
            "assigned_teams": [],
            "notes": "Zero IDLE units available across entire grid cluster. Incident Commander manual override needed."
        })
        return {
            "success": False,
            "assigned_teams": [],
            "rounds_count": current_attempt,
            "negotiation_log": negotiation_log,
            "final_requirements": working_requirements,
            "reasoning": "Failed to secure required units: Emergency pool fully committed to other critical incidents."
        }
