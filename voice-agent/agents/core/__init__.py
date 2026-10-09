"""
ZeroGrid Agent Zero Core Modules
Package containing:
1. Deduplication & Priority Escalation Engine (dedup_engine.py)
2. Workforce Matching & Allocation Engine (workforce_engine.py)
"""

from .dedup_engine import process_deduplication_and_escalation, find_duplicate_incident
from .workforce_engine import match_and_allocate_workforce

__all__ = [
    "process_deduplication_and_escalation",
    "find_duplicate_incident",
    "match_and_allocate_workforce"
]
