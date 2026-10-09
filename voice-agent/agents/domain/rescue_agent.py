"""
ZeroGrid Specialized Rescue Management Sub-Agent
Analyzes physical entrapment, swiftwater emergencies, mass casualty triage,
and multi-casualty transport.
Generates structured workforce demand targeting RESCUE_MANAGEMENT department with tactical tags.
Falls back to HEATWAVE_MANAGEMENT for auxiliary first-aid and hydration support.
"""

import logging
from typing import Dict, Any, List, Optional
from ..base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.domain.rescue")

PRIMARY_DEPARTMENT = "RESCUE_MANAGEMENT"
FALLBACK_DEPARTMENT = "HEATWAVE_MANAGEMENT"
PRIMARY_TAGS = ["SEARCH_SQUAD", "PARAMEDIC", "EVAC_VEHICLE", "SWIFTWATER_RESCUE"]
FALLBACK_TAGS = ["FIRST_AID", "HYDRATION_SQUAD", "SHELTER_EVAC"]


async def run_rescue_agent(
    incident: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates rescue severity and generates tag-based workforce demand.
    """
    category = str(incident.get("category") or "TRAPPED").upper()
    priority = str(incident.get("priority") or "CRITICAL").upper()
    message = str(incident.get("message") or incident.get("text") or "Civilians trapped in collapsed structure / stranded in rapid current")
    coords = incident.get("coordinates") or [72.8020, 19.4420]

    sys_prompt = (
        "You are the ZeroGrid Rescue Management Sub-Agent commanding the RESCUE_MANAGEMENT department. "
        "Analyze life entrapment, swiftwater conditions, paramedic requirements, and mass extraction routes. "
        "Generate a structured JSON workforce demand payload targeting RESCUE_MANAGEMENT with specific operational tags. "
        "Tags must be selected from: ['SEARCH_SQUAD', 'PARAMEDIC', 'EVAC_VEHICLE', 'SWIFTWATER_RESCUE']. "
        "Respond ONLY with valid JSON."
    )

    user_prompt = f"""
Rescue Incident Context:
- Category: {category}
- Priority: {priority}
- Coordinates: {coords}
- Incident Report: {message}

Generate a JSON object matching this schema:
{{
  "targetDepartment": "RESCUE_MANAGEMENT",
  "requiredRole": "SEARCH_SQUAD",
  "teamCount": 3,
  "requiredTags": ["SEARCH_SQUAD", "PARAMEDIC", "EVAC_VEHICLE"],
  "urgencyMinutes": 10,
  "fallbackDepartment": "HEATWAVE_MANAGEMENT",
  "fallbackTags": ["FIRST_AID", "HYDRATION_SQUAD"],
  "operationalBrief": "Deploy swift search and extraction units to extricate trapped survivors and provide on-scene trauma stabilization.",
  "tacticalPrecautions": "Ensure perimeter security and verify structural stability prior to team entry."
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
        parsed["agent"] = "RESCUE_MANAGEMENT_AGENT"
        parsed.setdefault("targetDepartment", PRIMARY_DEPARTMENT)
        parsed.setdefault("fallbackDepartment", FALLBACK_DEPARTMENT)
        parsed.setdefault("requiredRole", "SEARCH_SQUAD")
        parsed.setdefault("teamCount", 3 if priority == "CRITICAL" else 2)
        parsed.setdefault("requiredTags", ["SEARCH_SQUAD", "PARAMEDIC", "EVAC_VEHICLE"])
        parsed.setdefault("fallbackTags", FALLBACK_TAGS)
        parsed.setdefault("urgencyMinutes", 10 if priority == "CRITICAL" else 20)
        return parsed
    except Exception as e:
        logger.warning(f"Rescue agent LLM fallback triggered: {e}")
        return {
            "agent": "RESCUE_MANAGEMENT_AGENT",
            "targetDepartment": PRIMARY_DEPARTMENT,
            "requiredRole": "SEARCH_SQUAD",
            "teamCount": 3 if priority == "CRITICAL" else 2,
            "requiredTags": ["SEARCH_SQUAD", "PARAMEDIC", "EVAC_VEHICLE"],
            "urgencyMinutes": 10 if priority == "CRITICAL" else 20,
            "fallbackDepartment": FALLBACK_DEPARTMENT,
            "fallbackTags": FALLBACK_TAGS,
            "operationalBrief": "Critical search and extrication emergency. Immediate deployment of trauma paramedics and high-clearance evacuation vehicles.",
            "tacticalPrecautions": "Structural hazard advisory active. Maintain perimeter control and medical staging post.",
            "model_used": "deterministic_fallback"
        }


def reformulate_rescue_demand(
    shortfall: int,
    original_demand: Dict[str, Any],
    feedback: str
) -> Dict[str, Any]:
    """
    Called when Agent Zero detects a resource shortfall in RESCUE_MANAGEMENT.
    Pivots deficit to HEATWAVE_MANAGEMENT for auxiliary first-aid squads and mobile hydration triage.
    """
    reformulated = dict(original_demand)
    reformulated["targetDepartment"] = original_demand.get("fallbackDepartment", FALLBACK_DEPARTMENT)
    reformulated["requiredRole"] = "FIRST_AID"
    reformulated["teamCount"] = max(1, shortfall)
    reformulated["requiredTags"] = original_demand.get("fallbackTags", FALLBACK_TAGS)
    reformulated["is_fallback"] = True
    reformulated["reformulation_notes"] = (
        f"Primary department {PRIMARY_DEPARTMENT} had a shortfall of {shortfall} squad(s). "
        f"Pivoting deficit to {reformulated['targetDepartment']} for auxiliary first aid and field stabilization."
    )
    reformulated["feedback_received"] = feedback
    return reformulated
