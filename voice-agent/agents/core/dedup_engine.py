"""
ZeroGrid Agent Zero: Deduplication & Dynamic Priority Escalation Engine
Performs spatial-temporal deduplication on incoming incidents against active MongoDB records.
If duplicate is found:
- Increments reportCount (+1)
- Logs citizen report into witnessReports
- Dynamically escalates priority level (LOW -> MEDIUM -> HIGH -> CRITICAL)
If new incident:
- Initializes reportCount = 1
- Sets baseline priority from upstream Confidence Agent score
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from bson import ObjectId

from spatial_memory import spatial_memory, haversine_distance_km

logger = logging.getLogger("zerogrid.agent_zero.dedup")

# Category to Domain classification map
CATEGORY_TO_DOMAIN = {
    "WATERLOGGING": "FLOOD",
    "SUBMERGED_UNDERPASS": "FLOOD",
    "DRAINAGE_OVERFLOW": "FLOOD",
    "SUBSTATION_WATER_INGRESS": "FLOOD",
    "FLOOD": "FLOOD",
    "HEATWAVE": "HEATWAVE",
    "FALLEN_GRID": "POWER_GRID",
    "TRANSFORMER_FAILURE": "POWER_GRID",
    "GRID_FAULT": "POWER_GRID",
    "WIRE_DAMAGE": "POWER_GRID",
    "TRAPPED": "RESCUE",
    "MEDICAL": "RESCUE",
    "SECURITY": "RESCUE",
    "DISASTER": "RESCUE"
}

# Fallback in-memory tracking when MongoDB is offline
IN_MEMORY_INCIDENTS: Dict[str, Dict[str, Any]] = {}


def _normalize_coords(coordinates: Optional[List[float]]) -> List[float]:
    """Ensures [lng, lat] GeoJSON ordering (Mumbai: lng ~72.8, lat ~19.4)."""
    if not coordinates or len(coordinates) < 2:
        return [72.8125, 19.4565]
    c0, c1 = float(coordinates[0]), float(coordinates[1])
    if c0 < c1:  # c0 is lat (~19.4), c1 is lng (~72.8)
        return [c1, c0]
    return [c0, c1]


def map_category_to_domain(category: str) -> str:
    cat = (category or "").upper().strip()
    return CATEGORY_TO_DOMAIN.get(cat, "OTHER")


def calculate_escalated_priority(report_count: int, conf_score: float, current_priority: str = "MEDIUM") -> Tuple[str, int]:
    """
    Computes priority tier and quantitative score (0-100) based on report count and confidence.
    Priority Formula:
      Score = (conf_score * 40) + min(report_count * 15, 45) + severity_mod
    """
    base_conf = float(conf_score or 0.8)
    if report_count >= 5:
        return "CRITICAL", 95
    elif report_count >= 3:
        return "CRITICAL", 88
    elif report_count == 2:
        return "HIGH", 78
    else:
        tier = "HIGH" if base_conf >= 0.85 else ("MEDIUM" if base_conf >= 0.65 else "LOW")
        score = int(base_conf * 100)
        return tier, score


def find_duplicate_incident(
    coords: List[float],
    category: str,
    max_radius_meters: float = 350.0,
    time_window_minutes: int = 60
) -> Optional[Dict[str, Any]]:
    """
    Queries active incidents in MongoDB within max_radius_meters and time_window_minutes.
    """
    norm_coords = _normalize_coords(coords)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=time_window_minutes)
    domain = map_category_to_domain(category)

    db = getattr(spatial_memory, "_db", None)
    if db is not None:
        try:
            sos_col = db.get_collection("sosevents")
            # Query for active or open incidents updated recently
            cursor = sos_col.find({
                "status": {"$in": ["ACTIVE", "INVESTIGATING", "ALLOCATING", "DISPATCHED", "ON_SCENE", "ACKNOWLEDGED"]},
                "lastReportedAt": {"$gte": cutoff}
            }).limit(50)

            for doc in cursor:
                loc = doc.get("location", {})
                d_coords = loc.get("coordinates") if isinstance(loc, dict) else doc.get("coordinates")
                if d_coords and len(d_coords) >= 2:
                    dist_km = haversine_distance_km(norm_coords, d_coords)
                    dist_m = dist_km * 1000.0
                    if dist_m <= max_radius_meters:
                        # Correlate category or domain
                        doc_domain = doc.get("domain") or map_category_to_domain(doc.get("category", ""))
                        if doc_domain == domain or doc.get("category") == category:
                            return doc
        except Exception as e:
            logger.warning(f"Error executing MongoDB duplicate spatial query: {e}")

    # Fallback to in-memory active incidents
    for inc_id, inc_doc in IN_MEMORY_INCIDENTS.items():
        if inc_doc.get("status") in ["ACTIVE", "INVESTIGATING", "DISPATCHED"]:
            d_coords = inc_doc.get("coordinates", [72.812, 19.456])
            dist_m = haversine_distance_km(norm_coords, d_coords) * 1000.0
            if dist_m <= max_radius_meters:
                return inc_doc

    return None


async def process_deduplication_and_escalation(
    incident: Dict[str, Any],
    confidence_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Core Entrypoint:
    Evaluates incident against existing MongoDB records.
    If Duplicate: Increments count, logs witness, escalates priority.
    If New: Persists new incident with initial baseline priority.
    """
    raw_coords = incident.get("coordinates") or [72.8125, 19.4565]
    norm_coords = _normalize_coords(raw_coords)
    category = incident.get("incident_type") or incident.get("category") or "OTHER"
    domain = map_category_to_domain(category)
    message = incident.get("message") or incident.get("description") or "Emergency beacon reported"
    depth_cm = float(incident.get("water_depth_cm") or 0.0)
    conf_score = float(confidence_data.get("confidence_score", 0.85) if confidence_data else 0.85)

    now = datetime.now(timezone.utc)
    witness_entry = {
        "citizenId": incident.get("triggeredBy") or incident.get("user_id"),
        "displayName": incident.get("displayName", "Civic Witness"),
        "timestamp": now.isoformat(),
        "reportedDepthCm": depth_cm,
        "message": message,
        "coordinates": norm_coords
    }

    # Search for active duplicate in MongoDB
    dup_doc = find_duplicate_incident(norm_coords, category)
    db = getattr(spatial_memory, "_db", None)

    if dup_doc:
        inc_id = str(dup_doc.get("_id") or dup_doc.get("incident_id"))
        current_count = int(dup_doc.get("reportCount", 1))
        new_count = current_count + 1
        new_priority, new_score = calculate_escalated_priority(new_count, conf_score)

        logger.info(
            f"🔁 [Duplicate Detected] Incident {inc_id} report count incremented: {current_count} -> {new_count}. "
            f"Priority escalated to {new_priority} (Score: {new_score}/100)"
        )

        update_fields = {
            "reportCount": new_count,
            "priority": new_priority,
            "priorityScore": new_score,
            "lastReportedAt": now,
            "status": "ESCALATED_MASS_CASUALTY" if new_count >= 5 else (
                "INVESTIGATING" if dup_doc.get("status") == "ACTIVE" else dup_doc.get("status")
            )
        }

        if db is not None:
            try:
                sos_col = db.get_collection("sosevents")
                obj_id = ObjectId(inc_id) if ObjectId.is_valid(inc_id) else inc_id
                sos_col.update_one(
                    {"_id": obj_id},
                    {
                        "$set": update_fields,
                        "$push": {"witnessReports": witness_entry}
                    }
                )
            except Exception as e:
                logger.warning(f"Could not update MongoDB duplicate record: {e}")

        # Update in-memory cache
        if inc_id in IN_MEMORY_INCIDENTS:
            IN_MEMORY_INCIDENTS[inc_id].update(update_fields)
            IN_MEMORY_INCIDENTS[inc_id].setdefault("witnessReports", []).append(witness_entry)

        return {
            "is_duplicate": True,
            "incident_id": inc_id,
            "domain": domain,
            "category": category,
            "report_count": new_count,
            "priority": new_priority,
            "priority_score": new_score,
            "escalated": True,
            "message": f"Corroborated incident: {new_count} citizens reported this crisis. Priority escalated to {new_priority}.",
            "coordinates": norm_coords,
            "witness_count": new_count
        }

    else:
        # New Incident Ticket
        inc_id = incident.get("incident_id") or incident.get("id") or f"INC_{int(now.timestamp())}"
        initial_priority, initial_score = calculate_escalated_priority(1, conf_score)

        new_record = {
            "incident_id": inc_id,
            "category": category,
            "domain": domain,
            "status": "ACTIVE",
            "reportCount": 1,
            "priority": initial_priority,
            "priorityScore": initial_score,
            "coordinates": norm_coords,
            "message": message,
            "waterDepthCm": depth_cm,
            "firstReportedAt": now,
            "lastReportedAt": now,
            "witnessReports": [witness_entry]
        }

        logger.info(
            f"✨ [New Incident Registered] Ticket {inc_id} ({domain}) created. "
            f"Report Count: 1 | Priority: {initial_priority} (Score: {initial_score})"
        )

        IN_MEMORY_INCIDENTS[inc_id] = new_record

        return {
            "is_duplicate": False,
            "incident_id": inc_id,
            "domain": domain,
            "category": category,
            "report_count": 1,
            "priority": initial_priority,
            "priority_score": initial_score,
            "escalated": False,
            "message": f"New incident registered. Baseline priority set to {initial_priority}.",
            "coordinates": norm_coords,
            "witness_count": 1
        }
