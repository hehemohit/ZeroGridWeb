"""
ZeroGrid Real-Time Weather Agent Sub-Agent
Fetches live meteorological parameters (Precipitation mm/hr, Temperature °C, Wind speed km/h)
from Open-Meteo REST API and checks conditions against incident category.

Scoring Rules:
- Category = FLOOD:
    - Rainfall > 0 mm/hr -> +20
    - Rainfall == 0 mm/hr -> -15
- Category = HEATWAVE:
    - Temp > 32°C -> +15
    - Temp <= 32°C -> -5
- Other Categories -> 0 (neutral)
"""

import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger("zerogrid.confidence.weather")

FLOOD_CATEGORIES = {
    "FLOOD",
    "WATERLOGGING",
    "SUBMERGED_UNDERPASS",
    "DRAINAGE_OVERFLOW",
    "SUBSTATION_WATER_INGRESS"
}


def _normalize_coords(coordinates: Optional[List[float]]) -> tuple[float, float]:
    """Extracts (lat, lng) handling both [lng, lat] and [lat, lng] input order."""
    if not coordinates or len(coordinates) < 2:
        return 19.456, 72.812

    c0, c1 = float(coordinates[0]), float(coordinates[1])
    if c0 > 50.0:  # c0 is longitude
        return c1, c0
    return c0, c1


async def real_time_weather_agent(
    coordinates: Optional[List[float]] = None,
    category: Optional[str] = None,
    weather_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Sub-Agent 2: Real-Time Weather Agent (Open-Meteo Live API).
    """
    cat = (category or "FLOOD").upper().strip()
    lat, lng = _normalize_coords(coordinates)

    rainfall_mm = 0.0
    temperature_c = 28.0
    wind_kmh = 10.0
    source = "LIVE_OPEN_METEO"

    # 1. Fetch live meteorological data from Open-Meteo
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": round(lat, 4),
            "longitude": round(lng, 4),
            "current": "temperature_2m,precipitation,wind_speed_10m",
            "timezone": "auto"
        }
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                temperature_c = float(current.get("temperature_2m", temperature_c))
                rainfall_mm = float(current.get("precipitation", rainfall_mm))
                wind_kmh = float(current.get("wind_speed_10m", wind_kmh))
            else:
                logger.warning(f"Open-Meteo returned status {resp.status_code}")
                source = "CONTEXT_FALLBACK"
    except Exception as err:
        logger.warning(f"Live weather API lookup error ({err}), falling back to context/heuristic")
        source = "CONTEXT_FALLBACK"

    # 2. Blend ground sensor telemetry if provided in weather_context
    if weather_context:
        if "rainfall_mm_per_hr" in weather_context or "rainfall" in weather_context:
            sensor_rain = float(weather_context.get("rainfall_mm_per_hr", weather_context.get("rainfall", 0.0)))
            rainfall_mm = max(rainfall_mm, sensor_rain)
            source = f"{source}+GROUND_SENSOR"
        if "temperature_c" in weather_context or "temp" in weather_context:
            temperature_c = float(weather_context.get("temperature_c", weather_context.get("temp", temperature_c)))
            source = f"{source}+GROUND_SENSOR"
        if "wind_kmh" in weather_context:
            wind_kmh = float(weather_context["wind_kmh"])

    # 3. Evaluate scoring matrix based on category
    modifier = 0
    rule_matched = "NEUTRAL"
    reason = ""

    if cat in FLOOD_CATEGORIES or "WATER" in cat or "FLOOD" in cat:
        if rainfall_mm > 0.0:
            modifier = 20
            rule_matched = "FLOOD_RAIN_POSITIVE"
            reason = f"Active precipitation ({rainfall_mm} mm/hr) validates flood report"
        else:
            modifier = -15
            rule_matched = "FLOOD_NO_RAIN"
            reason = f"Zero precipitation (0.0 mm/hr) contradicts reported flood conditions"

    elif "HEAT" in cat or cat == "HEATWAVE":
        if temperature_c > 32.0:
            modifier = 15
            rule_matched = "HEATWAVE_CRITICAL_TEMP"
            reason = f"Elevated ambient temperature ({temperature_c:.1f}°C > 32°C) confirms thermal distress"
        else:
            modifier = -5
            rule_matched = "HEATWAVE_MODERATE_TEMP"
            reason = f"Ambient temperature ({temperature_c:.1f}°C <= 32°C) does not meet severe heatwave threshold"

    else:
        modifier = 0
        rule_matched = "CATEGORY_NEUTRAL"
        reason = f"Category '{cat}' is meteorologically neutral"

    logger.info(
        f"🌤️ [Weather Agent] Score: {modifier:+d} | Cat: {cat} | Rain: {rainfall_mm}mm/hr | Temp: {temperature_c}°C | {reason}"
    )

    return {
        "sub_agent": "REAL_TIME_WEATHER_AGENT",
        "category_evaluated": cat,
        "rainfall_mm_per_hr": rainfall_mm,
        "temperature_c": temperature_c,
        "wind_speed_kmh": wind_kmh,
        "data_source": source,
        "rule_matched": rule_matched,
        "modifier": modifier,
        "reason": reason
    }
