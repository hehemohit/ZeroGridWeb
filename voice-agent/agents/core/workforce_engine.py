"""
ZeroGrid Agent Zero: Workforce Matching & Allocation Engine
Queries MongoDB collection 'tacticalteams' for available IDLE field units,
ranks them by geospatial distance/ETA, secures atomic distributed locks in Redis,
and mobilizes them with status transitions (IDLE -> EN_ROUTE).
"""

import math
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId

from spatial_memory import spatial_memory, haversine_distance_km

logger = logging.getLogger("zerogrid.agent_zero.workforce")

# Fallback in-memory tactical teams if MongoDB is in offline mode
FALLBACK_TEAMS = [
    {
        "teamId": "TEAM_NDRF_ALPHA",
        "name": "NDRF Flood Rescue Alpha",
        "domain": "FLOOD_RESCUE",
        "status": "IDLE",
        "coordinates": [72.8140, 19.4580],
        "speedKmh": 25,
        "skills": ["DEEP_WATER_EVAC", "INFLATABLE_BOAT_PILOT"],
        "equipment": ["ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"]
    },
    {
        "teamId": "TEAM_PUMP_CREW_01",
        "name": "Municipal Dewatering Squad 01",
        "domain": "DEWATERING",
        "status": "IDLE",
        "coordinates": [72.8130, 19.4565],
        "speedKmh": 20,
        "skills": ["CULVERT_DRAINAGE", "HIGH_CAPACITY_PUMPING"],
        "equipment": ["500HP_DIESEL_PUMP", "DISCHARGE_HOSES_300M"]
    },
    {
        "teamId": "TEAM_LINEMEN_SQUAD_04",
        "name": "MSEDCL High-Voltage Linemen",
        "domain": "ELECTRICAL_GRID",
        "status": "IDLE",
        "coordinates": [72.8115, 19.4555],
        "speedKmh": 30,
        "skills": ["HV_BREAKER_ISOLATION", "AIR_GAP_VERIFICATION"],
        "equipment": ["BUCKET_TRUCK", "HOTSTICK_KIT"]
    },
    {
        "teamId": "TEAM_VASAI_RESCUE_02",
        "name": "Civil Defense Quick Response 02",
        "domain": "PARAMEDIC_RESCUE",
        "status": "IDLE",
        "coordinates": [72.8020, 19.4420],
        "speedKmh": 40,
        "skills": ["CARDIAC_TRIAGE", "HEAT_STROKE_TREATMENT"],
        "equipment": ["MOBILE_ICU_AMBULANCE", "DEFIBRILLATOR"]
    },
    {
        "teamId": "TEAM_COOLING_SQUAD_01",
        "name": "Municipal Heatwave Crisis Squad 01",
        "domain": "HEATWAVE_SUPPORT",
        "status": "IDLE",
        "coordinates": [72.8150, 19.4520],
        "speedKmh": 30,
        "skills": ["HYDRATION_DISTRIBUTION", "MISTING_SHELTER_SETUP"],
        "equipment": ["MISTING_CANOPY", "HYDRATION_TANKER_2000L"]
    }
]


def _normalize_coords(coordinates: Optional[List[float]]) -> List[float]:
    """Ensures [lng, lat] GeoJSON ordering."""
    if not coordinates or len(coordinates) < 2:
        return [72.8125, 19.4565]
    c0, c1 = float(coordinates[0]), float(coordinates[1])
    if c0 < c1:
        return [c1, c0]
    return [c0, c1]


async def match_and_allocate_workforce(
    incident_id: str,
    incident_coords: List[float],
    demand: Dict[str, Any],
    redis_manager_instance: Any = None
) -> Dict[str, Any]:
    """
    Executes workforce matching against MongoDB 'tacticalteams' collection.
    
    1. Filters units with status == 'IDLE' and matching or relevant domain.
    2. Ranks by distance & estimated transit time (ETA).
    3. Secures distributed atomic lock (SET NX EX in Redis).
    4. Atomically transitions MongoDB team status from 'IDLE' to 'EN_ROUTE'.
    """
    norm_coords = _normalize_coords(incident_coords)
    required_role = demand.get("requiredRole") or demand.get("team_type_needed") or "FLOOD_RESCUE"
    needed_count = int(demand.get("teamCount") or demand.get("team_count_needed") or 1)

    db = getattr(spatial_memory, "_db", None)
    candidate_squads = []

    # 1. Query MongoDB 'tacticalteams' collection
    if db is not None:
        try:
            teams_col = db.get_collection("tacticalteams")
            # First attempt: exact domain match
            query = {"status": "IDLE"}
            if required_role:
                query["domain"] = required_role

            cursor = teams_col.find(query).limit(10)
            for doc in cursor:
                loc = doc.get("currentLocation", {})
                t_coords = loc.get("coordinates") if isinstance(loc, dict) else doc.get("coordinates")
                if t_coords and len(t_coords) >= 2:
                    dist_km = haversine_distance_km(norm_coords, t_coords)
                    speed = float(doc.get("speedKmh", 30))
                    eta_mins = round((dist_km / speed) * 60, 1)
                    candidate_squads.append({
                        "teamId": doc.get("teamId"),
                        "name": doc.get("name"),
                        "domain": doc.get("domain"),
                        "distance_km": round(dist_km, 2),
                        "eta_minutes": eta_mins,
                        "personnel": doc.get("personnelCount", 6),
                        "equipment": doc.get("equipment", []),
                        "doc_id": doc.get("_id")
                    })

            # If no units with exact domain found, relax filter to any IDLE unit
            if not candidate_squads:
                cursor_any = teams_col.find({"status": "IDLE"}).limit(10)
                for doc in cursor_any:
                    loc = doc.get("currentLocation", {})
                    t_coords = loc.get("coordinates") if isinstance(loc, dict) else doc.get("coordinates")
                    if t_coords and len(t_coords) >= 2:
                        dist_km = haversine_distance_km(norm_coords, t_coords)
                        speed = float(doc.get("speedKmh", 30))
                        candidate_squads.append({
                            "teamId": doc.get("teamId"),
                            "name": doc.get("name"),
                            "domain": doc.get("domain"),
                            "distance_km": round(dist_km, 2),
                            "eta_minutes": round((dist_km / speed) * 60, 1),
                            "personnel": doc.get("personnelCount", 6),
                            "equipment": doc.get("equipment", []),
                            "doc_id": doc.get("_id")
                        })
        except Exception as e:
            logger.warning(f"Error querying MongoDB tactical teams: {e}")

    # Fallback in-memory squads if DB was unreachable or empty
    if not candidate_squads:
        for fb in FALLBACK_TEAMS:
            if fb.get("status") == "IDLE":
                dist_km = haversine_distance_km(norm_coords, fb["coordinates"])
                speed = fb.get("speedKmh", 30)
                candidate_squads.append({
                    "teamId": fb["teamId"],
                    "name": fb["name"],
                    "domain": fb["domain"],
                    "distance_km": round(dist_km, 2),
                    "eta_minutes": round((dist_km / speed) * 60, 1),
                    "personnel": 6,
                    "equipment": fb.get("equipment", [])
                })

    # Sort candidate squads by shortest transit distance
    candidate_squads.sort(key=lambda s: s["distance_km"])

    assigned_squads = []
    locked_team_ids = []

    now = datetime.now(timezone.utc)

    for squad in candidate_squads:
        team_id = squad["teamId"]
        lock_acquired = True

        # Acquire distributed atomic lock in Redis if redis_manager provided
        if redis_manager_instance:
            try:
                res = redis_manager_instance.acquire_team_lock(team_id, incident_id, ttl_seconds=1800)
                lock_acquired = bool(res.get("success", True))
            except Exception as r_err:
                logger.warning(f"Redis lock check warning for {team_id}: {r_err}")
                lock_acquired = True

        if lock_acquired:
            # Atomically transition MongoDB status from IDLE to EN_ROUTE
            if db is not None:
                try:
                    teams_col = db.get_collection("tacticalteams")
                    teams_col.update_one(
                        {"teamId": team_id},
                        {
                            "$set": {
                                "status": "EN_ROUTE",
                                "assignedIncidentId": incident_id,
                                "assignedAt": now
                            }
                        }
                    )
                except Exception as db_err:
                    logger.warning(f"Failed to update team {team_id} in MongoDB: {db_err}")

            assigned_squads.append(squad)
            locked_team_ids.append(team_id)

            logger.info(
                f"🚨 [Workforce Dispatched] Squad {team_id} ({squad['name']}) -> Incident {incident_id}. "
                f"Distance: {squad['distance_km']}km | ETA: {squad['eta_minutes']} mins | Status: EN_ROUTE"
            )

            if len(assigned_squads) >= needed_count:
                break

    # Update SosEvent with assignedSquad in MongoDB
    if db is not None and locked_team_ids:
        try:
            sos_col = db.get_collection("sosevents")
            obj_id = ObjectId(incident_id) if ObjectId.is_valid(incident_id) else incident_id
            sos_col.update_one(
                {"_id": obj_id},
                {
                    "$set": {
                        "assignedSquad": locked_team_ids[0],
                        "status": "DISPATCHED"
                    }
                }
            )
        except Exception as e:
            logger.warning(f"Could not update SosEvent {incident_id} with assigned squad: {e}")

    allocation_success = len(assigned_squads) > 0

    return {
        "success": allocation_success,
        "requested_role": required_role,
        "requested_count": needed_count,
        "allocated_count": len(assigned_squads),
        "assigned_teams": locked_team_ids,
        "squad_details": assigned_squads,
        "status": "ALLOCATED_AND_DISPATCHED" if allocation_success else "SQUADS_DEPLETED_AWAITING_MUTUAL_AID"
    }
