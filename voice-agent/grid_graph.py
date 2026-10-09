"""
ZeroGrid Deterministic Grid Topology & DynamoDB Graph Engine
Implements single-table adjacency list traversal, nearest-node coordinate resolution,
and resilient in-memory simulation fallback for local development.
"""

import os
import math
import logging
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("zerogrid.grid_graph")
logging.basicConfig(level=logging.INFO)

TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "ZeroGrid-State")
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")

# Reference In-Memory Grid Topology (Mumbai - Virar / Palghar Corridor)
SIMULATION_NODES = {
    "SUB_VIRAR_EAST_01": {
        "PK": "NODE#SUB_VIRAR_EAST_01",
        "SK": "METADATA",
        "node_id": "SUB_VIRAR_EAST_01",
        "name": "Virar East Main Substation",
        "type": "SUBSTATION",
        "status": "CRITICAL",
        "voltage_kv": 33.0,
        "current_load_pct": 92.5,
        "water_depth_cm": 45,
        "coordinates": [19.456, 72.812],
        "critical_facilities_connected": ["HOSPITAL_SANJEEVANI", "PUMP_STATION_04"],
        "version": 1
    },
    "XFMR_WARD4_02": {
        "PK": "NODE#XFMR_WARD4_02",
        "SK": "METADATA",
        "node_id": "XFMR_WARD4_02",
        "name": "Ward 4 Step-Down Transformer",
        "type": "TRANSFORMER",
        "status": "OVERLOADED",
        "voltage_kv": 11.0,
        "current_load_pct": 84.0,
        "water_depth_cm": 15,
        "coordinates": [19.458, 72.815],
        "critical_facilities_connected": ["PUMP_STATION_04"],
        "version": 1
    },
    "NODE_HOSPITAL_09": {
        "PK": "NODE#NODE_HOSPITAL_09",
        "SK": "METADATA",
        "node_id": "NODE_HOSPITAL_09",
        "name": "Sanjeevani Hospital Critical Feeder Point",
        "type": "TRANSFORMER",
        "status": "ONLINE",
        "voltage_kv": 11.0,
        "current_load_pct": 65.0,
        "water_depth_cm": 5,
        "coordinates": [19.454, 72.818],
        "critical_facilities_connected": ["HOSPITAL_SANJEEVANI_ICU", "TRAUMA_CENTER"],
        "version": 1
    },
    "SUB_VASAI_WEST_03": {
        "PK": "NODE#SUB_VASAI_WEST_03",
        "SK": "METADATA",
        "node_id": "SUB_VASAI_WEST_03",
        "name": "Vasai West Auxiliary Backup Substation",
        "type": "SUBSTATION",
        "status": "ONLINE",
        "voltage_kv": 33.0,
        "current_load_pct": 42.0,
        "water_depth_cm": 0,
        "coordinates": [19.432, 72.801],
        "critical_facilities_connected": ["VASAI_CIVIL_HOSPITAL"],
        "version": 1
    }
}

SIMULATION_EDGES = [
    # Virar East <-> Ward 4 Transformer
    {
        "PK": "NODE#SUB_VIRAR_EAST_01",
        "SK": "EDGE#XFMR_WARD4_02",
        "target_node_id": "XFMR_WARD4_02",
        "line_id": "FEEDER_33KV_L1",
        "capacity_mva": 15.0,
        "current_load_mva": 13.8,
        "status": "OVERLOADED",
        "impedance_ohm": 0.42,
        "is_switchable": True
    },
    {
        "PK": "NODE#XFMR_WARD4_02",
        "SK": "EDGE#SUB_VIRAR_EAST_01",
        "target_node_id": "SUB_VIRAR_EAST_01",
        "line_id": "FEEDER_33KV_L1",
        "capacity_mva": 15.0,
        "current_load_mva": 13.8,
        "status": "OVERLOADED",
        "impedance_ohm": 0.42,
        "is_switchable": True
    },
    # Virar East <-> Sanjeevani Hospital Feeder
    {
        "PK": "NODE#SUB_VIRAR_EAST_01",
        "SK": "EDGE#NODE_HOSPITAL_09",
        "target_node_id": "NODE_HOSPITAL_09",
        "line_id": "FEEDER_11KV_MED1",
        "capacity_mva": 8.0,
        "current_load_mva": 5.2,
        "status": "STABLE",
        "impedance_ohm": 0.28,
        "is_switchable": True
    },
    {
        "PK": "NODE#NODE_HOSPITAL_09",
        "SK": "EDGE#SUB_VIRAR_EAST_01",
        "target_node_id": "SUB_VIRAR_EAST_01",
        "line_id": "FEEDER_11KV_MED1",
        "capacity_mva": 8.0,
        "current_load_mva": 5.2,
        "status": "STABLE",
        "impedance_ohm": 0.28,
        "is_switchable": True
    },
    # Vasai West Backup <-> Sanjeevani Hospital
    {
        "PK": "NODE#SUB_VASAI_WEST_03",
        "SK": "EDGE#NODE_HOSPITAL_09",
        "target_node_id": "NODE_HOSPITAL_09",
        "line_id": "TIE_LINE_33KV_BACKUP",
        "capacity_mva": 12.0,
        "current_load_mva": 0.0,
        "status": "STANDBY",
        "impedance_ohm": 0.55,
        "is_switchable": True
    },
    {
        "PK": "NODE#NODE_HOSPITAL_09",
        "SK": "EDGE#SUB_VASAI_WEST_03",
        "target_node_id": "SUB_VASAI_WEST_03",
        "line_id": "TIE_LINE_33KV_BACKUP",
        "capacity_mva": 12.0,
        "current_load_mva": 0.0,
        "status": "STANDBY",
        "impedance_ohm": 0.55,
        "is_switchable": True
    }
]


def get_dynamodb_resource():
    """Initializes boto3 DynamoDB resource with error tolerance."""
    try:
        import boto3
        return boto3.resource("dynamodb", region_name=AWS_REGION)
    except Exception as e:
        logger.warning(f"Could not initialize boto3 DynamoDB resource: {e}")
        return None


def resolve_nearest_node(
    coordinates: Optional[List[float]] = None,
    incident_type: Optional[str] = None,
    explicit_node_id: Optional[str] = None
) -> str:
    """
    Resolves the affected grid node ID based on explicit identifier or geographic coordinates.
    Handles [lat, lng] or [lng, lat] coordinate pairs.
    """
    if explicit_node_id and explicit_node_id in SIMULATION_NODES:
        return explicit_node_id

    if coordinates and len(coordinates) >= 2:
        c1, c2 = float(coordinates[0]), float(coordinates[1])
        # Detect order: Mumbai lat is ~19.4, lng is ~72.8
        if c1 < c2:
            lat, lng = c1, c2
        else:
            lat, lng = c2, c1

        closest_node = None
        min_dist = float("inf")
        for node_id, data in SIMULATION_NODES.items():
            n_coords = data.get("coordinates", [0, 0])
            n_lat, n_lng = n_coords[0], n_coords[1]
            # Euclidean distance squared
            dist = (lat - n_lat) ** 2 + (lng - n_lng) ** 2
            if dist < min_dist:
                min_dist = dist
                closest_node = node_id

        if closest_node:
            return closest_node

    return "SUB_VIRAR_EAST_01"


from decimal import Decimal


def convert_floats_to_decimals(obj: Any) -> Any:
    """Recursively converts python floats to Decimals for DynamoDB serialization."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimals(x) for x in obj]
    return obj


def convert_decimals_to_floats(obj: Any) -> Any:
    """Recursively converts DynamoDB Decimals back to float/int for JSON serialization."""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {k: convert_decimals_to_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals_to_floats(x) for x in obj]
    return obj


def fetch_localized_subgraph(start_node_id: str, max_hops: int = 2) -> Dict[str, Any]:
    """
    Traverses the electrical grid graph starting from `start_node_id` up to `max_hops`.
    Attempts to read from DynamoDB single-table. If credentials, permissions, or table
    are unavailable, gracefully falls back to the in-memory simulation engine.
    """
    dynamo = get_dynamodb_resource()
    if dynamo:
        try:
            from boto3.dynamodb.conditions import Key
            table = dynamo.Table(TABLE_NAME)

            visited = set()
            queue = [(start_node_id, 0)]
            nodes_data = {}
            edges_data = []

            while queue:
                curr_node_id, hop = queue.pop(0)
                if curr_node_id in visited or hop > max_hops:
                    continue
                visited.add(curr_node_id)

                # Query PK = NODE#<curr_node_id>
                response = table.query(
                    KeyConditionExpression=Key("PK").eq(f"NODE#{curr_node_id}")
                )
                items = response.get("Items", [])

                if not items and curr_node_id == start_node_id:
                    # If root node not found in table, trigger fallback
                    raise ValueError(f"Root node {start_node_id} not found in DynamoDB table {TABLE_NAME}")

                for raw_item in items:
                    item = convert_decimals_to_floats(raw_item)
                    sk = item.get("SK", "")
                    if sk == "METADATA":
                        nodes_data[curr_node_id] = item
                    elif sk.startswith("EDGE#"):
                        edges_data.append(item)
                        target = item.get("target_node_id")
                        if target and target not in visited and (hop + 1) <= max_hops:
                            queue.append((target, hop + 1))

            if nodes_data:
                critical_facilities = []
                for n in nodes_data.values():
                    critical_facilities.extend(n.get("critical_facilities_connected", []))

                return {
                    "data_source": "DYNAMODB_CLOUD",
                    "root_node_id": start_node_id,
                    "nodes": nodes_data,
                    "edges": edges_data,
                    "node_count": len(nodes_data),
                    "edge_count": len(edges_data),
                    "critical_facilities": list(set(critical_facilities)),
                    "table_name": TABLE_NAME,
                    "region": AWS_REGION
                }

        except Exception as e:
            logger.warning(
                f"[WARN] DynamoDB query failed ({type(e).__name__}: {e}). "
                "Switching seamlessly to localized Mumbai/Virar in-memory graph simulator."
            )

    # In-memory graph fallback traversal
    visited = set()
    queue = [(start_node_id, 0)]
    nodes_data = {}
    edges_data = []

    while queue:
        curr_node_id, hop = queue.pop(0)
        if curr_node_id in visited or hop > max_hops:
            continue
        visited.add(curr_node_id)

        if curr_node_id in SIMULATION_NODES:
            nodes_data[curr_node_id] = SIMULATION_NODES[curr_node_id]

        for edge in SIMULATION_EDGES:
            pk = edge.get("PK", "")
            if pk == f"NODE#{curr_node_id}":
                edges_data.append(edge)
                target = edge.get("target_node_id")
                if target and target not in visited and (hop + 1) <= max_hops:
                    queue.append((target, hop + 1))

    critical_facilities = []
    for n in nodes_data.values():
        critical_facilities.extend(n.get("critical_facilities_connected", []))

    return {
        "data_source": "IN_MEMORY_SIMULATION",
        "root_node_id": start_node_id,
        "nodes": nodes_data,
        "edges": edges_data,
        "node_count": len(nodes_data),
        "edge_count": len(edges_data),
        "critical_facilities": list(set(critical_facilities)),
        "table_name": TABLE_NAME,
        "region": AWS_REGION,
        "simulation_note": "Executing with deterministic high-fidelity Mumbai/Virar topological reference model."
    }


def seed_default_grid_topology() -> Dict[str, Any]:
    """
    Seeds the reference grid topology into DynamoDB table 'ZeroGrid-State'.
    Returns structured success or error feedback.
    """
    dynamo = get_dynamodb_resource()
    if not dynamo:
        return {
            "status": "FAILED",
            "message": "DynamoDB resource could not be initialized. Check boto3 installation and AWS environment."
        }

    try:
        table = dynamo.Table(TABLE_NAME)
        seeded_items = 0

        # Seed nodes
        for node in SIMULATION_NODES.values():
            item = convert_floats_to_decimals(node)
            table.put_item(Item=item)
            seeded_items += 1

        # Seed edges
        for edge in SIMULATION_EDGES:
            item = convert_floats_to_decimals(edge)
            table.put_item(Item=item)
            seeded_items += 1

        return {
            "status": "SUCCESS",
            "message": f"Successfully seeded {seeded_items} items (nodes + edges) into DynamoDB table '{TABLE_NAME}'.",
            "seeded_count": seeded_items,
            "table_name": TABLE_NAME,
            "region": AWS_REGION
        }
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"Failed to seed DynamoDB table: {error_msg}")
        return {
            "status": "ERROR",
            "message": error_msg,
            "table_name": TABLE_NAME,
            "region": AWS_REGION
        }


def record_node_incident_metric(node_id: str) -> Dict[str, Any]:
    """
    Atomically increments historical_incident_count in DynamoDB for the affected grid node,
    tracking repeat stress and equipment fatigue zones.
    """
    from datetime import datetime, timezone

    pk = f"NODE#{node_id}" if not node_id.startswith("NODE#") else node_id
    clean_id = node_id.replace("NODE#", "")
    ts = datetime.now(timezone.utc).isoformat()

    dynamo = get_dynamodb_resource()
    if dynamo:
        try:
            table = dynamo.Table(TABLE_NAME)
            resp = table.update_item(
                Key={"PK": pk, "SK": "METADATA"},
                UpdateExpression="ADD historical_incident_count :inc SET last_incident_timestamp = :ts",
                ExpressionAttributeValues={
                    ":inc": 1,
                    ":ts": ts
                },
                ReturnValues="UPDATED_NEW"
            )
            updated_vals = convert_decimals_to_floats(resp.get("Attributes", {}))
            logger.info(f"📊 DynamoDB node {pk} incident count incremented: {updated_vals}")
            return {
                "success": True,
                "node_id": clean_id,
                "historical_incident_count": int(updated_vals.get("historical_incident_count", 1)),
                "last_incident_timestamp": ts,
                "source": "DYNAMODB_CLOUD"
            }
        except Exception as e:
            logger.warning(f"Could not update DynamoDB incident metric for {pk}: {e}")

    # Fallback simulation counter
    if clean_id in SIMULATION_NODES:
        cnt = SIMULATION_NODES[clean_id].get("historical_incident_count", 0) + 1
        SIMULATION_NODES[clean_id]["historical_incident_count"] = cnt
        SIMULATION_NODES[clean_id]["last_incident_timestamp"] = ts
        return {
            "success": True,
            "node_id": clean_id,
            "historical_incident_count": cnt,
            "last_incident_timestamp": ts,
            "source": "IN_MEMORY_SIMULATION"
        }

    return {
        "success": False,
        "node_id": clean_id,
        "error": "Node not found",
        "source": "UNKNOWN"
    }

