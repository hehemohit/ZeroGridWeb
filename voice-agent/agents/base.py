"""
ZeroGrid Agents Base Infrastructure
Provides async Groq client initialization, model routing, resilient JSON extraction & repair.
"""

import os
import json
import re
import logging
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from groq import AsyncGroq

load_dotenv()

logger = logging.getLogger("zerogrid.agents.base")

# Hybrid Model Routing:
# FAST_MODEL: For high-throughput, low-latency evaluation (confidence scoring, triage extraction, dispatch sizing)
# REASONING_MODEL: For complex multi-hop topological reasoning, resource trade-off negotiations, master synthesis
FAST_MODEL = os.environ.get("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
REASONING_MODEL = os.environ.get("GROQ_REASONING_MODEL", "qwen/qwen3.8-27b")


def get_groq_async_client() -> AsyncGroq:
    """Returns an authenticated AsyncGroq client."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not configured in environment variables.")
    return AsyncGroq(api_key=api_key)


def extract_json_from_llm(content: str) -> Dict[str, Any]:
    """
    Extracts and parses JSON object from LLM response text safely with resilient truncation repair.
    """
    if not content:
        return {}
    content = content.strip()

    # 1. Try direct parse
    try:
        return json.loads(content)
    except Exception:
        pass

    # 2. Try extracting inside ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # 3. Try finding substring from first { to last }
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(content[start:end + 1])
        except Exception:
            pass

    # 4. Truncation repair: If cut off mid-JSON, attempt to fix unclosed strings/braces
    if start != -1:
        truncated = content[start:]
        quotes_count = len(re.findall(r'(?<!\\)"', truncated))
        if quotes_count % 2 != 0:
            truncated += '"'
        open_curlies = truncated.count("{") - truncated.count("}")
        open_squares = truncated.count("[") - truncated.count("]")
        if open_squares > 0:
            truncated += "]" * open_squares
        if open_curlies > 0:
            truncated += "}" * open_curlies
        try:
            return json.loads(truncated)
        except Exception:
            pass

        # 5. Regex extraction of key-value pairs as final resilient fallback
        data = {}
        for k, v in re.findall(r'"([a-zA-Z0-9_]+)"\s*:\s*"([^"]*)"', truncated):
            data[k] = v
        for k, v in re.findall(r'"([a-zA-Z0-9_]+)"\s*:\s*(\d+(?:\.\d+)?)', truncated):
            data[k] = float(v) if "." in v else int(v)
        for k, v in re.findall(r'"([a-zA-Z0-9_]+)"\s*:\s*(true|false)', truncated, re.IGNORECASE):
            data[k] = v.lower() == "true"
        if data:
            return data

    return {"raw_response": content}
