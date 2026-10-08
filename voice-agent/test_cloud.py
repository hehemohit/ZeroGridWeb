import urllib.request
import json
import time

endpoint = "https://j6uweuhbak.execute-api.ap-south-1.amazonaws.com/default/voice-agent-microservice"

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
    # Print safe ascii for terminal
    safe_reply = reply.encode("ascii", "replace").decode("ascii")
    print(f"AI Reply   : {safe_reply}\n")
