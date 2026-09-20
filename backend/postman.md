# ZeroGrid API — Postman Test Guide

> **Base URL:** `http://localhost:5000`  
> **Auth:** Most routes require a `Bearer` token in the `Authorization` header.  
> **Content-Type:** `application/json` for all request bodies.

---

## 📋 Table of Contents

1. [Setup & Environment Variables](#1-setup--environment-variables)
2. [Health Check](#2-health-check)
3. [Auth Module](#3-auth-module)
4. [User Module](#4-user-module)
5. [Contacts Module](#5-contacts-module)
6. [Family Module](#6-family-module)
7. [SOS Module](#7-sos-module)
8. [Admin Module](#8-admin-module)
9. [Error Cases Cheat Sheet](#9-error-cases-cheat-sheet)

---

## 1. Setup & Environment Variables

Create a Postman **Environment** and add the following variables:

| Variable       | Initial Value              | Description                            |
| -------------- | -------------------------- | -------------------------------------- |
| `BASE_URL`     | `http://localhost:5000`    | Backend base URL                       |
| `TOKEN`        | *(empty)*                  | Filled automatically after login       |
| `ADMIN_TOKEN`  | *(empty)*                  | Filled after admin login               |
| `LINK_ID`      | *(empty)*                  | Family link `_id` from link-request    |
| `SOS_ID`       | *(empty)*                  | SOS event `_id` from trigger           |
| `CONTACT_ID`   | *(empty)*                  | Contact `_id` from add-contact         |
| `TARGET_USER_ID` | *(empty)*                | A userId to promote/demote admin       |

**Auto-set TOKEN on Login** — add this to the **Tests** tab of the Login request:
```javascript
const json = pm.response.json();
if (json.token) {
    pm.environment.set("TOKEN", json.token);
}
```

---

## 2. Health Check

### `GET /health` — Server & DB status

| Field        | Value                    |
| ------------ | ------------------------ |
| **Method**   | GET                      |
| **URL**      | `{{BASE_URL}}/health`    |
| **Auth**     | None                     |

**Expected Response `200`:**
```json
{
  "status": "ok",
  "database": "connected",
  "uptime": 123.45,
  "timestamp": "2026-09-20T06:00:00.000Z"
}
```

---

## 3. Auth Module

**Base path:** `/api/auth`  
**Rate limit:** 10 requests / 15 minutes per IP (applies to all auth routes).

---

### 3.1 `POST /api/auth/register` — Register a new user

| Field          | Value                              |
| -------------- | ---------------------------------- |
| **Method**     | POST                               |
| **URL**        | `{{BASE_URL}}/api/auth/register`   |
| **Auth**       | None                               |
| **Body (raw JSON)** | ↓                           |

```json
{
  "email": "alice@example.com",
  "password": "SecurePass123",
  "displayName": "Alice Smith",
  "role": "CITIZEN"
}
```

**Expected Response `201`:**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "...",
    "email": "alice@example.com",
    "displayName": "Alice Smith",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": false,
    "phoneNumber": null,
    "dateOfBirth": null
  }
}
```

**Test Cases:**

| Scenario | Modification | Expected Status |
| -------- | ------------ | --------------- |
| ✅ Happy path — Citizen | Body as above | `201` |
| ✅ Happy path — Admin | `"role": "ADMIN"` | `201` (adminApproved: false) |
| ❌ Missing role | Remove `role` field | `400` — "Role must be either CITIZEN or ADMIN" |
| ❌ Invalid role | `"role": "SUPERUSER"` | `400` |
| ❌ Invalid email | `"email": "notanemail"` | `400` |
| ❌ Short password | `"password": "abc"` | `400` — "Password must be at least 8 characters long" |
| ❌ Empty displayName | `"displayName": ""` | `400` |
| ❌ Duplicate email | Re-send same request | `409` — "User already exists with this email" |

---

### 3.2 `POST /api/auth/login` — Login with email/password

| Field          | Value                            |
| -------------- | -------------------------------- |
| **Method**     | POST                             |
| **URL**        | `{{BASE_URL}}/api/auth/login`    |
| **Auth**       | None                             |
| **Body (raw JSON)** | ↓                         |

```json
{
  "email": "alice@example.com",
  "password": "SecurePass123"
}
```

**Expected Response `200`:**
```json
{
  "token": "<jwt>",
  "user": { ... }
}
```

> 💡 **Add to Tests tab** to auto-save the token:
> ```javascript
> pm.environment.set("TOKEN", pm.response.json().token);
> ```

**Test Cases:**

| Scenario | Modification | Expected Status |
| -------- | ------------ | --------------- |
| ✅ Valid credentials | Body as above | `200` |
| ❌ Wrong password | Change password | `401` — "Invalid credentials" |
| ❌ Non-existent email | Unknown email | `401` — "Invalid credentials" |
| ❌ Missing fields | Remove `password` | `400` — "Email and password are required" |
| ❌ Admin not yet approved | Use un-approved ADMIN account | `403` — "Admin account pending approval" |
| ❌ Google-only account | Try to login with an account created via Google | `400` — "This account uses Google Sign-In..." |

---

### 3.3 `POST /api/auth/google` — Google Sign-In

| Field          | Value                              |
| -------------- | ---------------------------------- |
| **Method**     | POST                               |
| **URL**        | `{{BASE_URL}}/api/auth/google`     |
| **Auth**       | None                               |
| **Body (raw JSON)** | ↓                           |

```json
{
  "idToken": "<Google ID Token from Android SDK>"
}
```

**Expected Response `200`:**
```json
{
  "token": "<jwt>",
  "isNewUser": false,
  "user": { ... }
}
```

**Test Cases:**

| Scenario | Modification | Expected Status |
| -------- | ------------ | --------------- |
| ✅ Valid Google ID token | Real token from Google SDK | `200` |
| ❌ Missing idToken | Remove `idToken` | `400` — "idToken is required" |
| ❌ Expired/tampered token | `"idToken": "invalid.token.here"` | `401` — "Invalid or expired Google ID token" |
| ❌ GOOGLE_CLIENT_ID not set on server | (server config issue) | `503` |

---

## 4. User Module

**Base path:** `/api/users`  
**Auth required:** All routes — set `Authorization: Bearer {{TOKEN}}`

---

### 4.1 `GET /api/users/me` — Get my profile

| Field      | Value                         |
| ---------- | ----------------------------- |
| **Method** | GET                           |
| **URL**    | `{{BASE_URL}}/api/users/me`   |
| **Auth**   | Bearer `{{TOKEN}}`            |

**Expected Response `200`:**
```json
{
  "user": {
    "id": "...",
    "email": "alice@example.com",
    "displayName": "Alice Smith",
    "role": "CITIZEN",
    "accountType": "STANDARD",
    "profileComplete": false,
    "phoneNumber": null,
    "dateOfBirth": null,
    "photoUrl": null,
    "createdAt": "2026-09-20T..."
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Valid token | `200` with user object |
| ❌ No Authorization header | `401` |
| ❌ Expired / malformed token | `401` |

---

### 4.2 `PUT /api/users/me` — Update my profile

| Field          | Value                         |
| -------------- | ----------------------------- |
| **Method**     | PUT                           |
| **URL**        | `{{BASE_URL}}/api/users/me`   |
| **Auth**       | Bearer `{{TOKEN}}`            |
| **Body (raw JSON)** | ↓                      |

```json
{
  "displayName": "Alice Updated",
  "phoneNumber": "+919876543210",
  "dateOfBirth": "1995-06-15",
  "photoUrl": "https://example.com/photo.jpg"
}
```

> 🔒 **Whitelisted fields only.** Sending `role`, `email`, or `adminApproved` in body is silently ignored.

**Test Cases:**

| Scenario | Body | Expected Status |
| -------- | ---- | --------------- |
| ✅ Update displayName only | `{ "displayName": "Bob" }` | `200` |
| ✅ Update phone + DOB | `{ "phoneNumber": "+919999999999", "dateOfBirth": "1990-01-01" }` | `200` |
| ❌ Empty displayName | `{ "displayName": "" }` | `400` |
| ❌ Invalid phone | `{ "phoneNumber": "abc" }` | `400` |
| ❌ Future date of birth | `{ "dateOfBirth": "2099-01-01" }` | `400` |
| ❌ No valid fields | `{ "role": "ADMIN" }` | `400` — "No valid fields provided to update" |

---

### 4.3 `PUT /api/users/me/complete-profile` — First-time profile completion

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| **Method**     | PUT                                            |
| **URL**        | `{{BASE_URL}}/api/users/me/complete-profile`   |
| **Auth**       | Bearer `{{TOKEN}}`                             |
| **Body (raw JSON)** | ↓                                         |

```json
{
  "phoneNumber": "+919876543210",
  "dateOfBirth": "1995-06-15"
}
```

**Expected Response `200`:**
```json
{
  "user": {
    "profileComplete": true,
    "phoneNumber": "+919876543210",
    "dateOfBirth": "1995-06-15",
    ...
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Valid phone + DOB | `200` with `profileComplete: true` |
| ❌ Missing phoneNumber | `400` — "A valid phone number is required..." |
| ❌ Missing dateOfBirth | `400` — "A valid past date of birth is required..." |
| ❌ Invalid phone (letters) | `400` |
| ❌ DOB in the future | `400` |

---

### 4.4 `PUT /api/users/me/fcm-token` — Register FCM push token

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| **Method**     | PUT                                    |
| **URL**        | `{{BASE_URL}}/api/users/me/fcm-token`  |
| **Auth**       | Bearer `{{TOKEN}}`                     |
| **Body (raw JSON)** | ↓                                 |

```json
{
  "fcmToken": "dGhpcyBpcyBhIGZha2UgZmNtIHRva2Vu..."
}
```

**Expected Response `200`:**
```json
{
  "message": "FCM token updated successfully"
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Valid FCM token string | `200` |
| ❌ Missing fcmToken | `400` — "fcmToken is required and must be a non-empty string" |
| ❌ Empty string | `400` |

---

## 5. Contacts Module

**Base path:** `/api/contacts`  
**Auth required:** All routes — `Authorization: Bearer {{TOKEN}}`

> Contacts are **emergency contacts**: other registered ZeroGrid users that receive FCM push notifications when you trigger SOS.

---

### 5.1 `GET /api/contacts` — List my emergency contacts

| Field      | Value                          |
| ---------- | ------------------------------ |
| **Method** | GET                            |
| **URL**    | `{{BASE_URL}}/api/contacts`    |
| **Auth**   | Bearer `{{TOKEN}}`             |

**Expected Response `200`:**
```json
{
  "contacts": [
    {
      "id": "...",
      "label": "Emergency Contact",
      "createdAt": "...",
      "contactUser": {
        "id": "...",
        "displayName": "Bob",
        "email": "bob@example.com",
        "phoneNumber": "+91...",
        "role": "CITIZEN",
        "photoUrl": null
      }
    }
  ]
}
```

---

### 5.2 `POST /api/contacts` — Add an emergency contact

| Field          | Value                          |
| -------------- | ------------------------------ |
| **Method**     | POST                           |
| **URL**        | `{{BASE_URL}}/api/contacts`    |
| **Auth**       | Bearer `{{TOKEN}}`             |
| **Body (raw JSON)** | ↓                         |

**By email:**
```json
{
  "contactEmailOrPhone": "bob@example.com",
  "label": "My Friend Bob"
}
```

**By phone number:**
```json
{
  "contactEmailOrPhone": "+919876543210",
  "label": "Dad"
}
```

> 💡 Save the returned `id` to `{{CONTACT_ID}}` for the delete test.
> ```javascript
> pm.environment.set("CONTACT_ID", pm.response.json().contact.id);
> ```

**Test Cases:**

| Scenario | Body | Expected Status |
| -------- | ---- | --------------- |
| ✅ Valid email of existing user | `{ "contactEmailOrPhone": "bob@example.com" }` | `201` |
| ✅ Valid phone of existing user | `{ "contactEmailOrPhone": "+919999999999" }` | `201` |
| ❌ Email not in system | Unknown email | `404` — "No registered ZeroGrid user found..." |
| ❌ Adding yourself | Your own email/phone | `400` — "You cannot add yourself..." |
| ❌ Duplicate add | Re-send same request | `409` — "This user is already in your emergency contacts list" |
| ❌ Invalid format (neither email nor phone) | `"contactEmailOrPhone": "!@#$%"` | `400` |
| ❌ Missing field | Empty body `{}` | `400` |

---

### 5.3 `DELETE /api/contacts/:id` — Remove an emergency contact

| Field      | Value                                       |
| ---------- | ------------------------------------------- |
| **Method** | DELETE                                      |
| **URL**    | `{{BASE_URL}}/api/contacts/{{CONTACT_ID}}`  |
| **Auth**   | Bearer `{{TOKEN}}`                          |

**Expected Response `200`:**
```json
{
  "message": "Emergency contact removed successfully",
  "id": "{{CONTACT_ID}}"
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Valid contact ID (owned by me) | `200` |
| ❌ Non-existent / already deleted | `404` — "Contact not found or already deleted" |
| ❌ Invalid ObjectId format | `400` — "Invalid contact ID format" |
| ❌ Someone else's contact ID | `404` (ownership check) |

---

## 6. Family Module

**Base path:** `/api/family`  
**Auth required:** All routes — `Authorization: Bearer {{TOKEN}}`

> The family link flow: **Parent** sends a link request → **Child** accepts → Parent can view child's location.

---

### 6.1 `POST /api/family/link-request` — Send a link request (as Parent)

| Field          | Value                                    |
| -------------- | ---------------------------------------- |
| **Method**     | POST                                     |
| **URL**        | `{{BASE_URL}}/api/family/link-request`   |
| **Auth**       | Bearer `{{TOKEN}}` (Parent account)      |
| **Body (raw JSON)** | ↓                                   |

```json
{
  "childEmail": "child@example.com"
}
```

> 💡 Save the returned link `id` to `{{LINK_ID}}`:
> ```javascript
> pm.environment.set("LINK_ID", pm.response.json().link.id);
> ```

**Expected Response `201`:**
```json
{
  "message": "Link request sent successfully",
  "link": {
    "id": "...",
    "childId": "...",
    "childName": "Child User",
    "childEmail": "child@example.com",
    "status": "PENDING",
    "requestedAt": "..."
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Valid child email (registered user) | `201` |
| ❌ Email not registered | `404` — "No registered ZeroGrid user found with this email" |
| ❌ Linking to yourself | Use your own email | `400` — "You cannot link to your own account" |
| ❌ Duplicate pending request | Re-send same request | `409` — "A link request is already pending..." |
| ❌ Already linked | Re-request after acceptance | `409` — "You are already linked to this user" |
| ✅ Re-request after revoke/reject | Re-send after revoke | `200` — "Link request re-sent" |

---

### 6.2 `PUT /api/family/link/:id/accept` — Accept a link request (as Child)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| **Method** | PUT                                               |
| **URL**    | `{{BASE_URL}}/api/family/link/{{LINK_ID}}/accept` |
| **Auth**   | Bearer `{{TOKEN}}` (**Child** account's token)    |

> ⚠️ Must be called with the **child account's** token, not the parent's.

**Expected Response `200`:**
```json
{
  "message": "Link request accepted",
  "link": {
    "id": "...",
    "parentId": "...",
    "childId": "...",
    "status": "ACCEPTED",
    "respondedAt": "..."
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Child accepts pending link | `200` |
| ❌ Wrong user accepting (parent or unrelated) | `404` — "Pending link request not found or you are not the child account" |
| ❌ Invalid link ID format | `400` — "Invalid link ID" |
| ❌ Already accepted (no longer PENDING) | `404` |

---

### 6.3 `PUT /api/family/link/:id/revoke` — Revoke a link

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| **Method** | PUT                                               |
| **URL**    | `{{BASE_URL}}/api/family/link/{{LINK_ID}}/revoke` |
| **Auth**   | Bearer `{{TOKEN}}` (Parent or Child account)      |

**Expected Response `200`:**
```json
{
  "message": "Link revoked successfully",
  "linkId": "..."
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Parent revokes ACCEPTED link | `200` |
| ✅ Child revokes PENDING link | `200` |
| ❌ Unrelated user tries to revoke | `404` — "Link not found or you are not a party to this link" |
| ❌ Already REVOKED link | `404` |
| ❌ Invalid link ID format | `400` |

---

### 6.4 `GET /api/family/links` — List all my family links

| Field      | Value                            |
| ---------- | -------------------------------- |
| **Method** | GET                              |
| **URL**    | `{{BASE_URL}}/api/family/links`  |
| **Auth**   | Bearer `{{TOKEN}}`               |

**Expected Response `200`:**
```json
{
  "links": [
    {
      "_id": "...",
      "parentId": { "displayName": "...", "email": "...", "photoUrl": null },
      "childId":  { "displayName": "...", "email": "...", "photoUrl": null },
      "status": "ACCEPTED",
      "requestedAt": "...",
      "respondedAt": "..."
    }
  ]
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ User with links | `200` — array of links |
| ✅ User with no links | `200` — `"links": []` |

---

### 6.5 `GET /api/family/child/:childId/location` — Get child's location (as Parent)

| Field      | Value                                                 |
| ---------- | ----------------------------------------------------- |
| **Method** | GET                                                   |
| **URL**    | `{{BASE_URL}}/api/family/child/<childUserId>/location` |
| **Auth**   | Bearer `{{TOKEN}}` (**Parent** account's token)       |

**Expected Response `200`:**
```json
{
  "child": {
    "id": "...",
    "displayName": "Child Name",
    "email": "child@example.com",
    "phoneNumber": null,
    "photoUrl": null
  },
  "location": null,
  "lastLocationAt": null
}
```

> `location` will be `null` until the child has triggered an SOS (location is updated then).

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Parent with ACCEPTED link calls with child's ID | `200` |
| ❌ Parent without accepted link (or link revoked) | `403` — "Access denied: No accepted parent-child link found..." |
| ❌ Child account trying to call this | `403` |
| ❌ Invalid childId format | `400` — "Invalid child user ID" |

---

## 7. SOS Module

**Base path:** `/api/sos`  
**Auth required:** All routes — `Authorization: Bearer {{TOKEN}}`

> Triggering SOS is **rate-limited**: max **2 requests per 30 seconds** per IP.

---

### 7.1 `POST /api/sos` — Trigger an SOS event

| Field          | Value                       |
| -------------- | --------------------------- |
| **Method**     | POST                        |
| **URL**        | `{{BASE_URL}}/api/sos`      |
| **Auth**       | Bearer `{{TOKEN}}`          |
| **Body (raw JSON)** | ↓                      |

```json
{
  "lat": 28.6139,
  "lng": 77.2090,
  "accuracy": 10.5,
  "category": "MEDICAL",
  "message": "Need help urgently!",
  "transport": "ONLINE"
}
```

> Valid `category` values: `MEDICAL`, `DISASTER`, `TRAPPED`, `SECURITY`, `OTHER`  
> Valid `transport` values: `ONLINE`, `MESH`, `BOTH`

> 💡 Save the SOS ID:
> ```javascript
> pm.environment.set("SOS_ID", pm.response.json().sos.id);
> ```

**Expected Response `201`:**
```json
{
  "message": "SOS dispatched successfully",
  "sos": {
    "id": "...",
    "triggeredBy": { "displayName": "...", "email": "..." },
    "location": { "type": "Point", "coordinates": [77.209, 28.6139] },
    "accuracyMeters": 10.5,
    "category": "MEDICAL",
    "message": "Need help urgently!",
    "transport": "ONLINE",
    "status": "ACTIVE",
    "notes": [],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Test Cases:**

| Scenario | Body | Expected Status |
| -------- | ---- | --------------- |
| ✅ Full valid body | As above | `201` |
| ✅ Minimal body (only lat/lng) | `{ "lat": 28.61, "lng": 77.20 }` | `201` (defaults: category=OTHER, transport=ONLINE) |
| ✅ Invalid category (defaults to OTHER) | `"category": "FIRE"` | `201` with `category: "OTHER"` |
| ❌ Missing lat | Remove `lat` | `400` — "lat and lng coordinates are required" |
| ❌ Missing lng | Remove `lng` | `400` |
| ❌ Non-numeric lat | `"lat": "abc"` | `400` — "lat and lng must be valid numbers" |
| ❌ lat out of range | `"lat": 999` | `400` — "lat must be between -90 and 90" |
| ❌ Rate limit exceeded | Send 3rd request within 30s | `429` — "SOS rate limit exceeded..." |
| ❌ No token | Remove Authorization header | `401` |

---

### 7.2 `GET /api/sos/:id` — Get a single SOS event

| Field      | Value                                |
| ---------- | ------------------------------------ |
| **Method** | GET                                  |
| **URL**    | `{{BASE_URL}}/api/sos/{{SOS_ID}}`    |
| **Auth**   | Bearer `{{TOKEN}}` (creator or admin)|

**Expected Response `200`:**
```json
{
  "sos": {
    "id": "...",
    "triggeredBy": { ... },
    "location": { ... },
    "status": "ACTIVE",
    ...
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Creator views their own SOS | `200` |
| ✅ Admin views any SOS | `200` (with admin token) |
| ❌ Different non-admin user views | `403` — "Access denied" |
| ❌ Invalid ID format | `400` — "Invalid SOS event ID" |
| ❌ Non-existent SOS ID | `404` — "SOS event not found" |

---

### 7.3 `PUT /api/sos/:id/acknowledge` — Acknowledge SOS (Admin only)

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| **Method** | PUT                                                |
| **URL**    | `{{BASE_URL}}/api/sos/{{SOS_ID}}/acknowledge`      |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}` (approved admin required) |

**Expected Response `200`:**
```json
{
  "message": "SOS event acknowledged",
  "sos": {
    "status": "ACKNOWLEDGED",
    "acknowledgedBy": "...",
    ...
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Admin acknowledges ACTIVE SOS | `200` |
| ❌ SOS already acknowledged | `404` — "SOS event not found or is already acknowledged/resolved" |
| ❌ Non-admin user | `403` — Forbidden |
| ❌ No token | `401` |

---

### 7.4 `PUT /api/sos/:id/resolve` — Resolve SOS (Admin only)

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| **Method** | PUT                                           |
| **URL**    | `{{BASE_URL}}/api/sos/{{SOS_ID}}/resolve`     |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}`                      |

**Expected Response `200`:**
```json
{
  "message": "SOS event resolved",
  "sos": {
    "status": "RESOLVED",
    "resolvedBy": "...",
    ...
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Admin resolves ACTIVE SOS | `200` |
| ✅ Admin resolves ACKNOWLEDGED SOS | `200` |
| ❌ SOS already RESOLVED | `404` — "SOS event not found or is already resolved" |
| ❌ Non-admin user | `403` |

---

### 7.5 `POST /api/sos/:id/notes` — Add a note to SOS (Admin only)

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| **Method**     | POST                                        |
| **URL**        | `{{BASE_URL}}/api/sos/{{SOS_ID}}/notes`     |
| **Auth**       | Bearer `{{ADMIN_TOKEN}}`                    |
| **Body (raw JSON)** | ↓                                      |

```json
{
  "text": "Dispatched paramedics to the location. ETA 10 minutes."
}
```

**Expected Response `201`:**
```json
{
  "message": "Note added successfully",
  "sos": {
    "notes": [
      {
        "authorId": "...",
        "text": "Dispatched paramedics to the location. ETA 10 minutes.",
        "timestamp": "..."
      }
    ],
    ...
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Admin adds note | `201` |
| ❌ Empty text | `400` — "Note text is required" |
| ❌ Missing text field | `400` |
| ❌ Non-admin user | `403` |
| ❌ Invalid SOS ID | `400` |
| ❌ Non-existent SOS | `404` |

---

## 8. Admin Module

**Base path:** `/api/admin`  
**Auth required:** All routes — `Authorization: Bearer {{ADMIN_TOKEN}}`  
**Double guard:** JWT valid **+** `adminApproved: true` verified from DB on every request.

---

### 8.1 `GET /api/admin/sos` — Live SOS event list (map feed)

| Field      | Value                          |
| ---------- | ------------------------------ |
| **Method** | GET                            |
| **URL**    | `{{BASE_URL}}/api/admin/sos`   |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}`       |

**Query Parameters:**

| Param    | Default  | Options                              |
| -------- | -------- | ------------------------------------ |
| `status` | `ACTIVE` | `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED` |
| `page`   | `1`      | Any positive integer                 |
| `limit`  | `50`     | 1–100                                |

**Example URLs:**
- `{{BASE_URL}}/api/admin/sos` → ACTIVE events
- `{{BASE_URL}}/api/admin/sos?status=ACKNOWLEDGED&page=1&limit=10`
- `{{BASE_URL}}/api/admin/sos?status=RESOLVED`

**Expected Response `200`:**
```json
{
  "events": [ { ... }, { ... } ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Admin fetches ACTIVE events | `200` |
| ✅ Filter by ACKNOWLEDGED | `?status=ACKNOWLEDGED` → `200` |
| ✅ Pagination | `?page=2&limit=5` → `200` |
| ❌ No admin token | `401` / `403` |
| ❌ Non-admin (CITIZEN) token | `403` |

---

### 8.2 `GET /api/admin/sos/history` — Resolved SOS history

| Field      | Value                                 |
| ---------- | ------------------------------------- |
| **Method** | GET                                   |
| **URL**    | `{{BASE_URL}}/api/admin/sos/history`  |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}`              |

**Query Parameters:**

| Param      | Type   | Description                          |
| ---------- | ------ | ------------------------------------ |
| `page`     | number | Page number (default: 1)             |
| `limit`    | number | Results per page (default: 20, max: 100) |
| `from`     | ISO date | Filter events created after this date |
| `to`       | ISO date | Filter events created before this date |
| `category` | string | Filter by: `MEDICAL`, `DISASTER`, `TRAPPED`, `SECURITY`, `OTHER` |

**Example URLs:**
- `{{BASE_URL}}/api/admin/sos/history`
- `{{BASE_URL}}/api/admin/sos/history?from=2026-09-01&to=2026-09-20`
- `{{BASE_URL}}/api/admin/sos/history?category=MEDICAL&page=1&limit=10`

**Expected Response `200`:**
```json
{
  "events": [ { "status": "RESOLVED", ... } ],
  "pagination": { "total": 5, "page": 1, "limit": 20, "pages": 1 }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Fetch all history | `200` |
| ✅ Date range filter | `?from=2026-09-01&to=2026-09-30` → `200` |
| ✅ Category filter | `?category=MEDICAL` → `200` |
| ❌ Non-admin | `403` |

---

### 8.3 `GET /api/admin/users` — User directory search

| Field      | Value                          |
| ---------- | ------------------------------ |
| **Method** | GET                            |
| **URL**    | `{{BASE_URL}}/api/admin/users` |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}`       |

**Query Parameters:**

| Param   | Type   | Description                              |
| ------- | ------ | ---------------------------------------- |
| `q`     | string | Search by name or email (case-insensitive) |
| `page`  | number | Page (default: 1)                        |
| `limit` | number | Per page (default: 20, max: 100)         |

**Example URLs:**
- `{{BASE_URL}}/api/admin/users` → all users
- `{{BASE_URL}}/api/admin/users?q=alice`
- `{{BASE_URL}}/api/admin/users?q=example.com&page=1&limit=5`

**Expected Response `200`:**
```json
{
  "users": [ { "email": "...", "displayName": "...", ... } ],
  "pagination": { "total": 10, "page": 1, "limit": 20, "pages": 1 }
}
```

> ⚠️ `passwordHash` and `fcmToken` fields are **never** returned by this endpoint.

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Admin searches users | `200` |
| ✅ Search by partial name/email | `?q=ali` → `200` |
| ❌ Non-admin token | `403` |

---

### 8.4 `POST /api/admin/admins` — Promote a user to Admin

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Method**     | POST                            |
| **URL**        | `{{BASE_URL}}/api/admin/admins` |
| **Auth**       | Bearer `{{ADMIN_TOKEN}}`        |
| **Body (raw JSON)** | ↓                          |

```json
{
  "email": "newadmin@example.com"
}
```

**Expected Response `200`:**
```json
{
  "message": "New Admin (newadmin@example.com) has been promoted to admin",
  "user": {
    "id": "...",
    "displayName": "New Admin",
    "email": "newadmin@example.com",
    "role": "ADMIN",
    "adminApproved": true
  }
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Promote existing CITIZEN | `200` |
| ✅ Approve a pending ADMIN | User registered as ADMIN but not yet approved → `200` |
| ❌ Email not found | `404` — "No user found with this email" |
| ❌ Already approved admin | `409` — "User is already an approved admin" |
| ❌ Missing email field | `400` — "email is required" |
| ❌ Non-admin caller | `403` |

---

### 8.5 `DELETE /api/admin/admins/:userId` — Revoke Admin status

| Field      | Value                                                   |
| ---------- | ------------------------------------------------------- |
| **Method** | DELETE                                                  |
| **URL**    | `{{BASE_URL}}/api/admin/admins/{{TARGET_USER_ID}}`      |
| **Auth**   | Bearer `{{ADMIN_TOKEN}}`                                |

**Expected Response `200`:**
```json
{
  "message": "Target Admin has been demoted to CITIZEN",
  "userId": "..."
}
```

**Test Cases:**

| Scenario | Expected Status |
| -------- | --------------- |
| ✅ Demote another admin | `200` |
| ❌ Self-demotion (your own userId) | `400` — "You cannot revoke your own admin status" |
| ❌ User is not an admin | `400` — "User is not an admin" |
| ❌ User not found | `404` |
| ❌ Invalid userId format | `400` — "Invalid user ID" |
| ❌ Non-admin caller | `403` |

---

## 9. Error Cases Cheat Sheet

### Common HTTP Status Codes

| Code  | Meaning              | Common Causes                                |
| ----- | -------------------- | -------------------------------------------- |
| `200` | OK                   | Successful GET / PUT / DELETE                |
| `201` | Created              | Successful POST (new resource)               |
| `400` | Bad Request          | Missing/invalid fields, validation failures  |
| `401` | Unauthorized         | Missing or invalid JWT token                 |
| `403` | Forbidden            | Valid token but insufficient role/ownership  |
| `404` | Not Found            | Resource doesn't exist or ownership mismatch |
| `409` | Conflict             | Duplicate record (email, link, contact)      |
| `429` | Too Many Requests    | Rate limit exceeded                          |
| `500` | Internal Server Error| Unexpected server-side error                 |
| `503` | Service Unavailable  | External service not configured (e.g. Google)|

---

### Authorization Header Format

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Role-based Access Quick Reference

| Module             | CITIZEN | ADMIN (approved) |
| ------------------ | :-----: | :--------------: |
| Auth register/login | ✅      | ✅               |
| User profile       | ✅      | ✅               |
| Contacts           | ✅      | ✅               |
| Family links       | ✅      | ✅               |
| SOS trigger        | ✅      | ✅               |
| SOS get by ID      | ✅ (own)| ✅ (all)         |
| SOS acknowledge    | ❌      | ✅               |
| SOS resolve        | ❌      | ✅               |
| SOS add note       | ❌      | ✅               |
| Admin SOS list     | ❌      | ✅               |
| Admin SOS history  | ❌      | ✅               |
| Admin users list   | ❌      | ✅               |
| Admin promote      | ❌      | ✅               |
| Admin demote       | ❌      | ✅               |

---

### Recommended Test Order

1. **Register** Citizen A → save `TOKEN`
2. **Register** Citizen B → save token separately
3. **Login** Citizen A → verify token refresh
4. **Complete Profile** (Citizen A) → verify `profileComplete: true`
5. **Update FCM Token** (Citizen A)
6. **Add Contact** (Citizen A adds Citizen B) → save `CONTACT_ID`
7. **Get Contacts** → verify list
8. **Delete Contact** → verify removal
9. **Family Link Request** (A → B) → save `LINK_ID`
10. **Accept Link** (as Citizen B)
11. **Get My Links** → verify ACCEPTED
12. **Get Child Location** (as A, child=B)
13. **Trigger SOS** (Citizen A) → save `SOS_ID`
14. **Get SOS by ID** (Citizen A)
15. **Register Admin** → have an approved admin promote via DB or `POST /api/admin/admins`
16. **Login Admin** → save `ADMIN_TOKEN`
17. **Admin: Get Active SOS**
18. **Admin: Acknowledge SOS** → verify ACKNOWLEDGED
19. **Admin: Add Note to SOS**
20. **Admin: Resolve SOS** → verify RESOLVED
21. **Admin: Get SOS History** → verify RESOLVED event appears
22. **Admin: Get Users** → search test
23. **Admin: Promote User**
24. **Admin: Demote User**
25. **Revoke Family Link**
