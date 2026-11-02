# GCS CONNECT — REST API Documentation
**Document Version:** 1.0.0  
**Phase:** 3 — Authentication & Administration  
**Author:** Backend Architecture Lead, Global Crest Solutions  
**Date:** November 2, 2026  
**Status:** IMPLEMENTED & TESTED  

---

## 1. Authentication & Security Headers

All protected endpoints require an active session established either via:
1. **HttpOnly Cookie (Preferred):** `gcs_session=<JWT>` with `SameSite=Strict` and `Secure`.
2. **Authorization Header:** `Authorization: Bearer <JWT>` for automated testing or headless programmatic clients.

The server enforces database-backed session validation:
* Each request verifies that `sessionId` exists in `user_sessions`, is marked `isValid = true`, has not been revoked (`revokedAt = null`), and has not expired.
* Inactive or suspended accounts receive `403 Forbidden` immediately.

---

## 2. Authentication Endpoints (`/api/auth`)

### 2.1 User & Administrator Login
* **Endpoint:** `POST /api/auth/login`
* **Access:** Public (Rate-limited)
* **Description:** Authenticates credentials using memory-hard Argon2id. Binds the session to the physical client device fingerprint.

**Request Body:**
```json
{
  "email": "alice@globalcrestsolutions.com",
  "password": "AliceSecurePass2026!",
  "deviceFingerprint": "fp-alice-workstation-chrome-01",
  "deviceName": "Alice ThinkPad (Chromium)",
  "clientPlatform": "WEB_CHROME"
}
```

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "Login successful.",
  "user": {
    "id": "c1f7b7e2-411a-4c28-98e3-0c4e7f918231",
    "email": "alice@globalcrestsolutions.com",
    "fullName": "Alice Walker",
    "displayName": "Alice (Security)",
    "status": "ACTIVE",
    "roles": ["SECURITY_AUDITOR"]
  },
  "device": {
    "id": "d8a1c902-1823-4e89-a912-384102948102",
    "deviceName": "Alice ThinkPad (Chromium)",
    "deviceFingerprint": "fp-alice-workstation-chrome-01"
  },
  "session": {
    "id": "s9128301-4819-4a02-b918-019284910284",
    "expiresAt": "2026-11-09T07:44:32.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 2.2 Current User Context
* **Endpoint:** `GET /api/auth/me`
* **Access:** Authenticated
* **Description:** Retrieves the identity, device, and session metadata of the caller.

---

### 2.3 Password Change & Session Invalidation
* **Endpoint:** `POST /api/auth/password/change`
* **Access:** Authenticated
* **Description:** Verifies current password with Argon2id, hashes new password with Argon2id, and **force-revokes all other concurrent device sessions** for the account.

**Request Body:**
```json
{
  "currentPassword": "OldPassword2026!",
  "newPassword": "BrandNewSecurePassword2026!"
}
```

---

### 2.4 Active Device Sessions
* **Endpoint:** `GET /api/auth/sessions`
* **Access:** Authenticated
* **Description:** Lists all active, non-revoked sessions belonging to the calling user with IP address and device name.

---

### 2.5 Session Revocation
* **Endpoint:** `POST /api/auth/sessions/revoke`
* **Access:** Authenticated
* **Description:** Revokes a specific active session.

**Request Body:**
```json
{
  "sessionId": "s9128301-4819-4a02-b918-019284910284"
}
```

---

### 2.6 Logout
* **Endpoint:** `POST /api/auth/logout`
* **Access:** Authenticated
* **Description:** Marks the current session as revoked in the database and clears the `gcs_session` cookie.

---

## 3. Administrative Endpoints (`/api/admin`)

*All administrative endpoints strictly require the caller to possess either the `SUPER_ADMIN` or `ADMIN` role. Requests from standard users are rejected with `403 Forbidden`.*

### 3.1 System Overview & Cryptographic Metrics
* **Endpoint:** `GET /api/admin/metrics`
* **Access:** Admin only
* **Description:** Comprehensive overview of system health, active users, registered devices, ciphertext message metrics, encrypted attachment storage, WebRTC calling totals, and cryptographic key pool availability.
* **Security Assurance:** Explicitly verifies zero plaintext messages in MySQL and zero server-side private keys.
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "timestamp": "2026-11-02T10:15:00.000Z",
  "users": { "total": 42, "active": 39, "suspended": 3, "newLast24h": 4 },
  "devices": { "total": 58, "activeSessions": 47 },
  "cryptography": {
    "identityKeysCount": 58,
    "signedPrekeysCount": 58,
    "oneTimePrekeysTotal": 2900,
    "oneTimePrekeysConsumed": 412,
    "oneTimePrekeysAvailable": 2488,
    "zeroPlaintextGuarantee": true,
    "cipherProtocols": ["X3DH", "Double Ratchet", "AES-256-GCM", "DTLS-SRTP"]
  },
  "conversations": { "total": 128, "direct": 110, "group": 18 },
  "messaging": { "totalCiphertextMessages": 14208, "editedCount": 312, "deletedForEveryoneCount": 94, "zeroPlaintextStored": true },
  "storage": { "totalAttachments": 480, "storageSizeBytes": 251658240, "storageFormatted": "240.00 MB" },
  "calling": { "totalCalls": 240, "completedCalls": 218, "cumulativeDurationSeconds": 48920, "cumulativeDurationFormatted": "815m 20s" },
  "compliance": { "auditLogsTotal": 1840, "asvsLevel": "ASVS 5.0.0 Level 2", "status": "COMPLIANT" }
}
```

---

### 3.2 Create User Account
* **Endpoint:** `POST /api/admin/users/create`
* **Access:** Admin only
* **Description:** Only administrators can create accounts in GCS CONNECT.
* **Request Body:**
```json
{
  "email": "engineer@globalcrestsolutions.com",
  "password": "TemporarySecurePass2026!",
  "fullName": "Jane Doe",
  "displayName": "Jane",
  "role": "USER"
}
```

---

### 3.3 List Users (Zero Plaintext Boundary & Filtering)
* **Endpoint:** `GET /api/admin/users?page=1&limit=20&search=Jane&status=ACTIVE`
* **Access:** Admin only
* **Description:** Returns paginated user accounts with device counts and active session counts. Supports searching by name or email, and filtering by status.
* **Security Assurance:** Exposes **zero** message content, private keys, or conversation histories.

---

### 3.4 User Details & Cryptographic Key Bundle Inspector
* **Endpoint:** `GET /api/admin/users/:id/details`
* **Access:** Admin only
* **Description:** Returns user identity metadata, assigned roles, registered devices, active sessions, and cryptographic key bundle status (Identity Key public key, Signed Prekey active count, available OPKs).

---

### 3.5 Account Status Management (Suspend / Reactivate / Delete)
* **Endpoint:** `POST /api/admin/users/:id/status`
* **Access:** Admin only
* **Description:** Suspends, reactivates, or soft-deletes a user. When suspended, all active sessions are immediately revoked. Administrators cannot suspend their own active account.
* **Request Body:**
```json
{
  "status": "SUSPENDED",
  "reason": "Security policy violation"
}
```

---

### 3.6 Assign or Remove Roles
* **Endpoint:** `POST /api/admin/users/:id/role`
* **Access:** Admin only
* **Description:** Assigns or removes roles (`ADMIN`, `SECURITY_AUDITOR`, `USER`) from a user.
* **Request Body:**
```json
{
  "role": "SECURITY_AUDITOR",
  "action": "ASSIGN"
}
```

---

### 3.7 Deactivate Device
* **Endpoint:** `POST /api/admin/devices/:id/revoke`
* **Access:** Admin only
* **Description:** Sets device `isActive: false` and revokes all active sessions bound to that device.

---

### 3.8 Force-Revoke Target User Sessions
* **Endpoint:** `POST /api/admin/users/:id/revoke-sessions`
* **Access:** Admin only
* **Description:** Immediately invalidates all device sessions for the target user.

---

### 3.9 Create User Invitation
* **Endpoint:** `POST /api/admin/invitations/create`
* **Access:** Admin only
* **Description:** Generates an invitation token for user onboarding with expiration.

---

### 3.10 Audit Log Inspection & Filtering
* **Endpoint:** `GET /api/admin/audit-logs?page=1&limit=25&action=USER_STATUS_SUSPENDED&search=admin`
* **Access:** Admin only
* **Description:** Paginated security audit trail tracking administrative and authentication events with filtering by action, actor email, or text search.


---

## 4. Cryptographic Key Management Endpoints (`/api/keys`)

### 4.1 Register Device Keys & Prekey Inventory
* **Endpoint:** `POST /api/keys/register`
* **Access:** Authenticated
* **Description:** Enrolls public identity key, active signed prekey, and a batch of initial one-time prekeys (OPKs) for the authenticated device.

**Request Body:**
```json
{
  "publicIdentityKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "keyAlgorithm": "ECDH-P256",
  "signedPrekey": {
    "keyId": 1,
    "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "signature": "SIG-VERIFIED-V1"
  },
  "oneTimePrekeys": [
    { "keyId": 1, "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..." },
    { "keyId": 2, "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..." }
  ]
}
```

---

### 4.2 Retrieve Prekey Bundle (Atomic OPK Consumption)
* **Endpoint:** `GET /api/keys/prekey-bundle/:targetUserId`
* **Access:** Authenticated
* **Description:** Retrieves target device's identity key and active signed prekey, and atomically claims 1 unconsumed one-time prekey (`is_consumed = TRUE`).

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "bundle": {
    "userId": "b4a1c902-1823-4e89-a912-384102948102",
    "deviceId": "d8a1c902-1823-4e89-a912-384102948102",
    "identityKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "signedPrekey": {
      "keyId": 1,
      "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
      "signature": "SIG-VERIFIED-V1"
    },
    "oneTimePrekey": {
      "keyId": 1,
      "publicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."
    }
  }
}
```

---

### 4.3 Replenish One-Time Prekeys
* **Endpoint:** `POST /api/keys/prekeys/replenish`
* **Access:** Authenticated
* **Description:** Uploads a fresh batch of one-time prekeys when device inventory drops below threshold.

---

### 4.4 Key Inventory Status
* **Endpoint:** `GET /api/keys/status`
* **Access:** Authenticated
* **Description:** Returns device key status, active OPK count, and replenishment recommendation (`needsReplenishment = true` if `< 10` OPKs).

---

### 4.5 Safety Number Verification Keys
* **Endpoint:** `GET /api/keys/safety-number/:targetUserId`
* **Access:** Authenticated
* **Description:** Retrieves both peers' public identity keys for computing the 60-digit fingerprint.

---

### 4.6 Client Encrypted Key Backup
* **Endpoints:** `POST /api/keys/backup` & `GET /api/keys/backup`
* **Access:** Authenticated
* **Description:** Stores and retrieves client-side passphrase-encrypted key vaults.

---

## 5. Conversations Management Endpoints (`/api/conversations`)

### 5.1 Create or Get Direct (1-to-1) Conversation
* **Endpoint:** `POST /api/conversations/direct`
* **Access:** Authenticated
* **Description:** Initiates or retrieves an existing direct conversation with `targetUserId`. Enforces privacy blocking boundaries.

**Request Body:**
```json
{
  "targetUserId": "c1f7b7e2-411a-4c28-98e3-0c4e7f918231"
}
```

---

### 5.2 Create Group Conversation
* **Endpoint:** `POST /api/conversations/group`
* **Access:** Authenticated
* **Description:** Creates a multi-user group conversation with title, members, and optional disappearing timer.

**Request Body:**
```json
{
  "title": "Global Crest Engineering Team",
  "memberUserIds": [
    "c1f7b7e2-411a-4c28-98e3-0c4e7f918231",
    "b4a1c902-1823-4e89-a912-384102948102"
  ],
  "disappearingDurationSeconds": 604800
}
```

---

### 5.3 List Conversations
* **Endpoint:** `GET /api/conversations`
* **Access:** Authenticated
* **Description:** Returns all active conversations ordered by pinned status and latest activity, with member rosters, latest message snippet, and unread counts.

---

### 5.4 Update Conversation Settings
* **Endpoint:** `PUT /api/conversations/:id/settings`
* **Access:** Authenticated
* **Description:** Updates member preferences (`isPinned`, `isMuted`, `isArchived`) or group settings (`title`, `disappearingDurationSeconds`).

---

### 5.5 Clear Conversation History (Local Wipe)
* **Endpoint:** `POST /api/conversations/:id/clear`
* **Access:** Authenticated
* **Description:** Sets `clearedHistoryBefore = now()` for caller, hiding all past messages.

---

### 5.6 Leave Conversation
* **Endpoint:** `DELETE /api/conversations/:id/leave`
* **Access:** Authenticated
* **Description:** Departs a group conversation or dismisses a direct conversation.

---

## 6. Messages & Ciphertext Dispatch Endpoints (`/api/conversations/:id/messages` & `/api/messages`)

### 6.1 Dispatch End-to-End Encrypted Message
* **Endpoint:** `POST /api/conversations/:id/messages`
* **Access:** Authenticated (Active conversation member)
* **Description:** Transmits Double Ratchet encrypted ciphertext. Server persists zero plaintext. Automatically records `SENT` receipt and emits real-time Socket.IO event.

**Request Body:**
```json
{
  "recipientDeviceId": "d8a1c902-1823-4e89-a912-384102948102",
  "messageType": "TEXT",
  "encryptedPayload": "yR54m8K3a9f0B...",
  "initializationVector": "8vP2jH...",
  "authTag": "e7Y1uN...",
  "ephemeralKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "ratchetSequenceNumber": 0,
  "previousChainLength": 0
}
```

---

### 6.2 Retrieve Paginated Message History
* **Endpoint:** `GET /api/conversations/:id/messages?limit=50&cursor=<messageId>`
* **Access:** Authenticated (Active member)
* **Description:** Returns paginated messages filtering out cleared history and expired disappearing messages. Includes delivery receipts and emoji reactions.

---

### 6.3 Edit Message
* **Endpoint:** `PUT /api/messages/:id`
* **Access:** Authenticated (Sender only)
* **Description:** Updates message with newly encrypted ciphertext, setting `isEdited = true` and `editedAt = now()`.

---

### 6.4 Delete Message
* **Endpoint:** `DELETE /api/messages/:id?mode=everyone|me`
* **Access:** Authenticated
* **Description:** When `mode=everyone`, sender permanently wipes ciphertext and sets `isDeletedForEveryone = true`.

---

### 6.5 Record Delivery & Read Receipts
* **Endpoint:** `POST /api/messages/:id/receipt`
* **Access:** Authenticated
* **Description:** Updates message status to `DELIVERED` or `READ`.

**Request Body:**
```json
{
  "status": "READ"
}
```

---

### 6.6 Emoji Reactions
* **Endpoints:** `POST /api/messages/:id/reactions` & `DELETE /api/messages/:id/reactions`
* **Access:** Authenticated
* **Description:** Adds or removes emoji reactions on messages with real-time broadcast.

---

## 7. User Privacy & Directory Endpoints (`/api/users`)

### 7.1 Block User
* **Endpoint:** `POST /api/users/block`
* **Access:** Authenticated
* **Description:** Blocks a user from direct messaging, group invitations, and directory discovery.

---

### 7.2 Unblock User
* **Endpoint:** `DELETE /api/users/block/:targetUserId`
* **Access:** Authenticated
* **Description:** Removes user block.

---

### 7.3 List Blocked Users
* **Endpoint:** `GET /api/users/blocked`
* **Access:** Authenticated
* **Description:** Lists all users blocked by the caller.

---

### 7.4 Search Directory
* **Endpoint:** `GET /api/users/directory?q=<query>`
* **Access:** Authenticated
* **Description:** Searches directory for active users, automatically filtering out blocked users and self.


---

## 8. Encrypted Media & File Storage Endpoints (`/api/media`)

### 8.1 Upload Encrypted Media Ciphertext
* **Endpoint:** `POST /api/media/upload`
* **Access:** Authenticated (Active conversation member)
* **Description:** Persists client-side encrypted media ciphertext (`.bin`) on private host storage. Decryption keys are strictly forbidden and never transmitted. Verifies SHA-256 integrity hash before writing to disk.

**Request Body:**
```json
{
  "messageId": "m1f7b7e2-411a-4c28-98e3-0c4e7f918231",
  "ciphertextBase64": "yR54m8K3a9f0B...",
  "thumbnailCiphertextBase64": "8vP2jH...",
  "encryptedMimeType": "aW1hZ2UvcG5n",
  "ciphertextSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

**Response (HTTP 201 Created):**
```json
{
  "success": true,
  "attachment": {
    "id": "a912c902-1823-4e89-a912-384102948102",
    "messageId": "m1f7b7e2-411a-4c28-98e3-0c4e7f918231",
    "fileSizeBytes": 524288,
    "ciphertextSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "hasThumbnail": true,
    "createdAt": "2026-11-02T08:42:00.000Z"
  }
}
```

---

### 8.2 Stream Encrypted Media Ciphertext
* **Endpoint:** `GET /api/media/:id`
* **Access:** Authenticated (Conversation membership enforced)
* **Description:** Streams raw ciphertext bytes directly from private host storage (`application/octet-stream`). Unauthorized non-members receive HTTP 403 Forbidden.
* **Security Headers:**
  - `Content-Type: application/octet-stream`
  - `X-Ciphertext-SHA256: <hash>`
  - `Cache-Control: private, no-cache, no-store, must-revalidate`

---

### 8.3 Stream Encrypted Thumbnail Ciphertext
* **Endpoint:** `GET /api/media/:id/thumbnail`
* **Access:** Authenticated (Conversation membership enforced)
* **Description:** Streams low-resolution encrypted thumbnail ciphertext for fast client-side rendering.


---

## 9. Real-Time WebSocket Events & Signaling (Socket.IO)

The WebSocket server provides authenticated real-time event streaming. All connections must pass the JWT handshake authentication before joining rooms or emitting events.

### 9.1 Handshake Authentication
* **Transport:** WebSocket / Polling
* **Credentials:** HttpOnly cookie (`gcs_session=<JWT>`) or Handshake Auth (`auth: { token: "<JWT>" }`).
* **Validation:** Cryptographic JWT verification and database-backed session state check (`isValid = true`, `revokedAt = null`, `expiresAt > now`).
* **Rejection:** Unauthenticated connections are terminated immediately with `AUTHENTICATION_FAILED`.

---

### 9.2 Client -> Server Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `conversation:join` | `{ conversationId: string }` | Joins room `conversation:${id}`. **Guarded by DB membership check**; unauthorized users receive `FORBIDDEN`. |
| `conversation:leave` | `{ conversationId: string }` | Leaves room `conversation:${id}`. |
| `typing:start` | `{ conversationId: string }` | Emits typing notification to room peers (debounced with 3s auto-stop). |
| `typing:stop` | `{ conversationId: string }` | Immediately cancels typing notification. |
| `presence:query` | `{ userIds: string[] }` | Queries online status for a list of peer user IDs. |
| `heartbeat` | `{}` | Keepalive ping to update device `lastSeenAt`. |

---

### 9.3 Server -> Client Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `message:new` | `{ id, conversationId, encryptedPayload, initializationVector, authTag, ephemeralKey, ratchetSequenceNumber, createdAt, sender }` | Real-time ciphertext broadcast. Contains zero plaintext. |
| `message:edited` | `{ id, conversationId, encryptedPayload, initializationVector, authTag, isEdited: true, editedAt }` | Real-time message edit broadcast. |
| `message:deleted` | `{ id, conversationId, isDeletedForEveryone: true }` | Real-time message deletion notification. |
| `receipt:updated` | `{ messageId, conversationId, userId, deviceId, status: "DELIVERED" \| "READ", timestamp }` | Real-time delivery/read receipt update. |
| `reaction:updated` | `{ messageId, conversationId, userId, emoji, action: "added" \| "removed" }` | Real-time emoji reaction event. |
| `presence:status` | `{ userId, status: "ONLINE" \| "OFFLINE", timestamp }` | Real-time peer presence change notification. |
| `socket:error` | `{ code, message }` | Socket-level error notification (e.g. `FORBIDDEN`). |

---

## 10. WebRTC Voice & Video Calling Engine (`/api/calls`)

Provides complete 1-to-1 voice and video calling infrastructure with mandatory DTLS-SRTP media encryption. All signaling is relayed via Socket.IO rooms, and call lifecycle states and durations are persisted in MySQL.

### 10.1 WebRTC ICE Configuration
* **Endpoint:** `GET /api/calls/config`
* **Access:** Authenticated
* **Description:** Retrieves the active STUN/TURN ICE server configuration.
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "config": {
    "iceServers": [
      { "urls": "stun:stun.l.google.com:19302" },
      { "urls": "stun:stun1.l.google.com:19302" }
    ],
    "iceCandidatePoolSize": 10
  }
}
```

---

### 10.2 Initiate Call
* **Endpoint:** `POST /api/calls/initiate`
* **Access:** Authenticated (Conversation membership enforced)
* **Description:** Initiates a new 1-to-1 voice or video call. Verifies privacy blocks (returns 403 `USER_BLOCKED`) and checks peer active call status (returns 409 `USER_BUSY`). Notifies the recipient via `call:incoming` socket event.

**Request Body:**
```json
{
  "conversationId": "c1f7b7e2-411a-4c28-98e3-0c4e7f918231",
  "callType": "VOICE"
}
```

**Response (HTTP 201 Created):**
```json
{
  "success": true,
  "call": {
    "id": "call-1823-4e89-a912-384102948102",
    "conversationId": "c1f7b7e2-411a-4c28-98e3-0c4e7f918231",
    "initiatorUserId": "u1f7b7e2-411a-4c28-98e3-0c4e7f918231",
    "callType": "VOICE",
    "status": "INITIATED",
    "startedAt": "2026-11-02T09:45:00.000Z",
    "initiator": {
      "id": "u1f7b7e2-411a-4c28-98e3-0c4e7f918231",
      "fullName": "Alice Calling Lead",
      "displayName": "Alice C.",
      "avatarUrl": null
    },
    "participants": [
      {
        "id": "cp-1",
        "userId": "u1f7b7e2-411a-4c28-98e3-0c4e7f918231",
        "deviceId": "d-1",
        "status": "ACCEPTED"
      },
      {
        "id": "cp-2",
        "userId": "u2f7b7e2-411a-4c28-98e3-0c4e7f918232",
        "deviceId": "d-2",
        "status": "INVITED"
      }
    ]
  }
}
```

---

### 10.3 Respond to Incoming Call
* **Endpoint:** `POST /api/calls/:id/respond`
* **Access:** Authenticated
* **Description:** Callee accepts, declines, or flags busy for an incoming call.

**Request Body:**
```json
{
  "action": "ACCEPT"
}
```
*(Actions: `ACCEPT`, `DECLINE`, `BUSY`)*

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "status": "CONNECTED",
  "connectedAt": "2026-11-02T09:45:05.000Z"
}
```

---

### 10.4 Terminate Call (Hang Up)
* **Endpoint:** `POST /api/calls/:id/end`
* **Access:** Authenticated
* **Description:** Ends an ongoing or initiated call. Atomically updates status to `COMPLETED`, sets `endedAt`, computes elapsed `durationSeconds`, and notifies peers via `call:ended` socket event.

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "Call terminated successfully.",
  "durationSeconds": 142,
  "endedAt": "2026-11-02T09:47:27.000Z"
}
```

---

### 10.5 Call History
* **Endpoint:** `GET /api/calls/history?limit=30`
* **Access:** Authenticated
* **Description:** Returns chronological list of calls for the calling user with duration and peer participant metadata.

**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "calls": [
    {
      "id": "call-1823-4e89-a912-384102948102",
      "conversationId": "c1f7b7e2-411a-4c28-98e3-0c4e7f918231",
      "callType": "VOICE",
      "status": "COMPLETED",
      "durationSeconds": 142,
      "startedAt": "2026-11-02T09:45:00.000Z",
      "connectedAt": "2026-11-02T09:45:05.000Z",
      "endedAt": "2026-11-02T09:47:27.000Z",
      "isOutgoing": true,
      "initiator": {
        "id": "u1f7b7e2-411a-4c28-98e3-0c4e7f918231",
        "fullName": "Alice Calling Lead"
      },
      "participants": [
        {
          "userId": "u2f7b7e2-411a-4c28-98e3-0c4e7f918232",
          "status": "ACCEPTED",
          "user": {
            "id": "u2f7b7e2-411a-4c28-98e3-0c4e7f918232",
            "fullName": "Bob Calling Lead"
          }
        }
      ]
    }
  ]
}
```

---

### 10.6 WebRTC Real-Time Signaling Events (Socket.IO)

| Event (Client -> Server) | Payload | Server Relays To Peer | Description |
| :--- | :--- | :--- | :--- |
| `call:offer` | `{ callId, toUserId, offer }` | `user:${toUserId}` as `call:offer` | SDP offer transmission. Authorized by DB call membership check. |
| `call:answer` | `{ callId, toUserId, answer }` | `user:${toUserId}` as `call:answer` | SDP answer transmission. Authorized by DB call membership check. |
| `call:ice-candidate` | `{ callId, toUserId, candidate }` | `user:${toUserId}` as `call:ice-candidate` | ICE candidate trickle for NAT/firewall traversal. |
| `call:hangup` | `{ callId, toUserId }` | `user:${toUserId}` as `call:hangup` | Real-time call termination notification. |
