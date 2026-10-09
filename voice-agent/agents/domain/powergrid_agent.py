"""
ZeroGrid Specialized Power Grid Management Sub-Agent
Analyzes topological grid stability, high-voltage line faults, transformer substation inundation,
and hospital tie-line lifeline rerouting.
Generates structured workforce demand targeting POWER_GRID_MANAGEMENT department with tactical tags.
Falls back to FLOOD_MANAGEMENT if electrical switchyards require emergency dewatering pumps.
"""

import logging
from typing import Dict, Any, List, Optional
from ..base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.domain.powergrid")

PRIMARY_DEPARTMENT = "POWER_GRID_MANAGEMENT"
FALLBACK_DEPARTMENT = "FLOOD_MANAGEMENT"
PRIMARY_TAGS = ["HV_LINEMAN", "SUBSTATION_ISOLATION", "BUCKET_TRUCK", "HOTSTICK_KIT"]
FALLBACK_TAGS = ["DEWATERING", "PUMP_CREW", "SAFETY_ISOLATION"]


async def run_powergrid_agent(
    incident: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates power grid fault severity and generates tag-based workforce demand.
    """
    category = str(incident.get("category") or "FALLEN_GRID").upper()
    priority = str(incident.get("priority") or "CRITICAL").upper()
    message = str(incident.get("message") or incident.get("text") or "33kV Feeder line snapped into flooded street, arching and sparking")
    affected_node = incident.get("affectedNodeId") or "SUB_VIRAR_EAST_01"
    water_depth = float(incident.get("water_depth_cm") or 30)
    coords = incident.get("coordinates") or [72.8115, 19.4555]

    sys_prompt = (
        "You are the ZeroGrid Power Grid Management Sub-Agent commanding the POWER_GRID_MANAGEMENT department. "
        "Analyze grid cascade risks, fallen conductors, transformer flashovers, and isolation sequences. "
        "Generate a structured JSON workforce demand payload targeting POWER_GRID_MANAGEMENT with specific operational tags. "
        "Tags must be selected from: ['HV_LINEMAN', 'SUBSTATION_ISOLATION', 'BUCKET_TRUCK', 'HOTSTICK_KIT']. "
        "Respond ONLY with valid JSON."
    )

    user_prompt = f"""
Power Grid Incident Context:
- Substation Node: {affected_node}
- Category: {category}
- Priority: {priority}
- Coordinates: {coords}
- Water Depth at Site (cm): {water_depth}
- Description: {message}

Generate a JSON object matching this schema:
{{
  "targetDepartment": "POWER_GRID_MANAGEMENT",
  "requiredRole": "HV_LINEMAN",
  "teamCount": 2,
  "requiredTags": ["HV_LINEMAN", "SUBSTATION_ISOLATION"],
  "urgencyMinutes": 10,
  "fallbackDepartment": "FLOOD_MANAGEMENT",
  "fallbackTags": ["DEWATERING", "PUMP_CREW"],
  "operationalBrief": "Isolate upstream 33kV breaker and deploy bucket truck linemen to splice severed overhead feeder.",
  "tacticalPrecautions": "Perform physical air-gap zero-voltage verification before grounding wire."
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
            max_tokens=500
        )
        parsed = extract_json_from_llm(completion.choices[0].message.content or "")
        parsed["agent"] = "POWER_GRID_MANAGEMENT_AGENT"
        parsed.setdefault("targetDepartment", PRIMARY_DEPARTMENT)
        parsed.setdefault("fallbackDepartment", FALLBACK_DEPARTMENT)
        parsed.setdefault("requiredRole", "HV_LINEMAN")
        parsed.setdefault("teamCount", 2)
        parsed.setdefault("requiredTags", ["HV_LINEMAN", "SUBSTATION_ISOLATION"])
        parsed.setdefault("fallbackTags", FALLBACK_TAGS)
        parsed.setdefault("urgencyMinutes", 10 if priority == "CRITICAL" else 20)
        return parsed
    except Exception as e:
        logger.warning(f"Power Grid agent LLM fallback triggered: {e}")
        return {
            "agent": "POWER_GRID_MANAGEMENT_AGENT",
            "targetDepartment": PRIMARY_DEPARTMENT,
            "requiredRole": "HV_LINEMAN",
            "teamCount": 2,
            "requiredTags": ["HV_LINEMAN", "SUBSTATION_ISOLATION", "BUCKET_TRUCK"],
            "urgencyMinutes": 10,
            "fallbackDepartment": FALLBACK_DEPARTMENT,
            "fallbackTags": FALLBACK_TAGS,
            "operationalBrief": f"Critical grid hazard at {affected_node}. Immediate high-voltage line isolation and physical grounding required.",
            "tacticalPrecautions": "Prohibit all water entry until linemen confirm zero-voltage trip on breaker.",
            "model_used": "deterministic_fallback"
        }


def reformulate_powergrid_demand(
    shortfall: int,
    original_demand: Dict[str, Any],
    feedback: str
) -> Dict[str, Any]:
    """
    Called when Agent Zero detects a resource shortfall in POWER_GRID_MANAGEMENT.
    If linemen are depleted or substation switchyard is flooded, pivots to FLOOD_MANAGEMENT dewatering crews.
    """
    reformulated = dict(original_demand)
    reformulated["targetDepartment"] = original_demand.get("fallbackDepartment", FALLBACK_DEPARTMENT)
    reformulated["requiredRole"] = "DEWATERING"
    reformulated["teamCount"] = max(1, shortfall)
    reformulated["requiredTags"] = original_demand.get("fallbackTags", FALLBACK_TAGS)
    reformulated["is_fallback"] = True
    reformulated["reformulation_notes"] = (
        f"Primary department {PRIMARY_DEPARTMENT} had a shortfall of {shortfall} squad(s). "
        f"Pivoting deficit to {reformulated['targetDepartment']} for high-capacity dewatering pumps to clear switchyard."
    )
    reformulated["feedback_received"] = feedback
    return reformulated
