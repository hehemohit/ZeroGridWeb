"""
ZeroGrid Agent Zero: Workforce Matching & Allocation Engine
Queries MongoDB 'users' collection for available personnel created for the 4 crisis teams:
- FLOOD_MANAGEMENT (40 personnel)
- HEATWAVE_MANAGEMENT (40 personnel)
- POWER_GRID_MANAGEMENT (40 personnel)
- RESCUE_MANAGEMENT (40 personnel)

Checks real-time availability (availabilityStatus == 'AVAILABLE' / activeTicketId == null),
secures atomic distributed locks in Redis, and assigns selected personnel to the incident ticket.
If a shortfall occurs, Agent 0 reports the deficit back to the sub-agent and executes the
Iterative Fallback Loop to mobilize personnel from the fallback department.
Constructs mandatory dispatch messages embedding requiredTags.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId

from spatial_memory import spatial_memory

logger = logging.getLogger("zerogrid.agent_zero.workforce")

# Default in-memory personnel roster for offline / fallback mode
DEFAULT_DEPARTMENT_PERSONNEL = {
    "FLOOD_MANAGEMENT": [
        {"name": "Aarav Sharma (Flood Lead)", "email": "admin.flood.01@zerogrid.org", "tags": ["ADMIN", "FLOOD_MANAGEMENT", "WATER_RESCUE", "DEWATERING", "ZODIAC_BOAT", "SUBMERSIBLE_PUMP_500HP"]},
        {"name": "Rohan Kulkarni", "email": "admin.flood.02@zerogrid.org", "tags": ["ADMIN", "FLOOD_MANAGEMENT", "WATER_RESCUE", "DEWATERING", "ZODIAC_BOAT"]},
        {"name": "Priya Deshmukh", "email": "admin.flood.03@zerogrid.org", "tags": ["ADMIN", "FLOOD_MANAGEMENT", "WATER_RESCUE", "DEWATERING", "SUBMERSIBLE_PUMP_500HP"]},
        {"name": "Vikram Patil", "email": "admin.flood.04@zerogrid.org", "tags": ["ADMIN", "FLOOD_MANAGEMENT", "WATER_RESCUE", "DEWATERING"]},
    ],
    "HEATWAVE_MANAGEMENT": [
        {"name": "Dr. Amit Verma (Heat Lead)", "email": "admin.heat.01@zerogrid.org", "tags": ["ADMIN", "HEATWAVE_MANAGEMENT", "HYDRATION", "COOLING_SHELTER", "MEDICAL_TRIAGE", "MISTING_CANOPY"]},
        {"name": "Sunita Rao", "email": "admin.heat.02@zerogrid.org", "tags": ["ADMIN", "HEATWAVE_MANAGEMENT", "HYDRATION", "COOLING_SHELTER", "MEDICAL_TRIAGE"]},
        {"name": "Rajesh Nair", "email": "admin.heat.03@zerogrid.org", "tags": ["ADMIN", "HEATWAVE_MANAGEMENT", "HYDRATION", "COOLING_SHELTER"]},
    ],
    "POWER_GRID_MANAGEMENT": [
        {"name": "Er. Devendra Dixit (Grid Lead)", "email": "admin.grid.01@zerogrid.org", "tags": ["ADMIN", "POWER_GRID_MANAGEMENT", "HV_LINEMEN", "SUBSTATION_OPS", "BUCKET_TRUCK", "HOTSTICK_KIT"]},
        {"name": "Alok Sen", "email": "admin.grid.02@zerogrid.org", "tags": ["ADMIN", "POWER_GRID_MANAGEMENT", "HV_LINEMEN", "SUBSTATION_OPS", "BUCKET_TRUCK"]},
        {"name": "Swati Bose", "email": "admin.grid.03@zerogrid.org", "tags": ["ADMIN", "POWER_GRID_MANAGEMENT", "HV_LINEMEN", "SUBSTATION_OPS"]},
    ],
    "RESCUE_MANAGEMENT": [
        {"name": "Cdr. Rakesh Chauhan (Rescue Lead)", "email": "admin.rescue.01@zerogrid.org", "tags": ["ADMIN", "RESCUE_MANAGEMENT", "SEARCH_RESCUE", "EVACUATION", "CIVIL_DEFENSE", "PARAMEDIC", "EVAC_VEHICLE"]},
        {"name": "Jaswinder Singh", "email": "admin.rescue.02@zerogrid.org", "tags": ["ADMIN", "RESCUE_MANAGEMENT", "SEARCH_RESCUE", "EVACUATION", "PARAMEDIC"]},
        {"name": "Gurpreet Kaur", "email": "admin.rescue.03@zerogrid.org", "tags": ["ADMIN", "RESCUE_MANAGEMENT", "SEARCH_RESCUE", "EVACUATION", "EVAC_VEHICLE"]},
        {"name": "Harpreet Gill", "email": "admin.rescue.04@zerogrid.org", "tags": ["ADMIN", "RESCUE_MANAGEMENT", "SEARCH_RESCUE", "EVACUATION"]},
    ]
}


def construct_dispatch_message(
    incident_id: str,
    priority: str,
    target_dept: str,
    allocated_personnel: List[Dict[str, Any]],
    primary_tags: List[str],
    fallback_dept: Optional[str] = None,
    fallback_tags: Optional[List[str]] = None,
    brief: str = "",
    precautions: str = ""
) -> str:
    """
    Constructs the operational dispatch directive.
    MANDATORY REQUIREMENT: Explicitly includes requiredTags and assigned personnel.
    """
    personnel_lines = []
    for p in allocated_personnel:
        personnel_lines.append(f"  • {p.get('displayName') or p.get('name')} ({p.get('email')}) - Dept: {p.get('department')}")

    roster_str = "\n".join(personnel_lines) if personnel_lines else "  • Pending immediate mutual-aid assignment."
    primary_tag_str = ", ".join(primary_tags) if primary_tags else "GENERAL_TACTICAL"

    fallback_info = ""
    if fallback_dept and fallback_tags:
        fallback_tag_str = ", ".join(fallback_tags)
        fallback_info = f"\n🔄 FALLBACK SUPPORT ENGAGED: {fallback_dept}\n   Auxiliary Loadout: [{fallback_tag_str}]"

    msg = (
        f"🚨 [URGENT DISPATCH - ZERO GRID CRISIS COMMAND]\n"
        f"Incident: #{str(incident_id)[-8:]} | Priority: {priority.upper()}\n"
        f"Department: {target_dept}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"⚠️ MANDATORY GEAR & SKILL LOADOUT REQUIRED:\n"
        f"👉 [{primary_tag_str}]{fallback_info}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"Assigned Personnel & Command Teams:\n{roster_str}\n"
        f"Brief: {brief or 'Emergency mobilization active.'}\n"
        f"Precautions: {precautions or 'Adhere to standard incident commander protocols.'}\n"
        f"Status: ASSIGNED & EN_ROUTE. Confirm mobilization on operations console."
    )
    return msg


async def query_available_personnel_for_department(
    dept: str,
    required_tags: List[str],
    needed_count: int,
    db: Any = None,
    exclude_emails: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Queries MongoDB 'users' collection for available ADMIN personnel in the requested department.
    Filters by availabilityStatus == 'AVAILABLE' and ranks by tag match.
    """
    exclude_set = set(exclude_emails or [])
    candidates = []

    if db is not None:
        try:
            users_col = db.get_collection("users")
            query: Dict[str, Any] = {
                "department": dept,
                "role": "ADMIN",
                "availabilityStatus": {"$ne": "ASSIGNED"}
            }
            if exclude_set:
                query["email"] = {"$nin": list(exclude_set)}

            cursor = users_col.find(query).limit(needed_count * 3)
            for doc in cursor:
                doc_tags = doc.get("tags", [])
                matching_tags = [t for t in required_tags if t in doc_tags]
                candidates.append({
                    "userId": str(doc.get("_id")),
                    "displayName": doc.get("displayName"),
                    "name": doc.get("displayName"),
                    "email": doc.get("email"),
                    "department": dept,
                    "domain": doc.get("domain"),
                    "tags": doc_tags,
                    "matching_tags": matching_tags,
                    "tag_match_count": len(matching_tags)
                })
        except Exception as e:
            logger.warning(f"Error querying users from MongoDB: {e}")

    # Fallback to in-memory personnel if MongoDB is empty or offline
    if not candidates:
        pool = DEFAULT_DEPARTMENT_PERSONNEL.get(dept, [])
        for p in pool:
            if p["email"] not in exclude_set:
                matching_tags = [t for t in required_tags if t in p.get("tags", [])]
                candidates.append({
                    "userId": p["email"],
                    "displayName": p["name"],
                    "name": p["name"],
                    "email": p["email"],
                    "department": dept,
                    "domain": dept.replace("_MANAGEMENT", ""),
                    "tags": p.get("tags", []),
                    "matching_tags": matching_tags,
                    "tag_match_count": len(matching_tags)
                })

    # Sort primarily by tag matches (highest first)
    candidates.sort(key=lambda p: -p.get("tag_match_count", 0))
    return candidates[:needed_count]


async def execute_iterative_workforce_allocation(
    incident: Dict[str, Any],
    demand: Dict[str, Any],
    redis_manager_instance: Any = None,
    simulated_shortfall: bool = False
) -> Dict[str, Any]:
    """
    Agent 0 Core Logic:
    1. Receives workforce demand from specialized domain sub-agent (Flood, Heatwave, Grid, Rescue).
    2. Queries MongoDB 'users' collection to check availability of personnel created for that department.
    3. If availability is there -> Decides, locks, and assigns them to the ticket.
    4. If shortfall occurs -> Reports deficit to sub-agent and executes Iterative Fallback Loop to fallback department.
    5. Secures atomic Redis lock, marks availabilityStatus to ASSIGNED, and embeds requiredTags in message.
    """
    incident_id = str(incident.get("incident_id") or incident.get("_id") or "INC_01")
    priority = str(incident.get("priority") or "HIGH")

    target_dept = demand.get("targetDepartment", "FLOOD_MANAGEMENT")
    fallback_dept = demand.get("fallbackDepartment", "RESCUE_MANAGEMENT")
    required_tags = demand.get("requiredTags", ["WATER_RESCUE", "DEWATERING"])
    fallback_tags = demand.get("fallbackTags", ["SEARCH_RESCUE", "EVACUATION"])
    needed_count = int(demand.get("teamCount", 2))
    operational_brief = demand.get("operationalBrief", "")
    tactical_precautions = demand.get("tacticalPrecautions", "")

    db = getattr(spatial_memory, "_db", None)

    assigned_personnel: List[Dict[str, Any]] = []
    locked_emails: List[str] = []
    iteration_log: List[Dict[str, Any]] = []

    # =========================================================================
    # ROUND 1: Check Availability in Primary Team (Created for this Agent)
    # =========================================================================
    primary_candidates = await query_available_personnel_for_department(
        dept=target_dept,
        required_tags=required_tags,
        needed_count=needed_count,
        db=db
    )

    # Simulated shortfall test hook if requested
    if simulated_shortfall and len(primary_candidates) > 1:
        primary_candidates = primary_candidates[:1]

    for p in primary_candidates:
        email = p["email"]
        lock_ok = True
        if redis_manager_instance:
            try:
                res = redis_manager_instance.acquire_team_lock(email, incident_id, ttl_seconds=1800)
                lock_ok = bool(res.get("success", True))
            except Exception:
                lock_ok = True

        if lock_ok:
            assigned_personnel.append(p)
            locked_emails.append(email)

    shortfall = needed_count - len(assigned_personnel)

    iteration_log.append({
        "round": 1,
        "department": target_dept,
        "demanded": needed_count,
        "secured": len(assigned_personnel),
        "shortfall": max(0, shortfall),
        "status": "SATISFIED" if shortfall <= 0 else "SHORTFALL_DETECTED"
    })

    # =========================================================================
    # ROUND 2: The Iterative Fallback Loop (Handling Shortfalls)
    # =========================================================================
    fallback_engaged = False
    if shortfall > 0:
        fallback_engaged = True
        logger.warning(
            f"[-] Agent 0: Shortfall detected in {target_dept}: Needed {needed_count}, secured {len(assigned_personnel)}. "
            f"Deficit = {shortfall}. Triggering sub-agent fallback to {fallback_dept} team."
        )

        fallback_candidates = await query_available_personnel_for_department(
            dept=fallback_dept,
            required_tags=fallback_tags,
            needed_count=shortfall,
            db=db,
            exclude_emails=locked_emails
        )

        secured_in_fallback = 0
        for p in fallback_candidates:
            email = p["email"]
            lock_ok = True
            if redis_manager_instance:
                try:
                    res = redis_manager_instance.acquire_team_lock(email, incident_id, ttl_seconds=1800)
                    lock_ok = bool(res.get("success", True))
                except Exception:
                    lock_ok = True

            if lock_ok:
                assigned_personnel.append(p)
                locked_emails.append(email)
                secured_in_fallback += 1
                if len(assigned_personnel) >= needed_count:
                    break

        remaining_shortfall = needed_count - len(assigned_personnel)
        iteration_log.append({
            "round": 2,
            "department": fallback_dept,
            "demanded": shortfall,
            "secured": secured_in_fallback,
            "remaining_shortfall": remaining_shortfall,
            "status": "FALLBACK_SATISFIED" if remaining_shortfall <= 0 else "PARTIAL_PERSONNEL_COMMITTED"
        })

    # =========================================================================
    # Step 3: MongoDB Assignment to Ticket & Availability Update
    # =========================================================================
    now = datetime.now(timezone.utc)
    lead_personnel = assigned_personnel[0] if assigned_personnel else None

    if db is not None and locked_emails:
        try:
            users_col = db.get_collection("users")
            # Mark assigned personnel as ASSIGNED to this ticket
            users_col.update_many(
                {"email": {"$in": locked_emails}},
                {
                    "$set": {
                        "availabilityStatus": "ASSIGNED",
                        "activeTicketId": ObjectId(incident_id) if ObjectId.is_valid(incident_id) else incident_id,
                        "assignedAt": now
                    }
                }
            )

            # Update SosEvent with assignedAdmin lead and assignedTeamMembers
            sos_col = db.get_collection("sosevents")
            obj_id = ObjectId(incident_id) if ObjectId.is_valid(incident_id) else incident_id
            lead_user_id = lead_personnel.get("userId") if lead_personnel else None
            update_data: Dict[str, Any] = {
                "assignedSquad": lead_personnel.get("displayName") if lead_personnel else "PENDING_ASSIGNMENT",
                "status": "DISPATCHED" if assigned_personnel else "ALLOCATING",
                "assignedTeamMembers": [
                    {
                        "displayName": p.get("displayName"),
                        "email": p.get("email"),
                        "department": p.get("department")
                    } for p in assigned_personnel
                ]
            }
            if lead_user_id and ObjectId.is_valid(lead_user_id):
                update_data["assignedAdmin"] = ObjectId(lead_user_id)

            sos_col.update_one({"_id": obj_id}, {"$set": update_data})
        except Exception as e:
            logger.warning(f"Error persisting ticket assignments in MongoDB: {e}")

    # =========================================================================
    # Step 4: Construct Mandatory Dispatch Message with requiredTags
    # =========================================================================
    dispatch_message = construct_dispatch_message(
        incident_id=incident_id,
        priority=priority,
        target_dept=target_dept,
        allocated_personnel=assigned_personnel,
        primary_tags=required_tags,
        fallback_dept=fallback_dept if fallback_engaged else None,
        fallback_tags=fallback_tags if fallback_engaged else None,
        brief=operational_brief,
        precautions=tactical_precautions
    )

    success = len(assigned_personnel) > 0

    return {
        "success": success,
        "incident_id": incident_id,
        "target_department": target_dept,
        "fallback_department_used": fallback_dept if fallback_engaged else None,
        "demanded_count": needed_count,
        "allocated_count": len(assigned_personnel),
        "assigned_teams": [p.get("displayName") for p in assigned_personnel],
        "assigned_emails": locked_emails,
        "personnel_details": assigned_personnel,
        "lead_commander": lead_personnel.get("displayName") if lead_personnel else None,
        "required_tags": required_tags,
        "fallback_tags": fallback_tags if fallback_engaged else [],
        "dispatch_message": dispatch_message,
        "iteration_log": iteration_log,
        "status": "ASSIGNED_AND_DISPATCHED" if len(assigned_personnel) >= needed_count else (
            "PARTIAL_DISPATCH_FALLBACK_ENGAGED" if success else "PERSONNEL_DEPLETED_COMMANDER_ESCALATION"
        )
    }


# Backward-compatible alias for existing callers
async def match_and_allocate_workforce(
    incident_id: str,
    incident_coords: List[float],
    demand: Dict[str, Any],
    redis_manager_instance: Any = None
) -> Dict[str, Any]:
    incident_mock = {
        "incident_id": incident_id,
        "coordinates": incident_coords,
        "priority": demand.get("priority", "HIGH")
    }
    return await execute_iterative_workforce_allocation(
        incident=incident_mock,
        demand=demand,
        redis_manager_instance=redis_manager_instance
    )
