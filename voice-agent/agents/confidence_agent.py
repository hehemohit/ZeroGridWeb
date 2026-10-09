"""
ZeroGrid Confidence Calculator Agent (Central Orchestrator)
Orchestrates concurrent multi-modal verification:
1. Historical Pattern Analyzer (MongoDB Memory)
2. Real-Time Weather Agent (Open-Meteo Live API)
3. OSM Spatial Validation Agent (OpenStreetMap Overpass API)

Computes deterministic confidence score:
    Total Score = 50 (Base) + M_historical + M_weather + M_osm
Threshold:
    Score >= 65% -> Trigger High-Confidence Pipeline (Forward to Agent Zero)
    Score < 65%  -> Flag as Low-Confidence / Spam (Awaiting HITL Approval)
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
from .base import get_groq_async_client, extract_json_from_llm, FAST_MODEL
from .confidence import (
    historical_pattern_analyzer,
    real_time_weather_agent,
    osm_spatial_validation_agent
)

logger = logging.getLogger("zerogrid.agents.confidence")

CONFIDENCE_THRESHOLD = 0.65  # 65% Threshold as per system specification
BASE_SCORE = 50


async def confidence_calculator_agent(
    incident: Dict[str, Any],
    coordinates: Optional[List[float]] = None,
    weather_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Central Orchestrator:
    Concurrently executes Historical, Weather, and OSM sub-agents via asyncio.gather,
    sums the modifiers with base score 50, evaluates against 65% threshold,
    and returns a transparent audit verification packet.
    """
    coords = coordinates or incident.get("coordinates") or [19.4560, 72.8120]
    category = incident.get("incident_type") or incident.get("category") or "FLOOD"
    desc = incident.get("message") or incident.get("description") or "Emergency alert reported"
    water_depth = incident.get("water_depth_cm", 0.0)

    # 1. Concurrently execute all 3 verification sub-agents
    try:
        hist_task = historical_pattern_analyzer(coords)
        weather_task = real_time_weather_agent(coords, category, weather_context)
        osm_task = osm_spatial_validation_agent(coords, category)

        hist_res, weather_res, osm_res = await asyncio.gather(
            hist_task,
            weather_task,
            osm_task,
            return_exceptions=False
        )
    except Exception as e:
        logger.error(f"Error during parallel sub-agent execution: {e}")
        # Graceful fallback sub-agent deliverables
        hist_res = {"sub_agent": "HISTORICAL", "modifier": 5, "reason": "Fallback historical verification"}
        weather_res = {"sub_agent": "WEATHER", "modifier": 0, "reason": "Fallback weather verification"}
        osm_res = {"sub_agent": "OSM", "modifier": 0, "reason": "Fallback spatial verification"}

    # 2. Extract quantitative modifiers
    mod_hist = int(hist_res.get("modifier", 5))
    mod_weather = int(weather_res.get("modifier", 0))
    mod_osm = int(osm_res.get("modifier", 0))

    # 3. Compute Deterministic Agent Confidence Score
    raw_total = BASE_SCORE + mod_hist + mod_weather + mod_osm
    clamped_score = max(0, min(100, raw_total))
    confidence_fraction = round(clamped_score / 100.0, 2)
    is_valid = clamped_score >= int(CONFIDENCE_THRESHOLD * 100)

    veracity_classification = (
        "VERIFIED_CRITICAL" if clamped_score >= 80 else (
            "VERIFIED_HIGH_CONFIDENCE" if is_valid else "LOW_CONFIDENCE_SPAM"
        )
    )

    action_directive = (
        "TRIGGER_HIGH_CONFIDENCE_PIPELINE" if is_valid else "FLAG_LOW_CONFIDENCE_AWAITING_HITL"
    )

    # 4. Generate concise commander audit summary
    summary_text = (
        f"Confidence Score {clamped_score}/100 [Base 50, Hist {mod_hist:+d}, Weather {mod_weather:+d}, OSM {mod_osm:+d}]. "
        f"{'Passed 65% threshold -> forwarded to Agent Zero.' if is_valid else 'Failed 65% threshold -> flagged for HITL.'}"
    )

    # Attempt LLM synthesis for executive-ready briefing if Groq is available
    executive_context = summary_text
    try:
        client = get_groq_async_client()
        sys_prompt = (
            "You are the ZeroGrid Confidence Calculator Agent. Summarize the multi-modal verification results "
            "(Base 50, Historical, Live Weather, and OSM Spatial checks) into a punchy 1-sentence statement (under 25 words). "
            "State whether the alert is verified or flagged for review."
        )
        user_prompt = f"""
Alert Category: {category}
Coordinates: {coords}
Base Score: 50
Historical Check: {hist_res.get('reason')} ({mod_hist:+d})
Live Weather Check: {weather_res.get('reason')} ({mod_weather:+d})
OSM Spatial Check: {osm_res.get('reason')} ({mod_osm:+d})
Final Score: {clamped_score}% -> {'VERIFIED' if is_valid else 'FLAGGED AS SPAM'}
"""
        completion = await asyncio.wait_for(
            client.chat.completions.create(
                model=FAST_MODEL,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                max_tokens=150
            ),
            timeout=1.8
        )
        llm_reply = completion.choices[0].message.content or ""
        if llm_reply.strip():
            executive_context = llm_reply.strip().replace('"', '')
    except Exception as llm_err:
        logger.debug(f"LLM briefing synthesis skipped ({llm_err}), using deterministic summary")

    logger.info(
        f"🎯 [Confidence Orchestrator] Final Score: {clamped_score}% ({confidence_fraction}) | Valid: {is_valid} | Directive: {action_directive}"
    )

    return {
        "agent": "CONFIDENCE_CALCULATOR",
        "confidence_score": confidence_fraction,
        "raw_score": clamped_score,
        "is_valid_alert": is_valid,
        "veracity_classification": veracity_classification,
        "action_directive": action_directive,
        "threshold": CONFIDENCE_THRESHOLD,
        "context": executive_context,
        "anomaly_detected": not is_valid,
        "filtering_rationale": (
            "Multi-modal verification passed threshold (Score >= 65%)."
            if is_valid
            else f"Low confidence alert ({clamped_score}% < 65%). Telemetry or spatial attributes failed validation."
        ),
        "score_breakdown": {
            "base_score": BASE_SCORE,
            "historical_modifier": mod_hist,
            "weather_modifier": mod_weather,
            "osm_modifier": mod_osm,
            "total_score": clamped_score
        },
        "sub_agents": {
            "historical_analyzer": hist_res,
            "weather_agent": weather_res,
            "osm_spatial_agent": osm_res
        },
        "model_used": FAST_MODEL
    }
