"""
Test Suite for Redesigned Confidence Calculator Agent
Validates:
1. Scenario A: High-Confidence Flood (Rain > 0, Hotspot, Waterway nearby)
2. Scenario B: Spurious / False Alarm Flood (Rain = 0, Outside Hotspot, Outside Waterway)
3. Scenario C: Heatwave Alert (Temp > 32°C)
4. Scenario D: Grid Fault / Fallen Wire (Power infra within 30m)
"""

import asyncio
import sys
import os

# Add voice-agent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from agents.confidence_agent import confidence_calculator_agent


async def run_tests():
    print("=" * 65)
    print("ZeroGrid Redesigned Confidence Calculator Agent - Verification Suite")
    print("=" * 65)

    # -------------------------------------------------------------
    # 1. SCENARIO A: Verified Critical Flood
    # -------------------------------------------------------------
    print("\n[TEST 1] Scenario A: Verified Severe Flood")
    res_a = await confidence_calculator_agent(
        incident={
            "incident_id": "INC_TEST_FLOOD_TRUE",
            "category": "WATERLOGGING",
            "coordinates": [72.8120, 19.4560], # Virar East Substation Hotspot
            "water_depth_cm": 45.0,
            "message": "Severe waterlogging at Virar East Substation bowl"
        },
        weather_context={"rainfall_mm_per_hr": 24.5, "temperature_c": 26.0}
    )
    print(f"  Score: {res_a['raw_score']}% ({res_a['confidence_score']}) | Valid: {res_a['is_valid_alert']}")
    print(f"  Action: {res_a['action_directive']}")
    print(f"  Breakdown: {res_a['score_breakdown']}")
    print(f"  Summary: {res_a['context']}")
    assert res_a["is_valid_alert"] is True, "Scenario A should pass threshold"
    assert res_a["action_directive"] == "TRIGGER_HIGH_CONFIDENCE_PIPELINE"

    # -------------------------------------------------------------
    # 2. SCENARIO B: Low-Confidence / Spam Flood
    # -------------------------------------------------------------
    print("\n[TEST 2] Scenario B: Spurious Flood (No Rain, Elevated Area)")
    res_b = await confidence_calculator_agent(
        incident={
            "incident_id": "INC_TEST_FLOOD_FALSE",
            "category": "FLOOD",
            "coordinates": [72.9000, 19.6000], # Far from known hotspots & power lines
            "water_depth_cm": 0.0,
            "message": "Reported flood on mountain ridge"
        },
        weather_context={"rainfall_mm_per_hr": 0.0, "temperature_c": 28.0}
    )
    print(f"  Score: {res_b['raw_score']}% ({res_b['confidence_score']}) | Valid: {res_b['is_valid_alert']}")
    print(f"  Action: {res_b['action_directive']}")
    print(f"  Breakdown: {res_b['score_breakdown']}")
    print(f"  Summary: {res_b['context']}")
    assert res_b["is_valid_alert"] is False, "Scenario B should fail threshold"
    assert res_b["action_directive"] == "FLAG_LOW_CONFIDENCE_AWAITING_HITL"
    assert res_b["raw_score"] < 65, "Score must be under 65%"

    # -------------------------------------------------------------
    # 3. SCENARIO C: Verified Heatwave
    # -------------------------------------------------------------
    print("\n[TEST 3] Scenario C: Heatwave Incident (Temp > 32°C)")
    res_c = await confidence_calculator_agent(
        incident={
            "incident_id": "INC_TEST_HEATWAVE",
            "category": "HEATWAVE",
            "coordinates": [72.8120, 19.4560],
            "water_depth_cm": 0.0,
            "message": "Extreme heat stress warning"
        },
        weather_context={"temperature_c": 36.5, "rainfall_mm_per_hr": 0.0}
    )
    print(f"  Score: {res_c['raw_score']}% ({res_c['confidence_score']}) | Valid: {res_c['is_valid_alert']}")
    print(f"  Action: {res_c['action_directive']}")
    print(f"  Breakdown: {res_c['score_breakdown']}")
    print(f"  Summary: {res_c['context']}")
    assert res_c["is_valid_alert"] is True, "Scenario C should pass threshold"
    assert res_c["score_breakdown"]["weather_modifier"] == 15, "Weather modifier must be +15 for Temp > 32°C"

    # -------------------------------------------------------------
    # 4. SCENARIO D: Power Line / Grid Fault
    # -------------------------------------------------------------
    print("\n[TEST 4] Scenario D: Grid Fault (Power Infra within 30m)")
    res_d = await confidence_calculator_agent(
        incident={
            "incident_id": "INC_TEST_WIRE_FAULT",
            "category": "FALLEN_GRID",
            "coordinates": [72.8120, 19.4560], # Right at 33kV Substation
            "water_depth_cm": 0.0,
            "message": "Downed 33kV conductor sparking on road"
        }
    )
    print(f"  Score: {res_d['raw_score']}% ({res_d['confidence_score']}) | Valid: {res_d['is_valid_alert']}")
    print(f"  Action: {res_d['action_directive']}")
    print(f"  Breakdown: {res_d['score_breakdown']}")
    print(f"  Summary: {res_d['context']}")
    assert res_d["score_breakdown"]["osm_modifier"] == 25, "OSM modifier must be +25 for power infra within 30m"

    print("\n" + "=" * 65)
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_tests())
