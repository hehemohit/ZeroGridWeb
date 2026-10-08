import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from mangum import Mangum
from dotenv import load_dotenv

# Load environment variables from .env file for local development
load_dotenv()

from grid_graph import (
    resolve_nearest_node,
    fetch_localized_subgraph,
    seed_default_grid_topology,
    TABLE_NAME,
    AWS_REGION
)
from agents import synthesize_agent_zero

app = FastAPI(
    title="ZeroGrid Agentic & Voice Microservice",
    description="Autonomous Emergency Response, Grid Topology & Voice AI Sub-Agents",
    version="2.0.0"
)

# Enable CORS for Next.js, Express backend, and mobile applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
MODEL_NAME = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")


def get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured in environment variables."
        )
    return OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )


class VoiceTranscriptRequest(BaseModel):
    transcript: str


class AutonomousOrchestrateRequest(BaseModel):
    incident_id: Optional[str] = "INC_01"
    incident_type: Optional[str] = "SUBSTATION_WATER_INGRESS"
    severity: Optional[str] = "CRITICAL"
    coordinates: Optional[List[float]] = None
    water_depth_cm: Optional[float] = 45.0
    affected_node_id: Optional[str] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None


class UniversalMicroserviceRequest(BaseModel):
    action: Optional[str] = None  # "seed" | "orchestrate" | "chat"
    # Chat fields:
    transcript: Optional[str] = None
    # Orchestration fields:
    incident_id: Optional[str] = None
    incident_type: Optional[str] = "SUBSTATION_WATER_INGRESS"
    severity: Optional[str] = "CRITICAL"
    coordinates: Optional[List[float]] = None
    water_depth_cm: Optional[float] = 45.0
    affected_node_id: Optional[str] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None


# --- 1. Agent Zero Multi-Agent Autonomous Orchestration ---

@app.post("/api/autonomous-orchestrate")
@app.post("/voice-agent-microservice/api/autonomous-orchestrate")
@app.post("/default/voice-agent-microservice/api/autonomous-orchestrate")
async def autonomous_orchestrate(payload: AutonomousOrchestrateRequest):
    """
    Primary Agent Zero Entrypoint:
    1. Resolves coordinates to closest electrical grid node (e.g. SUB_VIRAR_EAST_01).
    2. Retrieves localized electrical adjacency subgraph (DynamoDB / In-Memory Simulator).
    3. Concurrently triggers Triage, Grid Operations, and Dispatch sub-agents via asyncio.gather.
    4. Synthesizes master operational directive using Groq LPUs.
    """
    try:
        resolved_node = resolve_nearest_node(
            coordinates=payload.coordinates,
            incident_type=payload.incident_type,
            explicit_node_id=payload.affected_node_id
        )

        subgraph = fetch_localized_subgraph(start_node_id=resolved_node, max_hops=2)

        orchestration_output = await synthesize_agent_zero(
            incident=payload.model_dump(),
            graph_context=subgraph
        )

        return orchestration_output
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Zero orchestration failure: {str(e)}")


# --- 2. Deterministic Grid Topology & Seeding Endpoints ---

@app.get("/api/grid-topology/{node_id}")
@app.get("/voice-agent-microservice/api/grid-topology/{node_id}")
@app.get("/default/voice-agent-microservice/api/grid-topology/{node_id}")
def get_grid_topology(node_id: str, max_hops: int = 2):
    """Fetches localized grid subgraph starting from node_id."""
    try:
        return fetch_localized_subgraph(start_node_id=node_id, max_hops=max_hops)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/seed-topology")
@app.post("/voice-agent-microservice/api/seed-topology")
@app.post("/default/voice-agent-microservice/api/seed-topology")
def seed_topology_endpoint():
    """Seeds reference grid topology into DynamoDB table 'ZeroGrid-State'."""
    result = seed_default_grid_topology()
    return result


# --- 3. Backward Compatible Voice Chat ---

@app.post("/api/voice-chat")
@app.post("/voice-agent-microservice/api/voice-chat")
@app.post("/default/voice-agent-microservice/api/voice-chat")
def handle_voice_chat(payload: VoiceTranscriptRequest):
    if not payload.transcript or not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript text cannot be empty.")
    try:
        client = get_groq_client()
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise, responsive AI voice assistant on a live session. Keep your answers short, spoken-word friendly, and natural."
                },
                {"role": "user", "content": payload.transcript}
            ],
            temperature=0.7,
            max_tokens=200
        )
        ai_reply = completion.choices[0].message.content
        return {"reply": ai_reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 4. Universal Gateway Dispatcher ---
# Dispatches any request arriving directly at the root API Gateway route

@app.post("/voice-agent-microservice")
@app.post("/default/voice-agent-microservice")
async def handle_universal_gateway(payload: UniversalMicroserviceRequest):
    """
    Universal dispatcher for API Gateway endpoints that lack greedy /{proxy+} routing.
    Dispatches between seeding, orchestration, and voice chat seamlessly.
    """
    # 1. Seeding
    if payload.action in ["seed", "seed-topology", "seed_topology"]:
        return seed_default_grid_topology()

    # 2. Autonomous Orchestration
    if payload.action in ["orchestrate", "autonomous-orchestrate"] or payload.incident_id or payload.coordinates:
        orch_req = AutonomousOrchestrateRequest(
            incident_id=payload.incident_id or "INC_01",
            incident_type=payload.incident_type or "SUBSTATION_WATER_INGRESS",
            severity=payload.severity or "CRITICAL",
            coordinates=payload.coordinates,
            water_depth_cm=payload.water_depth_cm or 45.0,
            affected_node_id=payload.affected_node_id,
            message=payload.message,
            telemetry=payload.telemetry
        )
        return await autonomous_orchestrate(orch_req)

    # 3. Voice Chat
    if payload.transcript:
        return handle_voice_chat(VoiceTranscriptRequest(transcript=payload.transcript))

    # 4. Fallback status
    return health_check()


# --- 5. Health & Diagnostic Check ---

@app.get("/api/health")
@app.get("/voice-agent-microservice/api/health")
@app.get("/default/voice-agent-microservice/api/health")
@app.get("/voice-agent-microservice")
@app.get("/default/voice-agent-microservice")
@app.get("/")
def health_check():
    has_key = bool(os.environ.get("GROQ_API_KEY"))
    return {
        "status": "active",
        "service": "ZeroGrid Agentic & Voice Microservice",
        "version": "2.0.0",
        "model": MODEL_NAME,
        "api_key_configured": has_key,
        "dynamodb_table": TABLE_NAME,
        "aws_region": AWS_REGION
    }


# Mangum handler wraps FastAPI so AWS Lambda can process incoming HTTP events seamlessly
handler = Mangum(app)
