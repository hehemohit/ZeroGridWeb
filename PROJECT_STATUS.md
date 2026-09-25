# ZeroGrid Project Status & Android Integration Specification

> **Repository:** `ZeroGridWeb`  
> **Status Date:** September 20, 2026  
> **Current Git State:** Merged PR #1 (`56d6ec6`) into `master` (`origin/master`)  
> **Target Audience:** Android App Developers, Backend & Web Maintainers  

---

## 1. Executive Summary

ZeroGrid is an emergency rescue & coordination platform operating as a hybrid network:
- **Offline Mesh (Android Section A):** Peer-to-peer communication using BLE and Wi-Fi Direct (`MeshEngine`, `BleMeshDriver`, `MeshForegroundService`) requiring zero internet connection.
- **Online Rescue Network (Backend & Frontend Section B):** Central Node.js/Express API, MongoDB Atlas, Socket.io real-time streaming, Firebase Cloud Messaging (FCM) push alerts, and a Next.js 15 Web Portal.
- **The Bridge:** Single SOS trigger on the Android client fans out to both:
  1. Offline broadcast over BLE/Wi-Fi Direct mesh.
  2. Online dispatch to `POST /api/sos` (with Android `WorkManager` fallback retry queue when offline).

---

## 2. Recent Repository Changes (PR #1 / Commit `56d6ec6`)

The latest merge introduced **14,028 insertions across 59 files**, delivering full backend and web capabilities:

### Backend Additions & Updates
1. **SOS Emergency System (`SosEvent.js`, `sosController.js`, `sosRoutes.js`):**
   - Multi-category emergency dispatches (`MEDICAL`, `DISASTER`, `TRAPPED`, `SECURITY`, `OTHER`).
   - GeoJSON Point coordinates with MongoDB 2dsphere indexing.
   - Dual-dispatch logic: WebSockets broadcast to rescue admins + FCM push notifications to registered emergency contacts.
   - Rate-limited to 2 requests per 30s window.
2. **Family & Child Link System (`ParentChildLink.js`, `familyController.js`, `familyRoutes.js`):**
   - Account linking workflow (`PENDING` -> `ACCEPTED` / `REVOKED`).
   - Real-time location & battery status sharing for linked children.
   - Strict security: link validity is re-verified from DB on every location query (no stale JWT trust).
3. **FCM Push Notifications (`utils/fcm.js`):**
   - High-priority Android notification channel (`sos_alerts`).
   - Automated push fanout to all confirmed emergency contacts upon SOS creation.
4. **Socket.io Real-Time Dispatch (`server.js`):**
   - Dedicated `/sos` namespace.
   - Emits `sos:new` and `sos:updated` to live dashboards without polling.
5. **Admin & Rescue Portal Backend (`adminController.js`, `adminRoutes.js`):**
   - Role-based authorization (`ADMIN` with approval requirement).
   - Stats summary, user list, ban/unban toggle, and full database JSON export (`/api/admin/export`).
6. **Deployment & DevOps (`render.yaml`, `.env.example`):**
   - Pre-configured infrastructure specification for Render hosting.

### Frontend Web Portal Additions (`frontend/`)
- Built with **Next.js 15 (App Router)** and **Tailwind CSS**.
- Pages implemented:
  - `/auth/login` & `/auth/register`: Authentication with JWT token persistence (`localStorage`).
  - `/dashboard`: Active SOS map and quick status overview.
  - `/contacts`: Manage emergency contacts with phone numbers and relationships.
  - `/family`: Send and accept family link requests, monitor child location.
  - `/admin`: Full rescue operation management, live event feed, and incident acknowledge/resolve controls.

---

## 3. Backend API Reference for Android Integration

- **Base URL (Local):** `http://10.0.2.2:5000` (Android Emulator) or `http://<LAN-IP>:5000` (Physical Device)
- **Base URL (Production):** `https://zerogridweb.onrender.com`
- **Default Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <jwt_token>` (for all authenticated endpoints)

---

### 3.1 Authentication Module (`/api/auth`)

#### 1. Register User
- **Method:** `POST`
- **URL:** `/api/auth/register`
- **Rate Limit:** 10 requests / 15 minutes
- **Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "displayName": "Jane Doe",
  "role": "CITIZEN"
}
```
*Note: `role` must be `"CITIZEN"` or `"ADMIN"`. Standard app users must always use `"CITIZEN"`.*

- **Success Response (`201 Created`):**
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "664fa1...",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": false,
    "phoneNumber": null,
    "dateOfBirth": null
  }
}
```

#### 2. Login User
- **Method:** `POST`
- **URL:** `/api/auth/login`
- **Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```
- **Success Response (`200 OK`):** Returns same shape as register with JWT `token`.

#### 3. Google Sign-In
- **Method:** `POST`
- **URL:** `/api/auth/google`
- **Request Body:**
```json
{
  "idToken": "<Google_OAuth2_IdToken_from_GoogleSignInClient>"
}
```

---

### 3.2 User & Device Profile Module (`/api/users`)

#### 1. Get Current Profile
- **Method:** `GET`
- **URL:** `/api/users/me`
- **Success Response (`200 OK`):**
```json
{
  "user": {
    "id": "664fa1...",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": true,
    "phoneNumber": "+1234567890",
    "dateOfBirth": "1998-05-15",
    "photoUrl": null,
    "createdAt": "2026-09-20T10:00:00.000Z"
  }
}
```

#### 2. Register/Update FCM Token (CRITICAL for Android)
> **Action Required:** Call this on every app launch and whenever `FirebaseMessagingService.onNewToken()` fires.
- **Method:** `PUT`
- **URL:** `/api/users/me/fcm-token`
- **Request Body:**
```json
{
  "fcmToken": "c7XZy...<firebase_device_token>"
}
```
- **Success Response (`200 OK`):**
```json
{
  "message": "FCM token updated successfully"
}
```

#### 3. Complete Initial Profile
- **Method:** `PUT`
- **URL:** `/api/users/me/complete-profile`
- **Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "dateOfBirth": "1998-05-15"
}
```

---

### 3.3 Emergency Contacts Module (`/api/contacts`)

Emergency contacts receive automated FCM notifications when the user triggers an SOS.

#### 1. List Contacts
- **Method:** `GET`
- **URL:** `/api/contacts`
- **Success Response (`200 OK`):**
```json
{
  "contacts": [
    {
      "id": "6650b...",
      "name": "Mom",
      "phoneNumber": "+1987654321",
      "relationship": "Parent",
      "contactUserId": "664fa2...",
      "isRegisteredUser": true,
      "createdAt": "2026-09-20T10:30:00.000Z"
    }
  ]
}
```

#### 2. Add Contact
- **Method:** `POST`
- **URL:** `/api/contacts`
- **Request Body:**
```json
{
  "name": "Mom",
  "phoneNumber": "+1987654321",
  "relationship": "Parent"
}
```

#### 3. Delete Contact
- **Method:** `DELETE`
- **URL:** `/api/contacts/:id`

---

### 3.4 SOS Emergency Module (`/api/sos`)

#### 1. Dispatch SOS Alert
- **Method:** `POST`
- **URL:** `/api/sos`
- **Rate Limit:** 2 requests per 30 seconds per IP.
- **Request Body:**
```json
{
  "lat": 19.0760,
  "lng": 72.8777,
  "accuracy": 12.5,
  "category": "MEDICAL",
  "message": "Trapped in flood waters near Market St.",
  "transport": "BOTH"
}
```

| Field | Type | Allowed Values | Required |
|---|---|---|---|
| `lat` | Float | `-90` to `90` | **Yes** |
| `lng` | Float | `-180` to `180` | **Yes** |
| `accuracy` | Float | Accuracy in meters (e.g. `15.0`) | No (defaults to `null`) |
| `category` | String | `MEDICAL`, `DISASTER`, `TRAPPED`, `SECURITY`, `OTHER` | No (defaults to `OTHER`) |
| `message` | String | User description / notes | No |
| `transport` | String | `ONLINE`, `MESH`, `BOTH` | No (defaults to `ONLINE`) |

- **Success Response (`201 Created`):**
```json
{
  "message": "SOS dispatched successfully",
  "sos": {
    "id": "6651c...",
    "triggeredBy": {
      "id": "664fa1...",
      "displayName": "Jane Doe",
      "phoneNumber": "+1234567890"
    },
    "location": {
      "type": "Point",
      "coordinates": [72.8777, 19.0760]
    },
    "accuracyMeters": 12.5,
    "category": "MEDICAL",
    "message": "Trapped in flood waters near Market St.",
    "transport": "BOTH",
    "status": "ACTIVE",
    "acknowledgedBy": null,
    "resolvedBy": null,
    "notes": [],
    "createdAt": "2026-09-20T12:00:00.000Z",
    "updatedAt": "2026-09-20T12:00:00.000Z"
  }
}
```

#### 2. Get SOS Status
- **Method:** `GET`
- **URL:** `/api/sos/:id`
- **Success Response (`200 OK`):** Returns full SOS event details (visible to creator and admin).

---

### 3.5 Family Linking Module (`/api/family`)

#### 1. Request Link to Child Account
- **Method:** `POST`
- **URL:** `/api/family/link-request`
- **Request Body:**
```json
{
  "childEmail": "child@example.com"
}
```
- **Success Response (`201 Created` / `200 OK`):**
```json
{
  "message": "Link request sent successfully",
  "link": {
    "id": "6652d...",
    "childId": "664fa3...",
    "childName": "Timmy Doe",
    "childEmail": "child@example.com",
    "status": "PENDING",
    "requestedAt": "2026-09-20T14:00:00.000Z"
  }
}
```

#### 2. Accept Link (Called from Child's device)
- **Method:** `PUT`
- **URL:** `/api/family/link/:id/accept`
- **Success Response (`200 OK`):**
```json
{
  "message": "Link accepted successfully",
  "link": { "id": "...", "status": "ACCEPTED" }
}
```

#### 3. Revoke Link
- **Method:** `PUT`
- **URL:** `/api/family/link/:id/revoke`

#### 4. Fetch Child's Last Known Location (Parent only)
- **Method:** `GET`
- **URL:** `/api/family/child/:childId/location`
- **Success Response (`200 OK`):**
```json
{
  "child": {
    "id": "664fa3...",
    "displayName": "Timmy Doe",
    "email": "child@example.com",
    "phoneNumber": "+1234567891",
    "photoUrl": null
  },
  "location": {
    "type": "Point",
    "coordinates": [72.8777, 19.0760]
  },
  "lastLocationAt": "2026-09-20T14:05:00.000Z"
}
```

---

## 4. FCM Push Notifications Specification (Android)

When an SOS is triggered, the backend automatically dispatches a message to all emergency contacts.

### 4.1 Android Channel Setup
In Android `Application.onCreate()`, initialize the high-priority notification channel:
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    val channel = NotificationChannel(
        "sos_alerts",
        "Emergency SOS Alerts",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Critical emergency alerts from family and contacts"
        enableVibration(true)
    }
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel)
}
```

### 4.2 Inbound Payload Structure
```json
{
  "notification": {
    "title": "SOS Alert - Medical Emergency",
    "body": "Jane Doe has triggered an emergency SOS. Please check on them immediately."
  },
  "data": {
    "sosId": "6651c...",
    "category": "MEDICAL",
    "lat": "19.0760",
    "lng": "72.8777"
  }
}
```

---

## 5. Real-Time WebSockets (Socket.io)

For authority rescue panels or active client monitoring:
- **Namespace:** `/sos`
- **Connection URL:** `wss://zerogridweb.onrender.com/sos` (or `ws://10.0.2.2:5000/sos` for local testing)
- **Events Emitted by Server:**
  - `sos:new`: Payload contains new `SosEvent` object.
  - `sos:updated`: Emitted when status changes to `ACKNOWLEDGED`, `RESOLVED`, or when new incident notes are added.

---

## 6. Android Implementation Checklist

| Task | Component / Layer | Status | Notes |
|---|---|---|---|
| [ ] Update Base URL config | Networking (`Retrofit` / `Ktor`) | Pending | Support switching between local dev and Render |
| [ ] Update Auth Token interceptor | OkHttp Client | Pending | Attach `Authorization: Bearer <token>` |
| [ ] Send FCM Token to server | `FirebaseMessagingService` | Pending | Call `PUT /api/users/me/fcm-token` on token refresh |
| [ ] Notification Channel `sos_alerts` | Notification Manager | Pending | Required for Android 8.0+ heads-up notification |
| [ ] Dual-Dispatch SOS Trigger | `SosRepository` / `MeshEngine` | Pending | Broadcast to BLE mesh AND HTTP `POST /api/sos` |
| [ ] Offline Queue with WorkManager | `WorkManager` Worker | Pending | Queue `POST /api/sos` if network is disconnected |
| [ ] Family Links UI | Compose / XML Screens | Pending | Send request, accept request, view child location |
| [ ] Emergency Contacts Sync | `ContactRepository` | Pending | Sync local contacts with `/api/contacts` |

---
*Generated by ZeroGrid Architecture Suite.*
