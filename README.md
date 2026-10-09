# ZeroGrid — Autonomous Emergency Response & Off-Grid Mesh Platform

> **Zero-Infrastructure Disaster Coordination & Circular Multi-Agent Crisis Engine**  
> Bridges peer-to-peer off-grid alerting across Android devices (BLE / Wi-Fi Direct) with an autonomous 4-phase multi-agent crisis command center (Agent 0 + 160 Admin Workforce) and real-time Web/Mobile operations.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Autonomous 4-Phase Circular Multi-Agent Pipeline](#3-autonomous-4-phase-circular-multi-agent-pipeline)
4. [160-Admin Workforce & Department Mapping](#4-160-admin-workforce--department-mapping)
5. [Off-Grid Mesh Protocol (Android Client)](#5-off-grid-mesh-protocol-android-client)
6. [Cloud Backend & Real-Time API (`backend/`)](#6-cloud-backend--real-time-api-backend)
7. [Command Center & Web Dashboard (`frontend/`)](#7-command-center--web-dashboard-frontend)
8. [Voice-AI Dispatch Assistant (`voice-agent/`)](#8-voice-ai-dispatch-assistant-voice-agent)
9. [Android Native Client (`gridzero/`)](#9-android-native-client-gridzero)
10. [Setup & Quickstart Guide](#10-setup--quickstart-guide)
11. [Security & Resilience Model](#11-security--resilience-model)

---

## 1. System Architecture Overview

ZeroGrid solves communications collapse during severe catastrophic events (floods, power grid cascade failure, heatwaves, structural collapse). It operates across a two-tier hybrid topology:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OFF-GRID DISASTER ZONE                          │
│                                                                        │
│   [Citizen A (Sender)] ──(BLE GATT / WiFi-P2P)──► [Citizen B (Relay)]   │
│            │                                              │            │
│       (No Cellular)                                 (BLE / WiFi-P2P)   │
│            │                                              ▼            │
│            └────────────────────────────────────► [Citizen C (Gateway)] │
└───────────────────────────────────────────────────────────┬────────────┘
                                                            │ Opportunistic Uplink
                                                            ▼ (Cellular / Starlink)
                                           ┌─────────────────────────────┐
                                           │   gridZeroExpress BACKEND   │
                                           │ Node.js 20 / Express / Mongo│
                                           └──────┬───────────────┬──────┘
                                                  │               │
                               (WebSocket / REST) │               │ (Socket.IO / REST)
                                                  ▼               ▼
                                       ┌────────────────┐   ┌────────────┐
                                       │ Agent Zero Web │   │ Mobile     │
                                       │ Command Center │   │ Tactical   │
                                       │ (Next.js 16)   │   │ Admin      │
                                       └────────────────┘   └────────────┘
```

1. **Sub-Tier (Offline Mesh)**: Android nodes form ad-hoc peer networks via BLE and Wi-Fi Direct. SOS beacons propagate hop-by-hop without routers or cell towers.
2. **Ingress Gateway (Opportunistic Uplink)**: Any peer discovering intermittent cellular/satellite backhaul automatically ingests queued mesh beacons into MongoDB.
3. **Core Multi-Agent Orchestration Tier**: Incoming distress signals are scored, verified, routed, and matched with emergency personnel by Agent 0.
4. **Command & Operations Tier**: Responders monitor the live map, 160 admin department statuses, and automated circuit breaker isolation switches.

---

## 2. Monorepo Structure

```
AndroidStudioProjects/
├── gridZeroExpress/                        # Unified Cloud Backend & Web Command Console
│   ├── backend/                            # Express 5 + MongoDB + Socket.IO Server
│   │   ├── src/controllers/                # Flow, SOS, Admin, Predictive Hydrodynamics
│   │   ├── src/models/                     # User (160 Admins), SosEvent, ParentChildLink
│   │   ├── src/routes/                     # REST API endpoints & Auth guards
│   │   └── src/utils/                      # Tide/Weather services, Grid node resolver
│   │
│   ├── frontend/                           # Next.js 16 (React 19, Tailwind v4) Web Console
│   │   ├── src/app/(app)/dashboard/        # Agent Zero Command Center (4-Phase Inspector)
│   │   ├── src/app/(app)/flow/             # Autonomous Multi-Agent Interactive Test Bench
│   │   ├── src/app/(app)/admin/            # Live Incident Map & Dispatch Drawer
│   │   ├── src/components/voice/           # Tactical Voice-AI Assistant (Whisper + Groq)
│   │   └── src/lib/voiceAgent.ts           # Autonomous Orchestration & Fallback Engine
│   │
│   ├── voice-agent/                        # Serverless Voice-AI Microservice (FastAPI + Groq)
│   │   ├── main.py                         # Groq LLM (openai/gpt-oss-120b) + Mangum Adapter
│   │   └── build_lambda_zip.py             # Cross-platform Linux wheel bundler for AWS Lambda
│   │
│   └── postman/                            # Postman API test collection
│
└── gridzero/                               # Native Android Client (Kotlin / Jetpack Compose)
    └── app/src/main/java/com/example/zerogrid/
        ├── mesh/                           # BLE/Wi-Fi Direct engines, routing & LRU cache
        ├── emergency/                      # Unified SOS Dispatcher & WorkManager sync
        ├── admin/                          # Tactical radar canvas, live maps, responder claims
        └── service/                        # Foreground BLE Mesh Service & FCM Push receiver
```

---

## 3. Autonomous 4-Phase Circular Multi-Agent Pipeline

To prevent emergency dispatch hallucination, operator overload, and false alarm panic, all incoming distress alerts execute through an automated, circular multi-agent pipeline:

$$\text{Confidence Calculator } (\ge 65\%) \longrightarrow \text{Agent 0 Gatekeeper} \longrightarrow \text{4 Crisis Sub-Agents} \longrightarrow \text{Agent 0 Workforce Allocation}$$

```
  [ INCOMING CITIZEN SOS / SENSOR TELEMETRY ]
                     │
                     ▼
  ┌─────────────────────────────────────────────────────────┐
  │ PHASE 1: CONFIDENCE CALCULATOR AGENT                    │
  │ • Audio Spectrum (25%)   • Visual Spectrum (35%)        │
  │ • Submersible Depth (25%) • Coastal Tide Surge (15%)    │
  │ Gate: Score >= 65% (Filters clear-sky sensor artifacts) │
  └──────────────────────────┬──────────────────────────────┘
                             │ Passed (>= 65%)
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │ PHASE 2: AGENT 0 GATEKEEPER & INTAKE                    │
  │ • Spatial Deduplication on Grid Node Adjacency List     │
  │ • Priority Scoring & Threat Tier Indexing               │
  │ • Autonomous Domain Routing (Flood, Heat, Grid, Rescue) │
  └──────────────────────────┬──────────────────────────────┘
                             │ Routed Domain
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │ PHASE 3: SPECIALIZED CRISIS SUB-AGENTS                  │
  │ 1. Flood Management Sub-Agent                           │
  │ 2. Heatwave Management Sub-Agent                        │
  │ 3. Power Grid Operations Sub-Agent                      │
  │ 4. Rescue Management Sub-Agent                          │
  │ • Formulates Squad Demand Quota & Required Tactical Tags│
  │ • Declares Fallback Department & Ground Hazards         │
  └──────────────────────────┬──────────────────────────────┘
                             │ Submits Demand Quota
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │ PHASE 4: AGENT 0 WORKFORCE ALLOCATION & ITERATIVE LOOP  │
  │ • Queries 160 MongoDB Administrative Personnel Roster   │
  │ • Round 1: Matches Primary Department by Tactical Tags  │
  │ • Shortfall Detected? -> Iterative Fallback Negotiation │
  │ • Round 2: Engages Fallback Department Squads           │
  │ • Locks units, updates incident, and emits Socket.io    │
  └─────────────────────────────────────────────────────────┘
```

### Safety Gateways & Critical Infrastructure Protocols
* **Hospital Lifeline ICU Protection**: Guarantees Sanjeevani Hospital ICU busbars switch to standby 33kV tie lines with 0ms interruption before primary substation isolation.
* **Human-in-the-Loop (HITL) Circuit Breakers**: High-voltage electrical trips require Incident Commander digital sign-off via modal validation before executing switchyard lock-out/tag-out.

---

## 4. 160-Admin Workforce & Department Mapping

The system manages a pre-seeded roster of **160 Admin accounts** in MongoDB (`User` collection with `role: "ADMIN"`), partitioned symmetrically into four crisis management departments (40 personnel each):

| Department Tag | Headcount | Primary Tactical Tags / Equipment | Iterative Fallback Department |
|---|---|---|---|
| `FLOOD_MANAGEMENT` | 40 Admins | `DEWATERING`, `DEEP_WATER_RESQ`, `ZODIAC_BOAT` | `RESCUE_MANAGEMENT` |
| `HEATWAVE_MANAGEMENT` | 40 Admins | `MEDICAL_TRIAGE`, `HYDRATION_SQUAD`, `COOLING_STATION` | `RESCUE_MANAGEMENT` |
| `POWER_GRID_MANAGEMENT` | 40 Admins | `HV_LINEMAN`, `SUBSTATION_CREW`, `AIR_GAP_ISOLATION` | `RESCUE_MANAGEMENT` |
| `RESCUE_MANAGEMENT` | 40 Admins | `HEAVY_RESCUE`, `COLLAPSE_SEARCH`, `TRAUMA_PARAMEDIC` | `FLOOD_MANAGEMENT` |

* **Live Workforce Telemetry**: Exposed via `GET /api/admin/workforce/stats`, providing real-time idle vs assigned counts per department.

---

## 5. Off-Grid Mesh Protocol (Android Client)

### 5.1 Packet Envelope Specification
Every over-the-air packet utilizes a compact, deterministic JSON envelope:

```json
{
  "packetId": "d9b2e048-c89b-4b13-a7cf-e48f1082aa91",
  "senderId": "node-8f2a1b",
  "recipientId": "*",
  "ttl": 5,
  "hopCount": 0,
  "type": "SOS_BEACON",
  "payload": "{\"category\":\"MEDICAL\",\"message\":\"Injured leg\",\"lat\":19.0760,\"lng\":72.8777,\"ts\":1727337600000}",
  "timestamp": 1727337600000,
  "signature": ""
}
```

* **TTL & Loop Prevention**: Default `ttl = 5`. Decremented at each hop. Packets with `ttl <= 1` are dropped.
* **LRU Deduplication**: `DeduplicationCache.kt` maintains a synchronized 500-item LRU cache of `packetId` hashes to eliminate broadcast storms.
* **Transport Abstraction**:
  * **`BleMeshDriver`**: BLE Peripheral advertising & Central GATT scanning on Custom UUID `0000ZG01-0000-1000-8000-00805F9B34FB`. Handles MTU negotiation (up to 512 bytes) and segment reassembly.
  * **`WifiDirectMeshDriver`**: Android `WifiP2pManager` TCP socket streaming for high-throughput mesh bursts.
* **WorkManager Offline Queue**: When offline, `UnifiedSosDispatcher` enqueues `SosUploadWorker` with exponential backoff, ensuring zero alert loss upon reconnection.

---

## 6. Cloud Backend & Real-Time API (`backend/`)

Built on **Node.js 20 LTS**, **Express 5**, **Mongoose 9**, and **Socket.IO 4**.

### Core REST Endpoints

| Category | Endpoint | Method | Description |
|---|---|---|---|
| **Auth** | `/api/auth/register` | `POST` | Register citizen/admin credentials. |
| | `/api/auth/login` | `POST` | Authenticate and issue 7-day signed JWT. |
| **Emergency** | `/api/sos` | `POST` | Ingest new SOS beacon (rate-limited: 2/30s). |
| | `/api/sos/active` | `GET` | List active emergency alerts. |
| | `/api/sos/:id/resolve` | `PUT` | **Admin Only.** Mark incident as resolved. |
| **Workforce** | `/api/admin/workforce/stats` | `GET` | Live availability of the 160 Admin departments. |
| **Flow Bench** | `/api/flow/run` | `POST` | Execute full 4-phase circular multi-agent pipeline. |
| | `/api/flow/presets` | `GET` | Retrieve emergency scenario benchmarks. |
| **Predictive** | `/api/admin/predictive/tide-summary` | `GET` | Real-time coastal tides and precipitation. |
| | `/api/admin/predictive/drainage-timeline` | `POST` | Hydrodynamic recession forecasting. |

### Real-Time WebSocket Channel (`/sos` namespace)
* `sos:new`: Emitted immediately upon new incident registration.
* `sos:agent_zero_orchestrated`: Emitted when Agent 0 completes autonomous decisions.
* `sos:workforce:dispatched`: Emitted when administrative personnel are locked.
* `flow:step:update`: Streamed step-by-step progress during pipeline execution.
* `sos:updated`: Broadcast upon status transitions (acknowledged, resolved, notes added).

---

## 7. Command Center & Web Dashboard (`frontend/`)

Built on **Next.js 16** (App Router), **React 19**, and **Tailwind CSS v4**.

* **Agent Zero Command Center (`/dashboard`)**:
  * Real-time executive KPIs (Veracity pass rate, active distress signals, 160 Admin mobilization).
  * 160-Admin Department Readiness Matrix (live idle/assigned counters & tactical equipment tags).
  * System-wide Active Distress Command Feed (contextualizing veracity, domain, required tags, and assigned personnel for every live ticket).
  * 4-Phase Circular Inspector with interactive switchboard and HITL breaker protection.
* **Autonomous Multi-Agent Flow Bench (`/flow`)**:
  * Interactive flowchart and visual step runner for simulating scenarios, evaluating shortfall fallback loops, and injecting synthetic faults.
* **Master Incident Operations (`/admin`)**:
  * Full-screen Google Maps incident overlay with category-coded pins, GPS accuracy radii, and side-drawer triage controls.

---

## 8. Voice-AI Dispatch Assistant (`voice-agent/`)

Hands-free tactical dispatch assistant utilizing serverless inference on **AWS Lambda** (Python 3.11 + FastAPI + Mangum):

* **Speech-to-Text**: Groq `whisper-large-v3-turbo` with prompt conditioning (`ZeroGrid emergency disaster dispatch rescue team audio transcript`) and server-side silence anti-hallucination guards.
* **Reasoning LLM**: Groq `openai/gpt-oss-120b` generating structured incident triage, priority overrides, and tactical field notes.
* **Zero-CORS Route Proxy**: Client routes audio blobs through Next.js server route (`/api/voice-chat`) to keep cloud credentials secure.
* **Hardware Mic Visualizer**: Real-time Web Audio API energy meter with dynamic hardware device selection.

---

## 9. Android Native Client (`gridzero/`)

Built 100% in **Kotlin** and **Jetpack Compose (Material 3)** for Android 8.0+ (API 26 to 35):

* **High-Performance Navigation**: HorizontalPager root architecture with smooth WhatsApp-style sliding sub-screen transitions.
* **Tactical Radar & Maps**: Switchable between Google Maps and a zero-dependency concentric `Canvas` radar screen based on device compass orientation.
* **Background Radio Services**: `MeshForegroundService` maintains persistent BLE peripheral advertising and scanning with minimal battery consumption.
* **FCM Emergency Alerts**: `ZeroGridFirebaseMessagingService` delivers high-priority heads-up system notifications for urgent alerts.

---

## 10. Setup & Quickstart Guide

### Prerequisites
* **Node.js** v20+ LTS and **npm**
* **MongoDB** (local or Atlas cluster)
* **Python** 3.11+ (for local voice agent)
* **Android Studio Ladybug / Meerkat** (for Android client)

### 1. Backend Server Setup
```bash
cd gridZeroExpress/backend
npm install
```
Create `.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/zerogrid
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
ALLOWED_ORIGINS=http://localhost:3000
```
Start server:
```bash
npm run dev
# Healthcheck: http://localhost:5000/health
```

### 2. Web Frontend Setup
```bash
cd gridZeroExpress/frontend
npm install
```
Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...
```
Start frontend:
```bash
npm run dev
# Open http://localhost:3000
```

### 3. Voice-AI Microservice (Local Execution)
```bash
cd voice-agent
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
export GROQ_API_KEY=gsk_...
uvicorn main:app --reload --port 8000
```

### 4. Android Client Setup
1. Open `gridzero/` in Android Studio.
2. Create `local.properties`:
   ```properties
   MAPS_API_KEY=AIzaSy...
   ```
3. Place `google-services.json` in `app/`.
4. Configure target backend in `app/build.gradle.kts`:
   * Local emulator: `http://10.0.2.2:5000/`
   * Local physical device: `http://192.168.x.x:5000/`
5. Sync Gradle and run on device (Android 8.0+).

---

## 11. Security & Resilience Model

| Domain | Security Mechanism | Resilience Guarantee |
|---|---|---|
| **API Transport** | TLS 1.3 / HTTPS | All credentials, telemetry, and audio payloads encrypted in transit. |
| **Authentication** | JWT (HMAC-SHA256) | Stateless 7-day token rotation with role-based claim checking. |
| **Admin Authorization** | Database Role Verification | Re-checks MongoDB on each privileged route (`role === 'ADMIN'`). |
| **Rate Limiting** | `express-rate-limit` | Prevents alert flooding (strict 2 SOS alerts per 30s limit). |
| **Spatial Indexing** | MongoDB `2dsphere` | Fast geospatial lookahead without exposing sequential ID leaks. |
| **Offline Resilience** | WorkManager Backoff | Failed offline uploads automatically retry upon network recovery. |
| **Pipeline Reliability** | In-Memory Deterministic Fallback | If upstream LLMs cold-start or timeout, Agent 0 executes local rules ensuring continuous operations. |

---

<div align="center">
  <sub>ZeroGrid &bull; Built for Autonomous Disaster Resilience and Mesh Operations</sub>
</div>
