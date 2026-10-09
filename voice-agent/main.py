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
    record_node_incident_metric,
    TABLE_NAME,
    AWS_REGION
)
from agents import synthesize_agent_zero, run_autonomous_negotiation_pipeline
from redis_manager import redis_manager
from spatial_memory import spatial_memory

app = FastAPI(
    title="ZeroGrid Agentic & Voice Microservice",
    description="Autonomous Emergency Response, Grid Topology & Voice AI Sub-Agents",
    version="2.1.0"
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
    water_depth_cm: Optional[float] = 0.0
    affected_node_id: Optional[str] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None


class NegotiationPipelineRequest(BaseModel):
    incident_id: Optional[str] = "INC_01"
    incident_type: Optional[str] = "SUBSTATION_WATER_INGRESS"
    severity: Optional[str] = "CRITICAL"
    coordinates: Optional[List[float]] = None
    water_depth_cm: Optional[float] = 0.0
    affected_node_id: Optional[str] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None
    weather_context: Optional[Dict[str, Any]] = None
    simulated_available_teams: Optional[List[str]] = None
    inject_fault_at_step: Optional[str] = None


class TeamLockRequest(BaseModel):
    team_id: str
    incident_id: str
    ttl_seconds: Optional[int] = 1800


class TeamReleaseRequest(BaseModel):
    team_id: str


class UniversalMicroserviceRequest(BaseModel):
    action: Optional[str] = None  # "seed" | "orchestrate" | "chat" | "teams" | "lock_team" | "release_team"
    # Chat fields:
    transcript: Optional[str] = None
    # Orchestration fields:
    incident_id: Optional[str] = None
    incident_type: Optional[str] = "SUBSTATION_WATER_INGRESS"
    severity: Optional[str] = "CRITICAL"
    coordinates: Optional[List[float]] = None
    water_depth_cm: Optional[float] = 0.0
    affected_node_id: Optional[str] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None
    # Team locking fields:
    team_id: Optional[str] = None
    ttl_seconds: Optional[int] = 1800


# --- 1. Agent Zero Multi-Agent Autonomous Orchestration ---

@app.post("/api/autonomous-orchestrate")
@app.post("/voice-agent-microservice/api/autonomous-orchestrate")
@app.post("/default/voice-agent-microservice/api/autonomous-orchestrate")
async def autonomous_orchestrate(payload: AutonomousOrchestrateRequest):
    """
    Primary Agent Zero Entrypoint:
    1. Resolves coordinates to closest electrical grid node (e.g. SUB_VIRAR_EAST_01).
    2. Atomically records dynamic node failure metric in DynamoDB.
    3. Retrieves localized electrical adjacency subgraph (DynamoDB / In-Memory Simulator).
    4. Queries MongoDB spatial-temporal operational memory & Redis atomic unit locks.
    5. Concurrently triggers Triage, Grid Operations, and Dispatch sub-agents via asyncio.gather.
    6. Synthesizes master operational directive using Groq LPUs.
    """
    try:
        resolved_node = resolve_nearest_node(
            coordinates=payload.coordinates,
            incident_type=payload.incident_type,
            explicit_node_id=payload.affected_node_id
        )

        # Dynamic failure counter update
        record_node_incident_metric(resolved_node)

        # Topological graph retrieval
        subgraph = fetch_localized_subgraph(start_node_id=resolved_node, max_hops=2)

        # MongoDB spatial-temporal memory + Redis lock cross-referencing
        spatial_ctx = spatial_memory.synthesize_proximity_recommendations(
            target_coords=payload.coordinates,
            redis_manager_instance=redis_manager
        )

        orchestration_output = await synthesize_agent_zero(
            incident=payload.model_dump(),
            graph_context=subgraph,
            spatial_context=spatial_ctx
        )

        return orchestration_output
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent Zero orchestration failure: {str(e)}")


@app.post("/api/negotiation-pipeline")
@app.post("/voice-agent-microservice/api/negotiation-pipeline")
@app.post("/default/voice-agent-microservice/api/negotiation-pipeline")
async def execute_negotiation_pipeline(payload: NegotiationPipelineRequest):
    """
    Autonomous Multi-Agent Negotiation Pipeline Entrypoint:
    1. Evaluates alert via Confidence Calculator Agent.
    2. Runs Triage, Grid, and Dispatch sub-agents concurrently.
    3. Formulates tactical squad requirements.
    4. Executes recursive resource negotiation loop matching against Redis atomic units.
    5. Preserves state checkpoint at every stage with complete fault-tolerance.
    """
    try:
        resolved_node = resolve_nearest_node(
            coordinates=payload.coordinates,
            incident_type=payload.incident_type,
            explicit_node_id=payload.affected_node_id
        )

        record_node_incident_metric(resolved_node)
        subgraph = fetch_localized_subgraph(start_node_id=resolved_node, max_hops=2)

        spatial_ctx = spatial_memory.synthesize_proximity_recommendations(
            target_coords=payload.coordinates,
            redis_manager_instance=redis_manager
        )

        pipeline_result = await run_autonomous_negotiation_pipeline(
            incident=payload.model_dump(),
            graph_context=subgraph,
            spatial_context=spatial_ctx,
            weather_context=payload.weather_context,
            redis_manager_instance=redis_manager,
            simulated_available_teams=payload.simulated_available_teams,
            inject_fault_at_step=payload.inject_fault_at_step
        )

        return pipeline_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Autonomous pipeline execution failure: {str(e)}")


# --- 2. Team Concurrency & Atomic Lock Endpoints ---

@app.get("/api/teams/status")
@app.get("/voice-agent-microservice/api/teams/status")
@app.get("/default/voice-agent-microservice/api/teams/status")
def get_teams_status():
    """Returns atomic availability states for all tactical emergency units."""
    return {
        "teams": redis_manager.get_all_team_statuses(),
        "is_simulation": redis_manager.is_simulation
    }


@app.post("/api/teams/lock")
@app.post("/voice-agent-microservice/api/teams/lock")
@app.post("/default/voice-agent-microservice/api/teams/lock")
def lock_team(payload: TeamLockRequest):
    """Atomically locks a team to an incident in Redis (SET NX EX)."""
    return redis_manager.acquire_team_lock(
        team_id=payload.team_id,
        incident_id=payload.incident_id,
        ttl_seconds=payload.ttl_seconds or 1800
    )


@app.post("/api/teams/release")
@app.post("/voice-agent-microservice/api/teams/release")
@app.post("/default/voice-agent-microservice/api/teams/release")
def release_team(payload: TeamReleaseRequest):
    """Releases a team back to IDLE state upon incident resolution."""
    return redis_manager.release_team_lock(team_id=payload.team_id)



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

    # 2. Team Concurrency & Atomic Locks
    if payload.action in ["teams", "team_status", "get_teams"]:
        return get_teams_status()
    if payload.action in ["lock_team", "acquire_lock"] and payload.team_id:
        return lock_team(TeamLockRequest(
            team_id=payload.team_id,
            incident_id=payload.incident_id or "INC_UNSPECIFIED",
            ttl_seconds=payload.ttl_seconds or 1800
        ))
    if payload.action in ["release_team", "release_lock"] and payload.team_id:
        return release_team(TeamReleaseRequest(team_id=payload.team_id))

    # 3. Autonomous Orchestration
    if payload.action in ["flow", "negotiation-pipeline", "pipeline"]:
        pipe_req = NegotiationPipelineRequest(
            incident_id=payload.incident_id or "INC_01",
            incident_type=payload.incident_type or "SUBSTATION_WATER_INGRESS",
            severity=payload.severity or "CRITICAL",
            coordinates=payload.coordinates,
            water_depth_cm=payload.water_depth_cm if payload.water_depth_cm is not None else 0.0,
            affected_node_id=payload.affected_node_id,
            message=payload.message,
            telemetry=payload.telemetry
        )
        return await execute_negotiation_pipeline(pipe_req)

    if payload.action in ["orchestrate", "autonomous-orchestrate"] or payload.incident_id or payload.coordinates:
        orch_req = AutonomousOrchestrateRequest(
            incident_id=payload.incident_id or "INC_01",
            incident_type=payload.incident_type or "SUBSTATION_WATER_INGRESS",
            severity=payload.severity or "CRITICAL",
            coordinates=payload.coordinates,
            water_depth_cm=payload.water_depth_cm if payload.water_depth_cm is not None else 0.0,
            affected_node_id=payload.affected_node_id,
            message=payload.message,
            telemetry=payload.telemetry
        )
        return await autonomous_orchestrate(orch_req)

    # 4. Voice Chat
    if payload.transcript:
        return handle_voice_chat(VoiceTranscriptRequest(transcript=payload.transcript))

    # 5. Fallback status
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
