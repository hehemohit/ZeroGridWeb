# ZeroGrid Pivot Plan — Offline Mesh + Online Rescue Network

**Stack:** MERN (MongoDB, Express, React, Node.js) + Render Hosting

---

## 0. Document Purpose

This is the working plan for pivoting ZeroGrid into two clean sections:

- **Section A — Offline** (existing mesh, hardened + extended)
- **Section B — Online** (new: auth, central DB, internet SOS, admin panel)

Stack decision: since the team already has MERN + Render experience, the online section is built on **Node.js/Express + MongoDB**, deployed on **Render**, with a **React admin panel** — instead of Firebase. This trades some "batteries included" convenience for full control and a stack the team already knows how to debug.

Use the checkpoints in [Section 9](#9-checkpoints--execution-tracker) as the actual execution tracker — check a box only when the item is deployed/working, not just coded.

---

## 1. The Core Split

### Section A — Offline (P2P, zero internet dependency)

Everything that already exists and works:

- BLE + Wi-Fi Direct mesh transport (`BleMeshDriver`, `WifiDirectMeshDriver`)
- `MeshEngine` / `MeshRoutingEngine` / `DeduplicationCache` / `PeerTable`
- Direct messaging, broadcast channels, SOS beacon (TTL=10)
- `MeshForegroundService` (background daemon)

Plus new additions:

- Significant-movement GPS location broadcast + offline map (**Module 1**)
- Radar/RSSI-based mesh-only view, no GPS needed (**Module 2**)
- **"Authority Finder" mode** — a variant of `AuthorityDashboardScreen` for rescue personnel physically in the field, surfacing peer direction + signal strength prominently so they can walk toward a signal

> This section must **never** talk to a server. It must work with zero connectivity, by design. Do not let any online dependency leak into this code path.

### Section B — Online (internet-dependent, server-backed)

- Google Auth login
- Central MongoDB database of all registered users
- Emergency contacts (friends/family added by the user)
- SOS-over-internet: alert delivered to contacts + rescue admin panel
- Web-based Admin Panel (React) for rescue teams:
  - Live map of active SOS calls (GPS + timestamp)
  - Acknowledge / resolve workflow
  - History log

### The Bridge

A single "SOS trigger" event should fan out to **both** systems whenever possible:

1. Always broadcast on mesh (works with zero signal)
2. Also send to backend via HTTP/WebSocket if internet is reachable
3. If internet is not reachable at trigger time, queue the online send (WorkManager) and retry once connectivity returns

> Do not force the user to pick "offline mode" vs "online mode" — the app should just use whatever transport is available. Mode-switching UI is a common UX failure point in emergency apps; avoid it.

---

## 2. Why a Backend Is Needed Now

The offline section needs none — that's the point of a mesh network. The online section cannot work without one, because:

- Google Auth tokens must be verified server-side before they're trusted
- A "proper DB of all users" requires durable, central storage — not per-device SharedPreferences/Room
- The admin panel is a browser app; it needs an API to read from, independent of any phone being on or nearby
- SOS-over-internet needs a server to route the alert from sender to the receiver's registered contacts (push notification / WebSocket), and to persist it so the admin panel can display it

---

## 3. MERN Stack Architecture

### 3.1 High-Level Architecture Diagram

```
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   ANDROID APP (Kotlin)       │        │   ADMIN WEB PANEL (React)       │
│                               │        │                                  │
│  Offline Section              │        │  - Login (admin only)           │
│   - MeshEngine (existing)    │        │  - Live SOS map (Socket.io)     │
│   - Location/Radar modules   │        │  - Acknowledge/Resolve UI       │
│                               │        │  - History + user directory     │
│  Online Section (NEW)        │        └────────────────┬─────────────────┘
│   - Google Sign-In SDK       │                         │
│   - REST API client          │                         │ HTTPS + WebSocket
│   - Socket.io client         │                         │
│   - UnifiedSosDispatcher     │                         │
└────────────────┬──────────────┘                         │
                 │ HTTPS (REST) + WebSocket (Socket.io)    │
                 ▼                                         ▼
         ┌────────────────────────────────────────────────────┐
         │              NODE.JS + EXPRESS API                  │
         │              (hosted on Render — Web Service)       │
         │                                                      │
         │  Middleware:                                        │
         │   - verifyGoogleToken (Auth)                        │
         │   - verifyAdminRole                                 │
         │   - rateLimiter (SOS spam protection)               │
         │                                                      │
         │  REST Routes:                                       │
         │   /api/auth/*        /api/users/*                   │
         │   /api/contacts/*    /api/sos/*                     │
         │   /api/admin/*                                      │
         │                                                      │
         │  Socket.io namespace: /sos                          │
         │   - emits "sos:new", "sos:updated" to admin panel   │
         │                                                      │
         │  Push delivery: Firebase Cloud Messaging (FCM)      │
         │   (used ONLY for push notifications — not DB/auth)  │
         └───────────────────────┬──────────────────────────────┘
                                 │ Mongoose ODM
                                 ▼
                     ┌─────────────────────────────┐
                     │   MongoDB Atlas (hosted)    │
                     │                               │
                     │   Collections:                │
                     │    users                      │
                     │    emergencyContacts          │
                     │    sosEvents                  │
                     │    parentChildLinks           │
                     │    adminUsers                 │
                     └─────────────────────────────┘
```

> **Note on Google Auth:** full Firebase isn't required just to use "Google Sign-In." The Android app uses Google's native Sign-In SDK to get an ID token; the Node backend verifies that token directly using Google's `google-auth-library` npm package (`OAuth2Client.verifyIdToken`). This keeps the stack pure MERN + Google's own auth library — no Firebase project required at all, except optionally for FCM push delivery, which is a separate, swappable piece (OneSignal is a drop-in alternative if you'd rather avoid Firebase entirely).

### 3.2 Tech Stack Table

| Layer                | Choice                                | Why                                                                     |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Backend runtime      | Node.js + Express                     | Team already knows this                                                 |
| Database             | MongoDB Atlas                         | Team already knows Mongo; flexible schema fits evolving SOS/user data   |
| ODM                  | Mongoose                              | Schema validation + easy relations via refs                             |
| Real-time transport  | Socket.io                             | Push new SOS events to admin panel instantly, no polling                |
| Auth verification    | `google-auth-library` (Node)          | Verifies Google ID tokens server-side, no Firebase needed               |
| Push notifications   | Firebase Cloud Messaging (FCM)        | Simplest way to push to Android devices; used narrowly, not as DB/auth  |
| Admin panel          | React (Vite) + React Router           | Team already knows React                                                |
| Maps (admin panel)   | Mapbox GL JS or Leaflet + OSM         | Leaflet+OSM is fully free; Mapbox has nicer clustering if budget allows |
| Hosting: API         | Render (Web Service)                  | Team already knows Render                                               |
| Hosting: Admin panel | Render (Static Site) or Vercel        | Static React build, either works                                        |
| Hosting: DB          | MongoDB Atlas (free M0 tier to start) | Managed, no server ops needed                                           |

### 3.3 MongoDB Schema Design

**`users` collection**

```js
{
  _id: ObjectId,
  googleId: String,              // sub claim from verified Google token
  email: String,
  displayName: String,
  photoUrl: String,
  accountType: "STANDARD" | "CHILD",
  phoneNumber: String,
  fcmToken: String,              // for push delivery, updated on login
  dateOfBirth: Date,
  profileComplete: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**`emergencyContacts` collection**

```js
{
  _id: ObjectId,
  ownerId: ObjectId,              // ref: users — the user who added this contact
  contactUserId: ObjectId,        // ref: users — the contact, if also a user
  relationshipLabel: String,      // "Mother", "Friend", etc.
  notifyOnSos: Boolean,
  addedAt: Date
}
```

**`sosEvents` collection**

```js
{
  _id: ObjectId,
  triggeredBy: ObjectId,          // ref: users
  location: {
    type: "Point",
    coordinates: [lng, lat]       // GeoJSON — enables geospatial queries
  },
  accuracyMeters: Number,
  category: String,               // "MEDICAL" | "DISASTER" | "TRAPPED" | "SECURITY"
  message: String,
  transport: "ONLINE" | "MESH" | "BOTH",
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED",
  acknowledgedBy: ObjectId,       // ref: adminUsers, nullable
  resolvedBy: ObjectId,           // ref: adminUsers, nullable
  notes: [
    { authorId: ObjectId, text: String, timestamp: Date }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

> Add a `2dsphere` index on `location` for geospatial queries:
> `db.sosEvents.createIndex({ location: "2dsphere" })`

**`parentChildLinks` collection**

```js
{
  _id: ObjectId,
  parentId: ObjectId,             // ref: users
  childId: ObjectId,              // ref: users
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED",
  requestedAt: Date,
  respondedAt: Date
}
```

**`adminUsers` collection**

```js
{
  _id: ObjectId,
  userId: ObjectId,               // ref: users
  role: "RESCUE_TEAM" | "SUPER_ADMIN",
  addedAt: Date
}
```

### 3.4 Express API — Route Map

**Auth**

| Method | Route              | Notes                                                                                                |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/google` | body: `{ idToken }` — verifies token via `google-auth-library`, creates user if new, returns app JWT |

**Users**

| Method | Route                     | Notes                 |
| ------ | ------------------------- | --------------------- |
| GET    | `/api/users/me`           | current user profile  |
| PUT    | `/api/users/me`           | update profile fields |
| PUT    | `/api/users/me/fcm-token` | update push token     |

**Contacts**

| Method | Route               | Notes                                  |
| ------ | ------------------- | -------------------------------------- |
| GET    | `/api/contacts`     | list my emergency contacts             |
| POST   | `/api/contacts`     | body: `{ contactEmailOrPhone, label }` |
| DELETE | `/api/contacts/:id` | remove a contact                       |

**SOS**

| Method | Route                      | Notes                                                                                                         |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/sos`                 | body: `{ lat, lng, accuracy, category, message, transport }` — creates event, emits `sos:new`, sends FCM push |
| GET    | `/api/sos/:id`             | single event detail (sender view: "help notified")                                                            |
| PUT    | `/api/sos/:id/acknowledge` | admin only                                                                                                    |
| PUT    | `/api/sos/:id/resolve`     | admin only                                                                                                    |
| POST   | `/api/sos/:id/notes`       | admin only — body: `{ text }`                                                                                 |

**Admin**

| Method | Route                          | Notes                                 |
| ------ | ------------------------------ | ------------------------------------- |
| GET    | `/api/admin/sos?status=ACTIVE` | list events for the map               |
| GET    | `/api/admin/sos/history`       | resolved events, paginated/filterable |
| GET    | `/api/admin/users`             | user directory search — super-admin   |
| POST   | `/api/admin/admins`            | add rescue team account — super-admin |

**Family (parent/child)**

| Method | Route                                 | Notes                                               |
| ------ | ------------------------------------- | --------------------------------------------------- |
| POST   | `/api/family/link-request`            | body: `{ childEmail }` or child-created-inline flow |
| PUT    | `/api/family/link/:id/accept`         | parent accepts                                      |
| PUT    | `/api/family/link/:id/revoke`         | unlink                                              |
| GET    | `/api/family/child/:childId/location` | parent only, checked server-side                    |

### 3.5 Middleware — Security Points to Get Right Early

| Middleware                      | Purpose                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verifyGoogleToken`             | Verifies the Google ID token OR your own issued JWT on every protected route. Never trust a client-supplied `userId`/role.                                                                                               |
| `verifyAdminRole(requiredRole)` | Checks `adminUsers` collection server-side before allowing any `/api/admin/*` route. A client `isAdmin` flag must never be trusted.                                                                                      |
| `childLocationAccessCheck`      | For `GET /api/family/child/:childId/location`: confirms `req.user.id` has an `ACCEPTED` `parentChildLinks` record with `childId` before returning any location data. Rejects otherwise, even for a valid logged-in user. |
| `sosRateLimiter`                | Throttles SOS creation per user (e.g. max 1 per 30s) to prevent accidental spam/duplicate calls from flooding the admin panel.                                                                                           |

### 3.6 Real-Time Layer (Socket.io)

- **Namespace:** `/sos`
- **Server emits:**
  - `sos:new` → `{ sosEvent }` — when a new SOS is created
  - `sos:updated` → `{ sosEvent }` — on acknowledge/resolve/notes
- Admin panel subscribes on login (after verifying admin role via a socket auth handshake, not just accepting any connection)

This avoids polling entirely — the map updates the instant a new SOS event is written to MongoDB (emit it right after the successful `Mongoose .save()`).

### 3.7 Deployment on Render

**Service 1 — `zerogrid-api`** (Render Web Service)

- Node.js/Express app
- Env vars: `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `FCM_SERVER_KEY`
- Auto-deploy from `main` branch on the backend repo
- Enable Render's health check endpoint (`GET /health`) so it doesn't spin down mid-incident on the free tier — worth budgeting a paid instance for this app specifically, since "server was asleep" is not acceptable for an SOS system

**Service 2 — `zerogrid-admin`** (Render Static Site)

- React (Vite) build output
- Env var: `VITE_API_BASE_URL` pointing to `zerogrid-api`'s URL
- Auto-deploy from `main` branch on the admin-panel repo

**Database — MongoDB Atlas**

- Separate from Render; use Atlas's free M0 tier to start
- Whitelist Render's outbound IPs (or `0.0.0.0/0` during dev, lock down before real users are on it)
- Enable the `2dsphere` index on `sosEvents.location` immediately

> **Render free tier caveat:** free web services on Render spin down after inactivity and take ~30–60s to wake on the next request. For an emergency SOS backend, that delay is not acceptable. Budget for at least Render's lowest paid tier for `zerogrid-api` before this goes anywhere near real users.

---

## 4. Android-Side Changes (Online Section)

```
online/
├── auth/
│   ├── GoogleSignInManager.kt       // Google Sign-In SDK, gets ID token
│   └── AuthRepository.kt            // POSTs token to /api/auth/google, stores app JWT
├── network/
│   ├── ApiClient.kt                 // Retrofit/OkHttp setup, attaches JWT header
│   └── SocketManager.kt             // Socket.io client (sender-side status updates)
├── contacts/
│   ├── EmergencyContactsScreen.kt
│   └── ContactsRepository.kt
├── sos/
│   ├── OnlineSosManager.kt          // POST /api/sos, offline queueing via WorkManager
│   ├── UnifiedSosDispatcher.kt      // fires mesh AND online together
│   └── SosStatusScreen.kt           // "Help notified — awaiting response"
└── sync/
    └── UserProfileSyncManager.kt
```

**`UnifiedSosDispatcher`** — the key integration point:

```kotlin
class UnifiedSosDispatcher(
    private val meshEngine: MeshEngine,
    private val onlineSosManager: OnlineSosManager,
    private val connectivityChecker: ConnectivityChecker
) {
    fun triggerSos(location: Location, category: SosCategory, message: String) {
        meshEngine.broadcastSos(location, category, message)   // always, free, offline-safe

        if (connectivityChecker.isInternetAvailable()) {
            onlineSosManager.sendSosNow(location, category, message)
        } else {
            onlineSosManager.queueSosForRetry(location, category, message) // WorkManager
        }
    }
}
```

---

## 5. Web Admin Panel — Screen List

1. **Login** — Google Sign-In, gated by `adminUsers` check server-side
2. **Live SOS Map** — Leaflet/Mapbox map, pins = `ACTIVE` `sosEvents`, Socket.io live updates, click a pin for caller name/photo, GPS coords, timestamp, category, contact info, Acknowledge/Resolve buttons
3. **SOS History** — filterable table/list of `RESOLVED` events, useful for after-action review
4. **User Directory** (admin only) — search registered users, view their emergency contacts on file
5. **Admin Management** (super-admin only) — add/remove rescue team accounts

---

## 6. Family / Child Account Model

Layered in after the base online system is stable. Recap of the earlier design, now expressed in Mongo terms:

- `parentChildLinks` collection ([3.3](#33-mongodb-schema-design)) supports multiple parents per child from day one — cheap now, expensive to retrofit later
- Child accounts get a mandatory baseline feature-exclusion set (cannot disable location sharing to linked parent, cannot delete own account) enforced **server-side** in the relevant route handlers, never just hidden in the Android UI
- `GET /api/family/child/:childId/location` must re-verify the `ACCEPTED` link server-side on every call — do not cache "is parent" client-side and trust it

---

## 7. Offline Section Hardening

Carried over from earlier work — do not lose these:

- **`onTaskRemoved()` lifecycle fix:** full mesh teardown when the app is swiped from recents, except an explicit keep-alive whitelist (e.g. active SOS beacon); `START_NOT_STICKY` on the service
- **`MapTileManager`:** policy-compliant User-Agent set once in `Application.onCreate()` (not `MainActivity`, not per-request); tile cache validates content-type before writing; bulk offline region downloads should not hit `tile.openstreetmap.org` directly — use a provider built for bulk/offline tiles (MapTiler, Thunderforest, or self-hosted MBTiles) to avoid IP bans at scale
- **`SignificantMovementDetector` + `LocationSmoother`** for the offline GPS map module; RSSI-banded radar view as the no-GPS fallback

---

## 8. Architecture Principles to Hold Onto Throughout

1. **The offline section must never develop a hidden online dependency.** If a code review finds an offline-path function calling the API client, that's a bug, not a feature.
2. **All access-control checks** (admin role, parent-child link, child account restrictions) are enforced **server-side** in Express middleware/route handlers. Client-side flags are UI convenience only, never a security boundary.
3. **SOS events must never silently fail.** Every SOS trigger either succeeds on mesh, succeeds online, or is queued for retry — never just dropped because of a transient network error.
4. **Keep the admin web panel and the Node API as two separate deployable repos/services**, even if one team builds both — this matches how they'll actually run in production (independent scaling, independent deploys).

---

## 9. Checkpoints — Execution Tracker

Check a box only once the item is actually deployed/working end to end, not just coded locally.

### Checkpoint 0 — Backend Foundation

- [ ] MongoDB Atlas cluster created (free M0 tier), IP access configured
- [ ] `2dsphere` index created on `sosEvents.location`
- [ ] Node/Express repo scaffolded, connects to Atlas successfully
- [ ] Render Web Service created for `zerogrid-api`, env vars set
- [ ] `GET /health` endpoint live and returning 200 on Render URL
- [ ] Google Cloud project + OAuth Client ID created for Android + web

### Checkpoint 1 — Auth

- [ ] `google-auth-library` integrated in Express, verifies real ID tokens
- [ ] `POST /api/auth/google` creates a new user doc on first login
- [ ] App JWT issued and returned, used on subsequent requests
- [ ] Android: `GoogleSignInManager` gets ID token successfully
- [ ] Android: `AuthRepository` posts token, stores JWT securely
- [ ] Android: profile-completion screen wired for new users

### Checkpoint 2 — User + Contacts

- [ ] `GET`/`PUT /api/users/me` working, tested via Android app
- [ ] `emergencyContacts` CRUD routes working
- [ ] Android `EmergencyContactsScreen`: add/remove contacts, hits API
- [ ] FCM token registration wired (`PUT /api/users/me/fcm-token`)

### Checkpoint 3 — SOS Online Path

- [ ] `POST /api/sos` creates a `sosEvent` document correctly
- [ ] FCM push fires to owner's `emergencyContacts` on new SOS
- [ ] Socket.io `sos:new` event emits correctly after save
- [ ] `sosRateLimiter` middleware in place and tested
- [ ] Android `OnlineSosManager` sends real SOS, confirmed in MongoDB
- [ ] Android: offline queueing (WorkManager) retries SOS once connectivity returns — test by triggering SOS in airplane mode

### Checkpoint 4 — Unified Dispatcher

- [ ] `UnifiedSosDispatcher` fires mesh broadcast AND online call together
- [ ] Verified: SOS in airplane mode still fires on mesh
- [ ] Verified: SOS with internet fires on both transports
- [ ] `SosStatusScreen` reflects real status from backend

### Checkpoint 5 — Admin Web Panel MVP

- [ ] React (Vite) app scaffolded, deployed to Render Static Site
- [ ] Admin login gated by `adminUsers` check (server verified, not client)
- [ ] Live SOS map rendering real `ACTIVE` events from `GET /api/admin/sos`
- [ ] Socket.io live update confirmed: new SOS appears without refresh
- [ ] Acknowledge / Resolve buttons update `sosEvents` and reflect in DB

### Checkpoint 6 — Admin Panel V2

- [ ] SOS History screen with filtering
- [ ] Admin notes on an `sosEvent` (`POST /api/sos/:id/notes`)
- [ ] User directory search (super-admin)
- [ ] Add/remove rescue team accounts (super-admin)

### Checkpoint 7 — Offline Section Hardening (parallel track)

- [ ] `onTaskRemoved()` full mesh teardown implemented + tested
- [ ] `START_NOT_STICKY` confirmed on `MeshForegroundService`
- [ ] Keep-alive whitelist mechanism working for active SOS beacon
- [ ] `MapTileManager` User-Agent fix moved to `Application.onCreate()`
- [ ] Tile cache validates content-type before writing (403 tiles purged and no longer re-cached)
- [ ] Offline region bulk-download moved off raw OSM tile server
- [ ] `SignificantMovementDetector` + `LocationSmoother` field-tested
- [ ] Radar/RSSI fallback view tested with GPS disabled

### Checkpoint 8 — Family / Child Accounts

- [ ] `parentChildLinks` routes: request/accept/revoke working
- [ ] Child account creation flow (parent-initiated) working end to end
- [ ] Server-side enforcement: child cannot disable location sharing
- [ ] `GET` child location route re-verifies `ACCEPTED` link every call
- [ ] Multiple parents per child tested (not just single-parent case)

### Checkpoint 9 — Security Pass

_(Do before any real users touch this.)_

- [ ] All `/api/admin/*` routes reject non-admin JWTs (test with a normal user token, confirm 403)
- [ ] All child-location routes reject unlinked parents (test directly)
- [ ] SOS rate limiter confirmed under rapid repeated requests
- [ ] MongoDB Atlas network access locked down from `0.0.0.0/0` to Render's actual egress IPs (or use Atlas's Render integration if available)
- [ ] Render `zerogrid-api` on a paid tier (no cold-start delay on SOS)
- [ ] JWT secret rotated out of any committed code/history

### Checkpoint 10 — Field Test

- [ ] Two-device mesh + one device online SOS test in a real low-signal area (basement, rural spot, etc.)
- [ ] Admin panel open on a laptop during the field test — confirm live pin appears within a few seconds of trigger
- [ ] Battery drain check over a 1-hour session with both sections active
- [ ] OEM background-kill test on at least 2 different phone brands
