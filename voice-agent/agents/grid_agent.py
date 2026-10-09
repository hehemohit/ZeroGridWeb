"""
ZeroGrid Electrical Safety & Grid Operations Sub-Agent
Analyzes topological grid graphs, circuit breaker switching, cascading risks, and critical hospital tie-lines.
Uses REASONING_MODEL for multi-hop graph stability analysis.
"""

import json
import logging
from typing import Dict, Any
from .base import get_groq_async_client, extract_json_from_llm, REASONING_MODEL

logger = logging.getLogger("zerogrid.agents.grid")


async def run_grid_agent(
    incident: Dict[str, Any],
    graph_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Sub-Agent 2: Power Grid Operations & Electrical Safety Engineer.
    Analyzes electrical subgraph impedance, overloading, circuit breaker isolation, and backup rerouting.
    """
    sys_prompt = (
        "You are the ZeroGrid Electrical Safety & Grid Operations Sub-Agent. "
        "Analyze grid line capacities, transformer water depths, and breaker switching sequences. "
        "Prioritize keeping hospitals powered while tripping submerged or overloaded feeders. "
        "Keep all descriptions concise (under 25 words). "
        "You MUST respond ONLY with a valid JSON object without surrounding commentary."
    )
    nodes = graph_context.get("nodes", {})
    edges = graph_context.get("edges", [])

    user_prompt = f"""
Topological Grid Subgraph Data:
- Affected Root Node: {graph_context.get('root_node_id')}
- Active Nodes: {json.dumps(nodes)}
- Connecting Lines (Edges): {json.dumps(edges)}
- Incident Water Ingress (cm): {incident.get('water_depth_cm', 35)}

Return a valid JSON object matching this schema:
{{
  "grid_stability_status": "STABLE|DEGRADED|CRITICAL_RISK|CASCADE_FAILURE",
  "immediate_breakers_to_trip": ["List of line IDs or node breakers to isolate immediately"],
  "safe_rerouting_path": "concise description of backup feeder routing (e.g. via Vasai tie-line to keep Hospital live)",
  "cascading_failure_risk_pct": 85,
  "cascade_risk": "High|Medium|Low",
  "hospital_power_isolation_plan": "concise explanation how ICU/critical facilities remain energized"
}}
"""
    try:
        client = get_groq_async_client()
        completion = await client.chat.completions.create(
            model=REASONING_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            max_tokens=750
        )
        parsed = extract_json_from_llm(completion.choices[0].message.content or "")
        parsed["agent"] = "GRID_OPERATIONS"
        parsed.setdefault("cascade_risk", "High" if parsed.get("cascading_failure_risk_pct", 80) >= 70 else "Medium")
        parsed["model_used"] = REASONING_MODEL
        return parsed
    except Exception as e:
        logger.error(f"Grid sub-agent fallback triggered: {e}")
        return {
            "agent": "GRID_OPERATIONS",
            "grid_stability_status": "CRITICAL_RISK",
            "immediate_breakers_to_trip": ["FEEDER_33KV_L1", "XFMR_WARD4_02_BREAKER"],
            "safe_rerouting_path": "Energize TIE_LINE_33KV_BACKUP from SUB_VASAI_WEST_03 to maintain Sanjeevani Hospital ICU busbar.",
            "cascading_failure_risk_pct": 82,
            "cascade_risk": "High",
            "hospital_power_isolation_plan": "Isolate local transformer Ward 4; switch Hospital Feeder 11KV_MED1 to Vasai tie-line.",
            "model_used": "deterministic_fallback"
        }
