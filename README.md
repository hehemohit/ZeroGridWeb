# ZeroGrid Backend API — Online Rescue & User Network

> **Part of the ZeroGrid Disaster Response Ecosystem**  
> Dual Architecture: **Offline Mesh Network (Android P2P)** + **Online Rescue Network (MERN Stack on Render)**

---

## 📖 Table of Contents

1. [Overview & Project Vision](#-overview--project-vision)
2. [Dual Architecture: Offline Mesh vs. Online Network](#-dual-architecture-offline-mesh-vs-online-network)
3. [System Architecture Diagram](#-system-architecture-diagram)
4. [Tech Stack](#-tech-stack)
5. [Directory Structure](#-directory-structure)
6. [Database Schema (MongoDB)](#-database-schema-mongodb)
7. [Environment Variables](#-environment-variables)
8. [Local Development Setup](#-local-development-setup)
9. [API Reference & Endpoints](#-api-reference--endpoints)
   - [Health Probe](#health-probe)
   - [Authentication (`/api/auth`)](#authentication-apiauth)
   - [User Profile Management (`/api/users`)](#user-profile-management-apiusers)
   - [Emergency Contacts (`/api/contacts`)](#emergency-contacts-apicontacts)
10. [Security & Production Hardening](#-security--production-hardening)
11. [Deployment on Render & MongoDB Atlas](#-deployment-on-render--mongodb-atlas)
12. [Roadmap & Execution Tracker (wholeProject.md Alignment)](#-roadmap--execution-tracker-wholeprojectmd-alignment)

---

## 🌐 Overview & Project Vision

**ZeroGrid** is an off-grid resilient emergency communications platform. In mass casualty events, grid failures, or natural disasters, cellular towers collapse or congest. ZeroGrid bridges two mission-critical paradigms:

1. **Section A — Offline Mesh Network:** Peer-to-peer ad-hoc communication via Bluetooth Low Energy (BLE) and Wi-Fi Direct on Android devices without internet connectivity.
2. **Section B — Online Rescue Network (This Backend):** A cloud-native API and real-time event pipeline connecting survivors to designated emergency contacts, cloud databases, and professional rescue teams via a Web Admin Dashboard.

The backend acts as the central authority and online bridge for identity verification, contact notification, persistent emergency records, and real-time dispatcher telemetry.

---

## ⚡ Dual Architecture: Offline Mesh vs. Online Network

The ZeroGrid system enforces strict boundary separation:

| Dimension | Section A: Offline Mesh (Android) | Section B: Online Rescue (Backend & Cloud) |
|---|---|---|
| **Connectivity** | Completely autonomous, zero internet dependency | Internet required (Wi-Fi, Cellular, Satellite uplink) |
| **Transport** | BLE, Wi-Fi Direct, Multihop P2P routing | HTTPS REST, WebSockets (Socket.io), FCM Push |
| **Storage** | Device RAM & local SQLite / Room DB | MongoDB Atlas (Distributed, durable) |
| **User Scope** | Local peer cluster (TTL hops) | Global user directory & registered emergency contacts |
| **Dispatch Bridge** | Broadcasts SOS beacon locally | Sends cloud alerts to first responders and emergency contacts |

### The Unified Dispatcher Bridge
When an SOS is triggered on the user's Android device:
1. **Always broadcast on the offline mesh** (works with 0 bars).
2. **If internet is reachable**, dispatch to this backend API simultaneously.
3. **If internet is offline**, the Android app queues the payload with `WorkManager` and retries automatic upload once connectivity returns.

---

## 📐 System Architecture Diagram

```
┌──────────────────────────────────────┐        ┌────────────────────────────────────┐
│      ANDROID APP (Kotlin)            │        │     ADMIN RESCUE PANEL (React)     │
│                                      │        │                                    │
│  [Offline Engine]                    │        │  - Super-Admin / Rescue Team Auth  │
│   - BleMeshDriver / WifiDirectDriver │        │  - Real-Time Live SOS Map (Pins)   │
│   - MeshRoutingEngine (TTL)          │        │  - Acknowledge / Resolve Workflow  │
│   - Significant Movement Radar       │        │  - Survivor History & Directory    │
│                                      │        └─────────────────┬──────────────────┘
│  [Online Engine]                     │                          │
│   - Native Google Sign-In SDK        │                          │ HTTPS (REST) +
│   - Retrofit REST Client             │                          │ WebSocket (Socket.io)
│   - UnifiedSosDispatcher             │                          │
└──────────────────┬───────────────────┘                          │
                   │ HTTPS (REST) + Socket.io                     │
                   ▼                                              ▼
         ┌─────────────────────────────────────────────────────────────┐
         │                  NODE.JS + EXPRESS API                      │
         │                  (Hosted on Render Web Service)             │
         │                                                             │
         │  Middlewares:                                               │
         │   - verifyToken (App JWT Auth)                              │
         │   - verifyAdminRole (Database verified role checking)       │
         │   - rateLimiter (Brute-force & SOS flood throttling)        │
         │   - trust proxy: 1 (Accurate IP forwarding on Render)       │
         │                                                             │
         │  Mounted Routes:                                            │
         │   /health             - Uptime & DB readiness probes        │
         │   /api/auth/*         - Registration, Login, JWT issuing    │
         │   /api/users/*        - Profile lifecycle & completion      │
         │   /api/contacts/*     - Verified emergency contact links    │
         │   /api/sos/*          - [In-Flight] SOS event orchestration │
         │   /api/admin/*        - [In-Flight] Rescue team operations  │
         │   /api/family/*       - [Roadmap] Parent-child linking      │
         │                                                             │
         │  Real-Time & Push Services:                                 │
         │   - Socket.io Namespace (/sos) -> emits 'sos:new' to admins │
         │   - Firebase Cloud Messaging (FCM) push to emergency family │
         └──────────────────────────────┬──────────────────────────────┘
                                        │ Mongoose 9.x ODM
                                        ▼
                         ┌─────────────────────────────┐
                         │   MongoDB Atlas (Hosted)    │
                         │                             │
                         │   Collections:              │
                         │    - users                  │
                         │    - emergencyContacts      │
                         │    - sosEvents (2dsphere)   │
                         │    - parentChildLinks       │
                         │    - adminUsers             │
                         └─────────────────────────────┘
```

---

## 🛠 Tech Stack

- **Runtime Environment:** [Node.js](https://nodejs.org/) (v18+ LTS)
- **Web Framework:** [Express.js](https://expressjs.com/) (v5.x)
- **Database & ODM:** [MongoDB Atlas](https://www.mongodb.com/atlas) with [Mongoose](https://mongoosejs.com/) (v9.x)
- **Authentication & Security:** 
  - [JSON Web Token (jsonwebtoken)](https://github.com/auth0/node-jsonwebtoken) for stateless Bearer tokens
  - [bcrypt](https://github.com/kelektiv/node.bcrypt.js) for cryptographic password hashing
  - [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) with reverse proxy IP resolution
  - [CORS](https://github.com/expressjs/cors) middleware
- **Real-Time & Messaging (Roadmap Integration):**
  - [Socket.io](https://socket.io/) for sub-second incident streaming to web dashboards
  - [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs) for Google ID token verification
  - [Firebase Admin SDK (FCM)](https://firebase.google.com/docs/admin/setup) strictly for push notifications
- **Deployment Platform:** [Render](https://render.com) (Web Service)

---

## 📂 Directory Structure

```
backend/
├── .env                  # Local secret configuration (git-ignored)
├── .env.example          # Environment variable template
├── .gitignore            # Git exclusion rules
├── package.json          # Dependencies & execution scripts
├── package-lock.json     # Deterministic dependency lockfile
├── wholeProject.md       # Master engineering blueprint & execution tracker
├── README.md             # This documentation
└── src/
    ├── server.js         # Express app initialization, proxy config & DB hookup
    ├── controllers/
    │   ├── authController.js     # User registration, login, and token generation
    │   ├── contactController.js  # Emergency contact CRUD & user matching
    │   └── userController.js     # Profile retrieval, updates, and onboarding
    ├── middleware/
    │   ├── verifyToken.js        # JWT header validation & decoded payload injection
    │   └── verifyAdminRole.js    # DB-backed real-time admin authority verification
    ├── models/
    │   ├── Contact.js            # Emergency contact schema with compound indexing
    │   └── User.js               # User identity, roles (CITIZEN/ADMIN), profile status
    ├── routes/
    │   ├── authRoutes.js         # Rate-limited authentication endpoints
    │   ├── contactRoutes.js      # Authenticated contact management routes
    │   └── userRoutes.js         # Authenticated user profile routes
    └── utils/
        ├── jwt.js                # JWT sign & verify utility functions
        └── validation.js         # Standardized email and E.164 phone validators
```

---

## 🗄 Database Schema (MongoDB)

### 1. `users` Collection
Stores both civilian users and rescue administrators.

```javascript
{
  _id: ObjectId,
  email: String,            // Unique, lowercase, validated
  passwordHash: String,     // Bcrypt hash (rounds: 10)
  displayName: String,      // Trimmed user name
  authProvider: String,     // "LOCAL" | "GOOGLE" (Default: "LOCAL")
  googleId: String,         // Optional Google sub identifier
  role: String,             // "CITIZEN" | "ADMIN" (Default: "CITIZEN")
  adminApproved: Boolean,   // null for CITIZEN; false (pending) or true (approved) for ADMIN
  phoneNumber: String,      // E.164 international format (7-15 digits)
  dateOfBirth: Date,        // Validated past date (between 1900 and today)
  photoUrl: String,         // Avatar image URL
  profileComplete: Boolean, // Flag indicating phone + DOB completion
  accountType: String,      // "STANDARD" | "CHILD" (Default: "STANDARD")
  fcmToken: String,         // Firebase push token for dispatch alerts
  createdAt: Date,
  updatedAt: Date
}
```

*Pre-save Hook:* Automatically sanitizes `adminApproved` based on role modifications (sets `false` for new Admins, `null` for Citizens) without relying on deprecated callbacks.

### 2. `emergencyContacts` Collection
Maps a user to trusted registered platform contacts.

```javascript
{
  _id: ObjectId,
  ownerId: ObjectId,        // Ref: User (The authenticated user)
  contactUserId: ObjectId,  // Ref: User (The registered contact target)
  label: String,            // e.g., "Mother", "Spouse", "Colleague"
  createdAt: Date,
  updatedAt: Date
}
```

*Indexes:*
- `ownerId: 1`
- Compound Unique Index: `{ ownerId: 1, contactUserId: 1 }` (Prevents duplicate contact entries).

---

## 🔑 Environment Variables

Create a `.env` file in the root directory:

```ini
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Connection (MongoDB Atlas SRV connection string)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# Authentication Security
JWT_SECRET=your_super_secret_jwt_signing_key_here
JWT_EXPIRES_IN=7d

# [Future Integration: Checkpoint 1 & 3]
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
FCM_SERVER_KEY=your_firebase_admin_private_key
```

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js (v18.x or higher)
- npm (v9.x or higher)
- Active MongoDB Atlas Cluster or local MongoDB instance

### Installation
```bash
# Clone the repository and navigate to backend
cd backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env and supply your MONGODB_URI and JWT_SECRET
```

### Running the Server
```bash
# Development mode with nodemon auto-restart:
npm run dev

# Production mode:
npm start
```

### Verifying Service Health
Send a request to the health probe:
```bash
curl http://localhost:5000/health
```
**Expected Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 12.45,
  "timestamp": "2026-09-19T08:15:00.000Z"
}
```

---

## 📡 API Reference & Endpoints

### Base URL
- **Local:** `http://localhost:5000`
- **Render Production:** `https://<your-render-app>.onrender.com`

---

### Health Probe

#### `GET /health`
Used by uptime monitors (UptimeRobot) and Render health probes to prevent instance cold starts.
- **Auth:** None
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 124.52,
  "timestamp": "2026-09-19T08:00:00.000Z"
}
```

---

### Authentication (`/api/auth`)

> **Rate Limit:** 10 requests per 15-minute window per IP.

#### `POST /api/auth/register`
Registers a new citizen or rescue admin account.

- **Auth:** None
- **Body (`application/json`):**
```json
{
  "email": "survivor@example.com",
  "password": "SecurePassword123!",
  "displayName": "Alex Walker",
  "role": "CITIZEN"
}
```
*Note:* `role` must be either `"CITIZEN"` or `"ADMIN"`. If `"ADMIN"`, `adminApproved` defaults to `false`.

- **Response `201 Created`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "660c1bf5c8d2a1001e3b5e41",
    "email": "survivor@example.com",
    "displayName": "Alex Walker",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": false,
    "phoneNumber": null,
    "dateOfBirth": null
  }
}
```

#### `POST /api/auth/login`
Authenticates existing credentials and returns a Bearer JWT.

- **Auth:** None
- **Body (`application/json`):**
```json
{
  "email": "survivor@example.com",
  "password": "SecurePassword123!"
}
```
- **Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "660c1bf5c8d2a1001e3b5e41",
    "email": "survivor@example.com",
    "displayName": "Alex Walker",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": true,
    "phoneNumber": "+12025550143",
    "dateOfBirth": "1995-06-15"
  }
}
```

---

### User Profile Management (`/api/users`)

> **Auth Required:** All endpoints require `Authorization: Bearer <token>`.

#### `GET /api/users/me`
Retrieves the authenticated user's current profile.

- **Response `200 OK`:**
```json
{
  "user": {
    "id": "660c1bf5c8d2a1001e3b5e41",
    "email": "survivor@example.com",
    "displayName": "Alex Walker",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": true,
    "phoneNumber": "+12025550143",
    "dateOfBirth": "1995-06-15"
  }
}
```

#### `PUT /api/users/me`
Updates whitelisted profile fields (`displayName`, `phoneNumber`, `dateOfBirth`).

- **Body (`application/json`):**
```json
{
  "displayName": "Alexander Walker",
  "phoneNumber": "+12025550199"
}
```
- **Response `200 OK`:** Returns updated user payload.

#### `PUT /api/users/me/complete-profile`
Enforces required phone number and date of birth submission for first-time profile completion. Sets `profileComplete: true`.

- **Body (`application/json`):**
```json
{
  "phoneNumber": "+12025550143",
  "dateOfBirth": "1995-06-15"
}
```
- **Response `200 OK`:**
```json
{
  "user": {
    "id": "660c1bf5c8d2a1001e3b5e41",
    "email": "survivor@example.com",
    "displayName": "Alex Walker",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": true,
    "phoneNumber": "+12025550143",
    "dateOfBirth": "1995-06-15"
  }
}
```

---

### Emergency Contacts (`/api/contacts`)

> **Auth Required:** `Authorization: Bearer <token>`

#### `GET /api/contacts`
Lists all contacts registered by the caller, populated with current contact user details.

- **Response `200 OK`:**
```json
{
  "contacts": [
    {
      "id": "660c2aaec8d2a1001e3b5e90",
      "label": "Sister",
      "createdAt": "2026-09-19T06:30:00.000Z",
      "contactUser": {
        "id": "660c1bf5c8d2a1001e3b5e55",
        "displayName": "Sarah Walker",
        "email": "sarah@example.com",
        "phoneNumber": "+12025550177",
        "role": "CITIZEN",
        "photoUrl": null
      }
    }
  ]
}
```

#### `POST /api/contacts`
Adds an emergency contact. The target user **must already be a registered ZeroGrid user** found by email or phone. Users cannot add themselves or duplicate entries.

- **Body (`application/json`):**
```json
{
  "contactEmailOrPhone": "sarah@example.com",
  "label": "Sister"
}
```
- **Response `201 Created`:**
```json
{
  "message": "Emergency contact added successfully",
  "contact": {
    "id": "660c2aaec8d2a1001e3b5e90",
    "label": "Sister",
    "createdAt": "2026-09-19T06:30:00.000Z",
    "contactUser": {
      "id": "660c1bf5c8d2a1001e3b5e55",
      "displayName": "Sarah Walker",
      "email": "sarah@example.com",
      "phoneNumber": "+12025550177",
      "role": "CITIZEN",
      "photoUrl": null
    }
  }
}
```

#### `DELETE /api/contacts/:id`
Removes an emergency contact by its contact relation ID.

- **Response `200 OK`:**
```json
{
  "message": "Emergency contact removed successfully",
  "id": "660c2aaec8d2a1001e3b5e90"
}
```

---

## 🛡 Security & Production Hardening

1. **Reverse Proxy Trust:** `app.set('trust proxy', 1)` is enabled in `server.js` to ensure proper evaluation of `X-Forwarded-For` on Render and prevent rate-limiter validation bypass.
2. **Stateless JWT + Real-Time Admin Validation:** In `verifyAdminRole.js`, the admin status is refreshed directly from MongoDB on every request rather than trusting stale JWT claims, guaranteeing immediate revocation if an admin is demoted.
3. **Mongoose 9 Modern Hook Standards:** Middleware hooks use modern synchronous and asynchronous promise resolutions without legacy callback parameters (`next()`).
4. **Deprecation Compliance:** Modern update calls leverage MongoDB native `{ returnDocument: 'after' }` replacing deprecated `{ new: true }`.
5. **Sanitized Projections:** Passwords hashes (`passwordHash`) are excluded from queries via `.select('-passwordHash')` and safe payload mappers.

---

## ☁ Deployment on Render & MongoDB Atlas

### 1. MongoDB Atlas Configuration
- Whitelist Render outbound IP addresses (or `0.0.0.0/0` during development staging).
- Once the SOS collection is created, establish the 2D Geospatial index:
  ```javascript
  db.sosEvents.createIndex({ location: "2dsphere" })
  ```

### 2. Render Web Service Setup
- **Service Type:** Web Service
- **Environment:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`
- **Environment Variables:** Define `PORT`, `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`.
- *Note:* In emergency life-safety applications, upgrade Render to a paid tier (Starter+) to eliminate cold-start sleep delays on SOS broadcasts.

---

## 🗺 Roadmap & Execution Tracker (wholeProject.md Alignment)

Refer to [wholeProject.md](file:///c:/Users/ACER/AndroidStudioProjects/gridZeroExpress/backend/wholeProject.md) for master architecture and full execution checkpoints.

| Checkpoint | Scope | Status | Notes |
|---|---|:---:|---|
| **Checkpoint 0** | Backend Foundation (Express, Atlas, Health Check, Render) | ✅ Completed | `/health` route, Mongoose 9, Render proxy trust configured |
| **Checkpoint 1** | Auth Engine & Identity | 🔄 In Progress | Local JWT & bcrypt completed; Google ID token verification upcoming |
| **Checkpoint 2** | User Directory & Emergency Contacts | ✅ Completed | `/api/users/me`, complete profile, contact linking & duplicate guards |
| **Checkpoint 3** | SOS Online Pipeline & Notification Engine | ⏳ Queued | `POST /api/sos`, Socket.io `/sos` namespace, FCM push to contacts |
| **Checkpoint 4** | Unified Dispatcher (Android Integration) | ⏳ Queued | Mesh + Online simultaneous broadcast & WorkManager offline retry |
| **Checkpoint 5** | React Rescue Admin Panel (MVP) | ⏳ Queued | Live SOS map, Socket.io telemetry pins, acknowledge/resolve |
| **Checkpoint 6** | Admin Operations V2 | ⏳ Queued | SOS history search, survivor lookup, admin team provisioning |
| **Checkpoint 7** | Offline Mesh Hardening (Android) | ⏳ Queued | Lifecycle cleanup (`onTaskRemoved`), GPS movement detection |
| **Checkpoint 8** | Family & Child Linkage | ⏳ Queued | Multi-parent linking, location sharing constraints |
| **Checkpoint 9** | Security Audit & Load Testing | ⏳ Queued | RBAC validation, IP restrictions, secret rotation |

---

## 👥 Contributors & Maintainers
- **ZeroGrid Team** — Disaster Communications Architecture & Development.
