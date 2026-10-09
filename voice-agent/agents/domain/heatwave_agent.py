"""
ZeroGrid Specialized Heatwave Management Sub-Agent
Analyzes extreme heat, wet-bulb temperatures, vulnerable civilian clusters, and thermal stroke risks.
Generates structured workforce demand targeting HEATWAVE_MANAGEMENT department with tactical tags.
Falls back to RESCUE_MANAGEMENT upon workforce depletion.
"""

import logging
from typing import Dict, Any, List, Optional
from ..base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.domain.heatwave")

PRIMARY_DEPARTMENT = "HEATWAVE_MANAGEMENT"
FALLBACK_DEPARTMENT = "RESCUE_MANAGEMENT"
PRIMARY_TAGS = ["MEDICAL_TRIAGE", "HYDRATION_SQUAD", "COOLING_STATION", "MISTING_CANOPY"]
FALLBACK_TAGS = ["PARAMEDIC", "AMBULANCE_EVAC", "TRIAGE_OFFICER"]


async def run_heatwave_agent(
    incident: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates heatwave severity and generates tag-based workforce demand.
    """
    temp_c = float(incident.get("temperature_c") or 43.5)
    category = str(incident.get("category") or "HEATWAVE").upper()
    priority = str(incident.get("priority") or "HIGH").upper()
    message = str(incident.get("message") or incident.get("text") or "Civilians collapsing due to heat exhaustion in crowded transit hub")
    coords = incident.get("coordinates") or [72.8150, 19.4520]

    sys_prompt = (
        "You are the ZeroGrid Heatwave Management Sub-Agent commanding the HEATWAVE_MANAGEMENT department. "
        "Analyze extreme ambient temperatures, heat stroke hazards, hydration deficits, and cooling logistics. "
        "Generate a structured JSON workforce demand payload targeting HEATWAVE_MANAGEMENT with specific operational tags. "
        "Tags must be selected from: ['MEDICAL_TRIAGE', 'HYDRATION_SQUAD', 'COOLING_STATION', 'MISTING_CANOPY']. "
        "Respond ONLY with valid JSON."
    )

    user_prompt = f"""
Heatwave Incident Context:
- Ambient Temperature (°C): {temp_c}
- Category: {category}
- Priority: {priority}
- Coordinates: {coords}
- Incident Report: {message}

Generate a JSON object matching this schema:
{{
  "targetDepartment": "HEATWAVE_MANAGEMENT",
  "requiredRole": "HYDRATION_SQUAD",
  "teamCount": 2,
  "requiredTags": ["HYDRATION_SQUAD", "COOLING_STATION"],
  "urgencyMinutes": 20,
  "fallbackDepartment": "RESCUE_MANAGEMENT",
  "fallbackTags": ["PARAMEDIC", "AMBULANCE_EVAC"],
  "operationalBrief": "Deploy rapid misting shelter and high-capacity ORS hydration station to stabilize victims.",
  "tacticalPrecautions": "Monitor responders for heat exhaustion; establish 30-minute rotation cycles."
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
        parsed["agent"] = "HEATWAVE_MANAGEMENT_AGENT"
        parsed.setdefault("targetDepartment", PRIMARY_DEPARTMENT)
        parsed.setdefault("fallbackDepartment", FALLBACK_DEPARTMENT)
        parsed.setdefault("requiredRole", "MEDICAL_TRIAGE" if priority == "CRITICAL" else "HYDRATION_SQUAD")
        parsed.setdefault("teamCount", 3 if priority == "CRITICAL" else 2)
        parsed.setdefault("requiredTags", ["MEDICAL_TRIAGE", "COOLING_STATION"] if priority == "CRITICAL" else ["HYDRATION_SQUAD", "COOLING_STATION"])
        parsed.setdefault("fallbackTags", FALLBACK_TAGS)
        parsed.setdefault("urgencyMinutes", 15 if priority == "CRITICAL" else 25)
        return parsed
    except Exception as e:
        logger.warning(f"Heatwave agent LLM fallback triggered: {e}")
        return {
            "agent": "HEATWAVE_MANAGEMENT_AGENT",
            "targetDepartment": PRIMARY_DEPARTMENT,
            "requiredRole": "MEDICAL_TRIAGE" if priority == "CRITICAL" else "HYDRATION_SQUAD",
            "teamCount": 3 if priority == "CRITICAL" else 2,
            "requiredTags": ["MEDICAL_TRIAGE", "COOLING_STATION", "MISTING_CANOPY"],
            "urgencyMinutes": 15 if priority == "CRITICAL" else 25,
            "fallbackDepartment": FALLBACK_DEPARTMENT,
            "fallbackTags": FALLBACK_TAGS,
            "operationalBrief": f"Severe heat emergency ({temp_c}°C). Rapid deployment of hydration supplies and misting triage canopy.",
            "tacticalPrecautions": "Ensure continuous cold-chain electrolytes and mandatory rest rotations for responders.",
            "model_used": "deterministic_fallback"
        }


def reformulate_heatwave_demand(
    shortfall: int,
    original_demand: Dict[str, Any],
    feedback: str
) -> Dict[str, Any]:
    """
    Called when Agent Zero detects a resource shortfall in HEATWAVE_MANAGEMENT.
    Pivots remaining demand to RESCUE_MANAGEMENT (paramedics and emergency ambulances).
    """
    reformulated = dict(original_demand)
    reformulated["targetDepartment"] = original_demand.get("fallbackDepartment", FALLBACK_DEPARTMENT)
    reformulated["requiredRole"] = "PARAMEDIC_RESCUE"
    reformulated["teamCount"] = max(1, shortfall)
    reformulated["requiredTags"] = original_demand.get("fallbackTags", FALLBACK_TAGS)
    reformulated["is_fallback"] = True
    reformulated["reformulation_notes"] = (
        f"Primary department {PRIMARY_DEPARTMENT} had a shortfall of {shortfall} unit(s). "
        f"Pivoting deficit to {reformulated['targetDepartment']} for paramedic mobile ambulances."
    )
    reformulated["feedback_received"] = feedback
    return reformulated
