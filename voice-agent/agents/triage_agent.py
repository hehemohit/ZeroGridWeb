"""
ZeroGrid Emergency Triage & Environmental Sub-Agent
Assesses human casualty probability, flood depth severity, coastal tidal surge, and facility exposure.
Uses FAST_MODEL for rapid crisis containment evaluation.
"""

import logging
from typing import Dict, Any, Optional
from .base import get_groq_async_client, extract_json_from_llm, FAST_MODEL

logger = logging.getLogger("zerogrid.agents.triage")


async def run_triage_agent(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any],
    weather_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Sub-Agent 1: Emergency Triage Commander & Environmental Analyst.
    Correlates ground telemetry, weather rainfall, and tidal levels with human life threats.
    """
    sys_prompt = (
        "You are the ZeroGrid Emergency Triage & Environmental Sub-Agent. Your role is human safety, "
        "casualty risk assessment, flood depth analysis, and weather telemetry correlation. "
        "Keep all explanations concise (under 25 words). "
        "You MUST respond ONLY with a valid JSON object without surrounding commentary."
    )

    weather_text = ""
    if weather_context:
        rainfall = weather_context.get("rainfall_mm_per_hr", weather_context.get("rainfall", 45.0))
        tide = weather_context.get("tidal_surge_m", weather_context.get("tide", 2.1))
        weather_text = f"\n- Live Environmental Telemetry: Rainfall={rainfall} mm/hr, Tidal Surge={tide} m"

    user_prompt = f"""
Analyze this disaster telemetry:
Incident Data:
- ID: {incident.get('incident_id', 'UNKNOWN')}
- Type: {incident.get('incident_type', 'FLOOD_POWER_RISK')}
- Water Depth (cm): {incident.get('water_depth_cm', 'N/A')}
- Reported Severity: {incident.get('severity', 'HIGH')}
- Telemetry/Message: {incident.get('message', incident.get('description', 'Substation water ingress reported'))}
- Critical Facilities Nearby: {graph_context.get('critical_facilities', [])}{weather_text}

Return a valid JSON object matching this schema:
{{
  "threat_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "casualty_risk_assessment": "concise description of human risk and electrocution hazards",
  "priority_facilities_threatened": ["list", "of", "facilities"],
  "evacuation_recommended": true,
  "human_safety_hazard": "Critical|High|Moderate|Low",
  "containment_priority": "concise priority rationale",
  "environmental_factors": {{
    "rainfall_severity": "High",
    "tidal_influence": "Active coastal surge"
  }}
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
            max_tokens=600
        )
        parsed = extract_json_from_llm(completion.choices[0].message.content or "")
        parsed["agent"] = "TRIAGE_COMMANDER"
        parsed.setdefault("human_safety_hazard", "Critical" if parsed.get("threat_level") in ["HIGH", "CRITICAL"] else "Moderate")
        parsed.setdefault("priority_facilities_threatened", graph_context.get("critical_facilities", ["HOSPITAL_SANJEEVANI"]))
        parsed["model_used"] = FAST_MODEL
        return parsed
    except Exception as e:
        logger.error(f"Triage sub-agent fallback triggered: {e}")
        return {
            "agent": "TRIAGE_COMMANDER",
            "threat_level": "CRITICAL" if float(incident.get("water_depth_cm", 30)) > 40 else "HIGH",
            "human_safety_hazard": "Critical",
            "casualty_risk_assessment": f"Imminent electrocution hazard due to standing water near 33kV switchyard (Fallback: {e})",
            "priority_facilities_threatened": graph_context.get("critical_facilities", ["HOSPITAL_SANJEEVANI"]),
            "evacuation_recommended": True,
            "containment_priority": "Immediate isolation of submerged grid assets to protect civilian life.",
            "environmental_factors": {
                "rainfall_severity": "Monsoonal surge",
                "tidal_influence": "High tide backflow"
            },
            "model_used": "deterministic_fallback"
        }
