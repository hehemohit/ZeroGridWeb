"""
ZeroGrid Autonomous Agents Package
Exports modular sub-agents, Agent Zero synthesis, negotiation loops, and pipeline executor.
"""

from .base import (
    get_groq_async_client,
    extract_json_from_llm,
    FAST_MODEL,
    REASONING_MODEL
)
from .confidence_agent import confidence_calculator_agent
from .triage_agent import run_triage_agent
from .grid_agent import run_grid_agent
from .dispatch_agent import run_dispatch_agent, reformulate_dispatch_requirements
from .agent_zero import run_master_synthesis, negotiate_resources_loop
from .pipeline import run_autonomous_negotiation_pipeline

import asyncio
from typing import Dict, Any, Optional


async def synthesize_agent_zero(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any],
    spatial_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Backwards-compatible legacy signature for existing FastAPI routes & tests.
    Executes triage, grid, and dispatch concurrently, then synthesizes directive.
    """
    triage_res, grid_res, dispatch_res = await asyncio.gather(
        run_triage_agent(incident, graph_context),
        run_grid_agent(incident, graph_context),
        run_dispatch_agent(incident, graph_context, spatial_context)
    )

    synthesis_json = await run_master_synthesis(
        incident=incident,
        graph_context=graph_context,
        triage_res=triage_res,
        grid_res=grid_res,
        dispatch_res=dispatch_res,
        spatial_context=spatial_context
    )

    return {
        "incident_id": incident.get("incident_id", "INC_01"),
        "orchestrated_at": incident.get("timestamp"),
        "agent_zero_directive": synthesis_json,
        "sub_agents": {
            "triage": triage_res,
            "grid": grid_res,
            "dispatch": dispatch_res
        },
        "spatial_memory": spatial_context or {},
        "graph_telemetry": {
            "data_source": graph_context.get("data_source"),
            "root_node_id": graph_context.get("root_node_id"),
            "node_count": graph_context.get("node_count"),
            "edge_count": graph_context.get("edge_count"),
            "critical_facilities": graph_context.get("critical_facilities")
        }
    }


__all__ = [
    "get_groq_async_client",
    "extract_json_from_llm",
    "FAST_MODEL",
    "REASONING_MODEL",
    "confidence_calculator_agent",
    "run_triage_agent",
    "run_grid_agent",
    "run_dispatch_agent",
    "reformulate_dispatch_requirements",
    "run_master_synthesis",
    "negotiate_resources_loop",
    "run_autonomous_negotiation_pipeline",
    "synthesize_agent_zero"
]
