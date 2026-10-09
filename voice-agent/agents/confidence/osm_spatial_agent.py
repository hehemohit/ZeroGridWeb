"""
ZeroGrid OSM Spatial Validation Sub-Agent
Queries OpenStreetMap geospatial data via Overpass API to verify
proximity to power infrastructure or flood-prone drainage waterways.

Scoring Rules:
- Category = WIRE_DAMAGE / GRID_FAULT:
    - Power infrastructure within 30m?
        - Yes: +25
        - No:  -20
- Category = FLOOD:
    - Inside flood-prone area / waterway?
        - Yes: +20
        - No:  -10
- Other Categories -> 0 (neutral)
"""

import math
import logging
from typing import List, Dict, Any, Optional
import httpx

from spatial_memory import haversine_distance_km

logger = logging.getLogger("zerogrid.confidence.osm")

GRID_FAULT_CATEGORIES = {
    "WIRE_DAMAGE",
    "GRID_FAULT",
    "FALLEN_GRID",
    "TRANSFORMER_FAILURE",
    "SUBSTATION_FAULT",
    "ELECTRICAL"
}

FLOOD_CATEGORIES = {
    "FLOOD",
    "WATERLOGGING",
    "SUBMERGED_UNDERPASS",
    "DRAINAGE_OVERFLOW",
    "SUBSTATION_WATER_INGRESS"
}

# Local high-resolution known electrical assets for fast/offline fallback
KNOWN_POWER_ASSETS = [
    {"name": "SUB_VIRAR_EAST_01 Main 33kV Switchyard", "coordinates": [72.8120, 19.4560], "type": "substation"},
    {"name": "XFMR_WARD4_02 Step-Down Transformer", "coordinates": [72.8150, 19.4580], "type": "transformer"},
    {"name": "NODE_HOSPITAL_09 Feeder Terminal", "coordinates": [72.8180, 19.4540], "type": "feeder"},
    {"name": "SUB_VASAI_WEST_03 Backup Substation", "coordinates": [72.8010, 19.4320], "type": "substation"}
]

KNOWN_WATERWAYS = [
    {"name": "Virar East Substation Drainage Basin & Culvert", "coordinates": [72.8120, 19.4560], "type": "drain"},
    {"name": "Virar East Storm Culvert Drainage Canal", "coordinates": [72.8130, 19.4565], "type": "drain"},
    {"name": "Ward 4 Railway Low-Lying Culvert", "coordinates": [72.8155, 19.4578], "type": "ditch"},
    {"name": "Vasai Creek Tidal Ingress", "coordinates": [72.8015, 19.4325], "type": "creek"}
]


def _normalize_coords(coordinates: Optional[List[float]]) -> tuple[float, float]:
    """Extracts (lat, lng) handling both [lng, lat] and [lat, lng] input order."""
    if not coordinates or len(coordinates) < 2:
        return 19.456, 72.812

    c0, c1 = float(coordinates[0]), float(coordinates[1])
    if c0 > 50.0:  # c0 is longitude
        return c1, c0
    return c0, c1


async def _query_overpass(query: str, timeout: float = 3.0) -> Optional[Dict[str, Any]]:
    """Executes an Overpass QL query with error suppression."""
    endpoint = "https://overpass-api.de/api/interpreter"
    headers = {
        "User-Agent": "ZeroGridEmergencyPlatform/2.0 (incident-dispatch; contact@zerogrid.internal)",
        "Accept": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(endpoint, data={"data": query}, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Overpass API query failed or timed out: {e}")
    return None


async def osm_spatial_validation_agent(
    coordinates: Optional[List[float]] = None,
    category: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sub-Agent 3: OSM Spatial Validation Agent (Overpass API).
    """
    cat = (category or "FLOOD").upper().strip()
    lat, lng = _normalize_coords(coordinates)
    raw_coords = [lng, lat]

    modifier = 0
    rule_matched = "NEUTRAL"
    reason = ""
    power_infra_within_30m = False
    flood_prone_within_50m = False
    source = "OVERPASS_LIVE"

    if cat in GRID_FAULT_CATEGORIES or "GRID" in cat or "WIRE" in cat:
        # Check power lines/poles within 30 meters
        overpass_ql = f"""
        [out:json][timeout:3];
        (
          node["power"](around:30,{lat},{lng});
          way["power"="line"](around:30,{lat},{lng});
          way["power"="minor_line"](around:30,{lat},{lng});
        );
        out count;
        """
        osm_res = await _query_overpass(overpass_ql)
        
        if osm_res and "elements" in osm_res and len(osm_res["elements"]) > 0:
            count = int(osm_res["elements"][0].get("tags", {}).get("total", 0))
            power_infra_within_30m = count > 0
        else:
            # Fallback to local high-precision power asset index
            source = "LOCAL_TOPOLOGY_FALLBACK"
            for asset in KNOWN_POWER_ASSETS:
                dist_m = haversine_distance_km(raw_coords, asset["coordinates"]) * 1000.0
                if dist_m <= 30.0:
                    power_infra_within_30m = True
                    break

        if power_infra_within_30m:
            modifier = 25
            rule_matched = "POWER_INFRA_FOUND"
            reason = "Verified power infrastructure (line/pole/substation) within 30m of reported grid hazard"
        else:
            modifier = -20
            rule_matched = "NO_POWER_INFRA_NEARBY"
            reason = "No power transmission lines or poles detected within 30m of reported coordinates"

    elif cat in FLOOD_CATEGORIES or "WATER" in cat or "FLOOD" in cat:
        # Check waterway / water / flood_prone tags within 50 meters
        overpass_ql = f"""
        [out:json][timeout:3];
        (
          way["waterway"](around:50,{lat},{lng});
          way["natural"="water"](around:50,{lat},{lng});
          way["drainage"](around:50,{lat},{lng});
        );
        out count;
        """
        osm_res = await _query_overpass(overpass_ql)

        if osm_res and "elements" in osm_res and len(osm_res["elements"]) > 0:
            count = int(osm_res["elements"][0].get("tags", {}).get("total", 0))
            flood_prone_within_50m = count > 0
        else:
            # Fallback to local drainage canal index
            source = "LOCAL_TOPOLOGY_FALLBACK"
            for ditch in KNOWN_WATERWAYS:
                dist_m = haversine_distance_km(raw_coords, ditch["coordinates"]) * 1000.0
                if dist_m <= 50.0:
                    flood_prone_within_50m = True
                    break

        if flood_prone_within_50m:
            modifier = 20
            rule_matched = "INSIDE_FLOOD_PRONE_ZONE"
            reason = "OSM tags confirm active drainage canal/waterway within 50m of location"
        else:
            modifier = -10
            rule_matched = "OUTSIDE_FLOOD_ZONE"
            reason = "No waterway, storm canal, or low-lying water basin found within 50m"

    else:
        modifier = 0
        rule_matched = "CATEGORY_NEUTRAL"
        reason = f"Category '{cat}' does not require OSM power or waterway spatial verification"

    logger.info(
        f"🗺️ [OSM Spatial Agent] Score: {modifier:+d} | Cat: {cat} | Power Infra <=30m: {power_infra_within_30m} | Flood Prone <=50m: {flood_prone_within_50m} | {reason}"
    )

    return {
        "sub_agent": "OSM_SPATIAL_VALIDATION_AGENT",
        "category_evaluated": cat,
        "power_infrastructure_within_30m": power_infra_within_30m,
        "flood_prone_area_within_50m": flood_prone_within_50m,
        "data_source": source,
        "rule_matched": rule_matched,
        "modifier": modifier,
        "reason": reason
    }
