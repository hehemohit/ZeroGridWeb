"""
ZeroGrid Specialized Flood Management Sub-Agent
Analyzes water levels, drain backflow, culvert inundation, and pedestrian/vehicle stranding.
Generates structured workforce demand targeting FLOOD_MANAGEMENT department with tactical tags.
Falls back to RESCUE_MANAGEMENT upon workforce depletion.
"""

import logging
from typing import Dict, Any, List, Optional
from ..base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.domain.flood")

PRIMARY_DEPARTMENT = "FLOOD_MANAGEMENT"
FALLBACK_DEPARTMENT = "RESCUE_MANAGEMENT"
PRIMARY_TAGS = ["DEWATERING", "DEEP_WATER_RESQ", "ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"]
FALLBACK_TAGS = ["EVAC_VEHICLE", "SEARCH_SQUAD", "INFLATABLE_BOAT"]


async def run_flood_agent(
    incident: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates flood severity and generates tag-based workforce demand.
    """
    water_depth = float(incident.get("water_depth_cm") or incident.get("waterDepthCm") or 35)
    category = str(incident.get("category") or "WATERLOGGING").upper()
    priority = str(incident.get("priority") or "MEDIUM").upper()
    message = str(incident.get("message") or incident.get("text") or "Submerged road and drainage overflow")
    coords = incident.get("coordinates") or [72.8140, 19.4580]

    sys_prompt = (
        "You are the ZeroGrid Flood Management Sub-Agent commanding the FLOOD_MANAGEMENT department. "
        "Analyze water ingress, life safety risks, and culvert blockages. "
        "You must generate a structured JSON workforce demand payload targeting FLOOD_MANAGEMENT with specific operational tags. "
        "Tags must be selected from: ['DEWATERING', 'DEEP_WATER_RESQ', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP_500HP']. "
        "Respond ONLY with valid JSON."
    )

    user_prompt = f"""
Flood Incident Context:
- Water Depth (cm): {water_depth}
- Category: {category}
- Priority: {priority}
- Coordinates: {coords}
- Citizen/Sensor Description: {message}

Generate a JSON object matching this schema:
{{
  "targetDepartment": "FLOOD_MANAGEMENT",
  "requiredRole": "DEEP_WATER_RESQ",
  "teamCount": 3,
  "requiredTags": ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"],
  "urgencyMinutes": 15,
  "fallbackDepartment": "RESCUE_MANAGEMENT",
  "fallbackTags": ["EVAC_VEHICLE", "SEARCH_SQUAD"],
  "operationalBrief": "Evacuate stranded civilians and deploy dewatering pump to relieve submerged roadway.",
  "tacticalPrecautions": "Verify electrical isolation of submerged streetlights before entering water."
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
        parsed["agent"] = "FLOOD_MANAGEMENT_AGENT"
        parsed.setdefault("targetDepartment", PRIMARY_DEPARTMENT)
        parsed.setdefault("fallbackDepartment", FALLBACK_DEPARTMENT)
        parsed.setdefault("requiredRole", "DEEP_WATER_RESQ" if water_depth > 50 else "DEWATERING")
        parsed.setdefault("teamCount", 3 if priority == "CRITICAL" else (2 if water_depth > 30 else 1))
        parsed.setdefault("requiredTags", ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"] if water_depth > 40 else ["DEWATERING"])
        parsed.setdefault("fallbackTags", FALLBACK_TAGS)
        parsed.setdefault("urgencyMinutes", 15 if priority in ["HIGH", "CRITICAL"] else 30)
        return parsed
    except Exception as e:
        logger.warning(f"Flood agent LLM fallback triggered: {e}")
        # High fidelity deterministic fallback
        team_count = 3 if water_depth > 60 or priority == "CRITICAL" else (2 if water_depth > 25 else 1)
        role = "DEEP_WATER_RESQ" if water_depth > 40 else "DEWATERING"
        tags = ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"] if water_depth > 40 else ["DEWATERING", "SUBMERSIBLE_PUMP_500HP"]
        return {
            "agent": "FLOOD_MANAGEMENT_AGENT",
            "targetDepartment": PRIMARY_DEPARTMENT,
            "requiredRole": role,
            "teamCount": team_count,
            "requiredTags": tags,
            "urgencyMinutes": 15 if priority in ["HIGH", "CRITICAL"] else 30,
            "fallbackDepartment": FALLBACK_DEPARTMENT,
            "fallbackTags": FALLBACK_TAGS,
            "operationalBrief": f"Severe water accumulation ({water_depth}cm). Deploy dewatering assets and emergency flood evacuation teams.",
            "tacticalPrecautions": "Electrocution hazard in standing water. Linemen zero-voltage clearance required.",
            "model_used": "deterministic_fallback"
        }


def reformulate_flood_demand(
    shortfall: int,
    original_demand: Dict[str, Any],
    feedback: str
) -> Dict[str, Any]:
    """
    Called when Agent Zero detects a resource shortfall.
    Pivots from FLOOD_MANAGEMENT to RESCUE_MANAGEMENT for the remaining deficit.
    """
    reformulated = dict(original_demand)
    reformulated["targetDepartment"] = original_demand.get("fallbackDepartment", FALLBACK_DEPARTMENT)
    reformulated["requiredRole"] = "PARAMEDIC_RESCUE"
    reformulated["teamCount"] = max(1, shortfall)
    reformulated["requiredTags"] = original_demand.get("fallbackTags", FALLBACK_TAGS)
    reformulated["is_fallback"] = True
    reformulated["reformulation_notes"] = (
        f"Primary department {PRIMARY_DEPARTMENT} had a shortfall of {shortfall} squad(s). "
        f"Pivoted remaining demand to {reformulated['targetDepartment']} with general evacuation gear."
    )
    reformulated["feedback_received"] = feedback
    return reformulated
