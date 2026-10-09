"""
ZeroGrid Agents Facade
Maintains 100% backwards compatibility by re-exporting all agents from the modular `agents/` package.
"""

from agents import (
    get_groq_async_client,
    extract_json_from_llm,
    FAST_MODEL,
    REASONING_MODEL,
    confidence_calculator_agent,
    run_triage_agent,
    run_grid_agent,
    run_dispatch_agent,
    reformulate_dispatch_requirements,
    run_master_synthesis,
    negotiate_resources_loop,
    run_autonomous_negotiation_pipeline,
    synthesize_agent_zero
)

MODEL_NAME = REASONING_MODEL

__all__ = [
    "get_groq_async_client",
    "extract_json_from_llm",
    "FAST_MODEL",
    "REASONING_MODEL",
    "MODEL_NAME",
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
