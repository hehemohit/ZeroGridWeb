"""
ZeroGrid Tactical Dispatch Sub-Agent
Mobilizes emergency squads, dewatering pumps, and linemen repair crews.
Synthesizes required squad types and headcounts, and dynamically reformulates requirements
when Agent Zero communicates field resource constraints.
Uses FAST_MODEL for rapid tactical constraint calculation.
"""

import logging
from typing import Dict, Any, List, Optional
from .base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.dispatch")


async def run_dispatch_agent(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any],
    spatial_context: Optional[Dict[str, Any]] = None,
    triage_context: Optional[Dict[str, Any]] = None,
    grid_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Sub-Agent 3: Tactical Emergency Dispatch Officer.
    Calculates precise requirements for personnel, pump equipment, and squad counts.
    """
    sys_prompt = (
        "You are the ZeroGrid Tactical Emergency Dispatch Sub-Agent. "
        "Mobilize rescue squads, heavy dewatering pumps, and linemen repair crews. "
        "Specify safe staging areas outside the submerged electrocution zones. "
        "Calculate team count needed based on water ingress and life hazard. "
        "Keep descriptions concise (under 20 words). "
        "You MUST respond ONLY with a valid JSON object without surrounding commentary."
    )

    proximity_text = ""
    if spatial_context:
        proximity_text = f"\n- Spatial Proximity Memory: {spatial_context.get('tactical_proximity_advisory', 'None')}"

    hazard = triage_context.get("human_safety_hazard", "Critical") if triage_context else "Critical"
    cascade = grid_context.get("cascade_risk", "High") if grid_context else "High"

    user_prompt = f"""
Ground Conditions:
- Location / Coords: {incident.get('coordinates', [19.456, 72.812])}
- Water Depth (cm): {incident.get('water_depth_cm', 40)}
- Human Hazard: {hazard}
- Grid Cascade Risk: {cascade}
- Affected Root Node: {graph_context.get('root_node_id')}{proximity_text}

Return a valid JSON object matching this schema:
{{
  "team_type_needed": "FLOOD_RESCUE|DEWATERING|ELECTRICAL_GRID",
  "team_count_needed": 3,
  "recommended_squads": [
    {{"unit_type": "NDRF_FLOOD_RESCUE", "count": 2, "mission": "Civic evacuation along channel"}},
    {{"unit_type": "HIGH_CAPACITY_DEWATERING", "count": 1, "mission": "Deploy 500-HP pump at switchyard"}}
  ],
  "staging_area": "Virar East Elevated Flyover Overpass (Elevation: +14m)",
  "route_accessibility_status": "PASSABLE_HEAVY_VEHICLES|BOAT_ONLY",
  "special_tactical_precautions": "Verify zero-voltage air-gap before switchyard entry"
}}
"""
    try:
        client = get_groq_async_client()
        completion = await client.chat.completions.create(
            model=FAST_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            max_tokens=650
        )
        parsed = extract_json_from_llm(completion.choices[0].message.content or "")
        parsed["agent"] = "TACTICAL_DISPATCH"
        parsed.setdefault("team_type_needed", "FLOOD_RESCUE" if hazard == "Critical" else "ELECTRICAL_GRID")
        parsed.setdefault("team_count_needed", max(1, int(parsed.get("team_count_needed", 2))))
        parsed["model_used"] = FAST_MODEL
        return parsed
    except Exception as e:
        logger.error(f"Dispatch sub-agent fallback triggered: {e}")
        return {
            "agent": "TACTICAL_DISPATCH",
            "team_type_needed": "FLOOD_RESCUE",
            "team_count_needed": 3,
            "recommended_squads": [
                {"unit_type": "HIGH_CAPACITY_DEWATERING", "count": 2, "mission": "Switchyard dewatering"},
                {"unit_type": "LINEMEN_EMERGENCY_CREW", "count": 1, "mission": "Physical breaker air-gap verification"}
            ],
            "staging_area": "Virar East Elevated Flyover Overpass (Elevation: +14m)",
            "route_accessibility_status": "PASSABLE_HEAVY_VEHICLES",
            "special_tactical_precautions": "Zero boots on ground inside substation until breaker trip verification received.",
            "model_used": "deterministic_fallback"
        }


def reformulate_dispatch_requirements(
    current_requirements: Dict[str, Any],
    available_units_count: int,
    constraint_feedback: str
) -> Dict[str, Any]:
    """
    Sub-agent reformulation hook:
    When Agent Zero identifies a resource deficit, the sub-agent reformulates
    its operational plan based on the real-time constraint (e.g. scaling down to available count,
    concentrating personnel on primary lifeline first).
    """
    adjusted_count = max(1, available_units_count)
    reformulated = dict(current_requirements)
    reformulated["original_requested_count"] = current_requirements.get("team_count_needed", 3)
    reformulated["team_count_needed"] = adjusted_count
    reformulated["reformulation_active"] = True
    reformulated["reformulation_notes"] = (
        f"Sub-agent adjusted requirements from {current_requirements.get('team_count_needed', 3)} "
        f"down to {adjusted_count} units. Directive: Prioritizing primary life-support transformer "
        f"and deferred non-critical substation drainage to phase 2."
    )
    reformulated["constraint_feedback_received"] = constraint_feedback
    return reformulated
