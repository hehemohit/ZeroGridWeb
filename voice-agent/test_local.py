"""
Local test script for Voice Agent microservice.
Tests:
1. Health check endpoint
2. Mangum Lambda event handler simulation
3. Voice chat endpoint (if GROQ_API_KEY is configured)
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Verify imports
from main import app, handler, health_check, handle_voice_chat, VoiceTranscriptRequest

def test_health():
    print("[*] Testing GET /api/health directly...")
    result = health_check()
    print(f"Response: {result}")
    assert result.get("status") == "active", "Health check failed"
    print("[PASS] Health check passed!\n")

def test_mangum_event():
    print("[*] Testing AWS Lambda / Mangum event emulation ...")
    # Emulate an AWS API Gateway V2 HTTP event for /api/health
    mock_event = {
        "version": "2.0",
        "routeKey": "GET /api/health",
        "rawPath": "/api/health",
        "rawQueryString": "",
        "headers": {
            "accept": "application/json",
            "host": "localhost"
        },
        "requestContext": {
            "http": {
                "method": "GET",
                "path": "/api/health",
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "local-test"
            }
        },
        "isBase64Encoded": False
    }
    mock_context = type("Context", (), {"aws_request_id": "test-req-123", "get_remaining_time_in_millis": lambda: 30000})()
    result = handler(mock_event, mock_context)
    print(f"Lambda Handler Status Code: {result.get('statusCode')}")
    print(f"Lambda Handler Body: {result.get('body')}")
    assert result.get("statusCode") == 200, "Mangum handler test failed"
    print("[PASS] Mangum event emulation passed!\n")

def test_voice_chat():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key or api_key.startswith("gsk_your_groq"):
        print("[!] GROQ_API_KEY is not set or using placeholder. Skipping live LLM call test.")
        print("    Add your actual key to voice-agent/.env to test live inference.\n")
        return

    print("[*] Testing /api/voice-chat with live Groq inference ...")
    req = VoiceTranscriptRequest(transcript="Hello, this is a test from the emergency dispatch unit.")
    response = handle_voice_chat(req)
    print(f"Response: {response}")
    if response and "reply" in response:
        print("[PASS] Live Groq voice-chat inference passed!\n")
    else:
        print(f"[X] Inference call failed.\n")

if __name__ == "__main__":
    print("=== Running Voice Agent Local Verification ===\n")
    test_health()
    test_mangum_event()
    test_voice_chat()
    print("=== All local checks complete! ===")
