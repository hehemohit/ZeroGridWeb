import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from mangum import Mangum
from dotenv import load_dotenv

# Load environment variables from .env file for local development
load_dotenv()

app = FastAPI(title="Voice Agent Microservice")

# Enable CORS for the frontend application to communicate cleanly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your specific frontend domain in production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
MODEL_NAME = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

# Initialize OpenAI-compatible client targeted at Groq's API
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

@app.post("/api/voice-chat")
@app.post("/voice-agent-microservice/api/voice-chat")
@app.post("/default/voice-agent-microservice/api/voice-chat")
@app.post("/voice-agent-microservice")
@app.post("/default/voice-agent-microservice")
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
        "model": MODEL_NAME,
        "api_key_configured": has_key
    }

# Mangum handler wraps FastAPI so AWS Lambda can process incoming HTTP events seamlessly
handler = Mangum(app)
