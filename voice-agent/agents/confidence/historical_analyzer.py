"""
ZeroGrid Historical Pattern Analyzer Sub-Agent
Evaluates whether incoming incident coordinates correspond to known chronic hazard zones
or high-density historical incident clusters in MongoDB memory.

Scoring Rules:
- Known High-Incident Zone: +15
- No Known Prior History:   +5
"""

import math
import logging
from typing import List, Dict, Any, Optional

from spatial_memory import spatial_memory, haversine_distance_km

logger = logging.getLogger("zerogrid.confidence.historical")

# Fallback known chronic hotspots in the Mumbai/Virar corridor for offline/simulation resilience
KNOWN_CHRONIC_ZONES = [
    {
        "name": "Virar East Low-Lying Bowl & Railway Culvert",
        "coordinates": [72.8120, 19.4560],
        "radius_meters": 500,
        "chronic_risk": "CRITICAL"
    },
    {
        "name": "Ward 4 Step-Down Drainage Trench",
        "coordinates": [72.8150, 19.4580],
        "radius_meters": 450,
        "chronic_risk": "HIGH"
    },
    {
        "name": "Sanjeevani Underpass & Feeder Corridor",
        "coordinates": [72.8180, 19.4540],
        "radius_meters": 500,
        "chronic_risk": "CRITICAL"
    },
    {
        "name": "Vasai West Tidal Ingress Estuary",
        "coordinates": [72.8010, 19.4320],
        "radius_meters": 600,
        "chronic_risk": "HIGH"
    }
]


async def historical_pattern_analyzer(
    coordinates: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    Sub-Agent 1: Historical Pattern Analyzer (MongoDB Memory).
    
    Checks if incident location is inside a known high-incident zone.
    Returns:
      - modifier: +15 if inside known high-incident zone, else +5.
    """
    if not coordinates or len(coordinates) < 2:
        coords = [72.8125, 19.4565]
    else:
        coords = coordinates

    matched_zone: Optional[str] = None
    min_dist_m: float = float("inf")
    is_high_incident = False

    # 1. Query live MongoDB 'floodhotspots' collection if available
    db = getattr(spatial_memory, "_db", None)
    if db is not None:
        try:
            hotspots_col = db.get_collection("floodhotspots")
            for doc in hotspots_col.find().limit(50):
                loc = doc.get("location", {})
                h_coords = loc.get("coordinates") if isinstance(loc, dict) else doc.get("coordinates")
                if h_coords and len(h_coords) >= 2:
                    dist_km = haversine_distance_km(coords, h_coords)
                    dist_m = dist_km * 1000.0
                    if dist_m < min_dist_m:
                        min_dist_m = dist_m
                    if dist_m <= 500.0:
                        is_high_incident = True
                        matched_zone = doc.get("name", "Documented Flood Hotspot")
                        break

            # 2. Check historical incident cluster in 'sosevents' (3+ prior incidents within 1km)
            if not is_high_incident:
                sos_col = db.get_collection("sosevents")
                nearby_count = 0
                for s in sos_col.find({"status": "RESOLVED"}).limit(100):
                    sloc = s.get("location", {})
                    s_coords = sloc.get("coordinates") if isinstance(sloc, dict) else s.get("coordinates")
                    if s_coords and len(s_coords) >= 2:
                        if haversine_distance_km(coords, s_coords) <= 1.0:
                            nearby_count += 1
                            if nearby_count >= 3:
                                is_high_incident = True
                                matched_zone = f"Historical Incident Cluster ({nearby_count} prior SOS)"
                                break

        except Exception as e:
            logger.warning(f"Historical analyzer MongoDB query error: {e}")

    # 3. Fallback to known chronic zone topological index
    if not is_high_incident:
        for zone in KNOWN_CHRONIC_ZONES:
            dist_km = haversine_distance_km(coords, zone["coordinates"])
            dist_m = dist_km * 1000.0
            if dist_m < min_dist_m:
                min_dist_m = dist_m
            if dist_m <= zone["radius_meters"]:
                is_high_incident = True
                matched_zone = zone["name"]
                break

    modifier = 15 if is_high_incident else 5
    reason = (
        f"Correlated with known high-incident zone '{matched_zone}' ({round(min_dist_m)}m away)"
        if is_high_incident
        else f"No chronic hotspot record nearby (closest: {round(min_dist_m) if min_dist_m != float('inf') else 'N/A'}m)"
    )

    logger.info(f"📍 [Historical Analyzer] Score: {modifier:+d} | High Incident: {is_high_incident} | {reason}")

    return {
        "sub_agent": "HISTORICAL_PATTERN_ANALYZER",
        "is_high_incident_zone": is_high_incident,
        "modifier": modifier,
        "matched_zone": matched_zone,
        "distance_meters": round(min_dist_m, 1) if min_dist_m != float("inf") else None,
        "reason": reason
    }
