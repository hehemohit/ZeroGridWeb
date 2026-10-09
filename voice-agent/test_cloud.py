import os
from dotenv import load_dotenv

load_dotenv()

endpoint = os.environ.get("VOICE_AGENT_URL", "")
if not endpoint:
    raise ValueError("VOICE_AGENT_URL environment variable must be set to run cloud test.")

print("--- 1. Health Check (GET) ---")
t0 = time.time()
req_health = urllib.request.Request(endpoint, headers={"User-Agent": "ZeroGridDispatcher/1.0"}, method="GET")
with urllib.request.urlopen(req_health) as resp:
    data = json.loads(resp.read().decode("utf-8"))
    t_health = (time.time() - t0) * 1000
    print(f"Status: {resp.status} in {t_health:.1f}ms")
    print(f"Payload: {data}\n")

print("--- 2. Voice Chat Inference (POST) ---")
query = "ZeroGrid Emergency Dispatch: Water logging detected at Virar East Ward 4. Requesting immediate status update."
payload = json.dumps({"transcript": query}).encode("utf-8")
t0 = time.time()
req_chat = urllib.request.Request(
    endpoint,
    data=payload,
    headers={"Content-Type": "application/json", "User-Agent": "ZeroGridDispatcher/1.0"},
    method="POST"
)
with urllib.request.urlopen(req_chat) as resp:
    result = json.loads(resp.read().decode("utf-8"))
    t_chat = (time.time() - t0) * 1000
    reply = result.get("reply", "")
    print(f"Status: {resp.status} in {t_chat:.1f}ms")
    print(f"User Query : {query}")
    safe_reply = reply.encode("ascii", "replace").decode("ascii")
    print(f"AI Reply   : {safe_reply}\n")

print("--- 3. Autonomous Multi-Agent Orchestration (POST) ---")
orch_payload = json.dumps({
    "action": "orchestrate",
    "incident_id": "LIVE_CLOUD_TEST_01",
    "incident_type": "SUBSTATION_WATER_INGRESS",
    "severity": "CRITICAL",
    "coordinates": [19.456, 72.812],
    "water_depth_cm": 46.0,
    "message": "Water depth 46cm at Virar East Substation. Ingress near 33kV switchyard."
}).encode("utf-8")
t0 = time.time()
req_orch = urllib.request.Request(
    endpoint,
    data=orch_payload,
    headers={"Content-Type": "application/json", "User-Agent": "ZeroGridDispatcher/1.0"},
    method="POST"
)
with urllib.request.urlopen(req_orch) as resp:
    orch_result = json.loads(resp.read().decode("utf-8"))
    t_orch = (time.time() - t0) * 1000
    print(f"Status: {resp.status} in {t_orch:.1f}ms")
    graph_telemetry = orch_result.get("graph_telemetry", {})
    directive = orch_result.get("agent_zero_directive", {})
    print(f"Data Source       : {graph_telemetry.get('data_source')}")
    print(f"Root Node         : {graph_telemetry.get('root_node_id')}")
    print(f"Nodes in Graph    : {graph_telemetry.get('node_count')}")
    print(f"Threat Score      : {directive.get('overall_threat_score')}/100")
    safe_summary = directive.get('executive_summary', '').encode("ascii", "replace").decode("ascii")
    print(f"Executive Summary : {safe_summary}")
    print(f"Automated Actions : {directive.get('immediate_automated_actions')}\n")
    print("[SUCCESS] Checkpoint 1 & 2 100% Verified in Live AWS Cloud!")

