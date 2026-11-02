# GCS CONNECT — System Architecture & Design Specification
**Document Version:** 1.0.0  
**Phase:** 0 & 1 — System Architecture  
**Author:** Principal Software Architect & Cryptography Lead, Global Crest Solutions  
**Date:** November 2, 2026  
**Status:** APPROVED & BASELINED  

---

## 1. System Vision & Design Philosophy

**GCS CONNECT** is built on a fundamental security principle:  
> **The server is an untrusted courier.**  
> The backend handles routing, delivery, authentication, and signaling, but it **never possesses the cryptographic keys to read messages, view media, or decrypt audio/video call streams.**

### 1.1 Architectural Principles
1. **Zero-Knowledge Core:** Plaintext messages and media never leave the user's browser unencrypted.
2. **Device-Centric Identity:** Cryptographic identity is bound to physical devices, not usernames or passwords.
3. **Decoupled Real-time & Presentation:** Next.js powers the responsive client UI, while an Express + Socket.IO server manages authenticated real-time pipelines and WebRTC signaling.
4. **Resilient Offline Sync:** Full message ratchet state and message history reside client-side in encrypted `IndexedDB`.
5. **Auditable & Verifiable:** Cryptographic operations adhere strictly to published test vectors and open standards (Web Crypto API, X3DH, Double Ratchet).

---

## 2. High-Level Component Architecture

```mermaid
flowchart TD
    subgraph ClientBrowser["Client Web Browser (Desktop / Mobile)"]
        UI["Next.js UI Layer (Tailwind / Black & Emerald)"]
        CryptoEngine["Cryptographic Engine (Web Crypto / X3DH / Double Ratchet)"]
        LocalStore["Local Encrypted Vault (IndexedDB - idb)"]
        SocketClient["Socket.IO Client (WSS)"]
        WebRTCClient["WebRTC Media Engine (getUserMedia / RTCPeerConnection)"]
        
        UI <--> CryptoEngine
        CryptoEngine <--> LocalStore
        UI <--> SocketClient
        UI <--> WebRTCClient
    end

    subgraph EdgeLayer["Edge / Network Layer (Hostinger)"]
        Nginx["Nginx Reverse Proxy (TLS 1.3 / WSS Termination)"]
    end

    subgraph BackendServices["Backend Application Services (Node.js 20 LTS)"]
        AuthService["Auth & Device Service (Argon2id, Session Registry)"]
        KeyService["E2EE Key Directory (Identity, Signed & One-Time Prekeys)"]
        MessageRouter["Message Broker & Delivery Router (Socket.IO Engine)"]
        MediaService["Encrypted Media Vault Service (Chunked Ingestion)"]
        SignalingService["WebRTC Signaling Hub (SDP / ICE Exchange)"]
        AdminService["Admin Audit & Compliance Engine"]
    end

    subgraph DataTier["Data Tier"]
        MySQL[("MySQL 8+ Production Database (Prisma ORM)")]
        EncryptedStorage[("Hostinger Encrypted Media Storage")]
    end

    subgraph NATTraversal["NAT Traversal Infrastructure"]
        Coturn["Coturn STUN / TURN Relay (Dedicated VPS / Managed)"]
    end

    SocketClient <-->|WSS via Nginx| Nginx
    UI <-->|HTTPS via Nginx| Nginx
    WebRTCClient <-->|ICE Gathering / Media Relay| Coturn
    WebRTCClient <-->|SRTP Media Stream (Direct P2P)| WebRTCClient

    Nginx <--> AuthService
    Nginx <--> KeyService
    Nginx <--> MessageRouter
    Nginx <--> MediaService
    Nginx <--> SignalingService
    Nginx <--> AdminService

    AuthService --> MySQL
    KeyService --> MySQL
    MessageRouter --> MySQL
    MediaService --> MySQL
    MediaService --> EncryptedStorage
    AdminService --> MySQL
```

---

## 3. Core Data & Security Flows

### 3.1 Authentication & Device Session Lifecycle

Only system administrators can create accounts. Once created, a user is invited or given activation credentials.

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    actor User
    participant Frontend as Client (Browser)
    participant AuthAPI as Auth Service
    participant DB as MySQL Database
    participant KeyDir as Key Directory

    Admin->>AuthAPI: Create User Account (Role, Email, Initial Temp Password)
    AuthAPI->>DB: Store user record with Argon2id hash (status: PENDING_ACTIVATION)
    
    User->>Frontend: Access /login with Credentials
    Frontend->>AuthAPI: POST /api/auth/login {email, password, deviceFingerprint}
    AuthAPI->>DB: Verify Argon2id hash & check account status
    AuthAPI-->>Frontend: Set HttpOnly, Secure, SameSite=Strict Session Cookie
    
    Note over Frontend,KeyDir: Device Enrollment & Key Registration
    Frontend->>Frontend: Generate Identity KeyPair, Signed Prekey, and 100 One-Time Prekeys
    Frontend->>KeyDir: POST /api/keys/register {identityKey, signedPrekey, oneTimePrekeys}
    KeyDir->>DB: Store Public Key Bundles (Private keys NEVER transmitted)
    Frontend->>Frontend: Securely persist Private Keys in IndexedDB (idb)
```

---

### 3.2 End-to-End Encrypted Messaging (X3DH + Double Ratchet)

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Sender)
    participant AliceVault as Alice IndexedDB
    participant Server as GCS CONNECT Backend
    participant DB as MySQL DB
    participant BobVault as Bob IndexedDB
    actor Bob as Bob (Recipient)

    Alice->>Alice: Drafts message "Connect Freely."
    alt First message to Bob (No existing ratchet session)
        Alice->>Server: GET /api/keys/prekey-bundle/bob
        Server->>DB: Retrieve Bob's Identity Key, Signed Prekey & 1 One-Time Prekey (OPK)
        Server->>DB: Mark OPK as consumed
        Server-->>Alice: Return Bob's Prekey Bundle
        Alice->>Alice: Perform X3DH Key Agreement (compute master shared secret SK)
        Alice->>Alice: Initialize Double Ratchet Sending Chain
    end

    Alice->>Alice: Ratchet forward: compute Message Key (MK)
    Alice->>Alice: Encrypt plaintext using AES-256-GCM (Message Key + Nonce)
    Alice->>AliceVault: Store local decrypted copy in IndexedDB
    Alice->>Server: Socket event: "message:send" {to: Bob, ciphertext, ephemeralKey, iv, tag}
    Server->>DB: Persist ciphertext record (Status: SENT)
    Server-->>Alice: Socket event: "message:receipt" {messageId, status: SENT}
    
    alt Bob is Online
        Server->>Bob: Socket event: "message:new" {messageId, sender: Alice, ciphertext, ephemeralKey, iv, tag}
        Bob->>Bob: Double Ratchet receive: compute matching Message Key
        Bob->>Bob: Decrypt ciphertext using AES-256-GCM
        Bob->>BobVault: Store decrypted message in IndexedDB
        Bob->>Server: Socket event: "message:read" {messageId}
        Server->>DB: Update receipt (Status: READ)
        Server->>Alice: Socket event: "message:receipt" {messageId, status: READ}
    else Bob is Offline
        Note over Server,DB: Message stored as ciphertext in MySQL awaiting Bob's next sync
        Bob->>Server: Reconnects & sends "sync:request" {lastSyncTimestamp}
        Server->>Bob: Delivers unread ciphertext backlog
        Bob->>Bob: Decrypts sequentially in Double Ratchet order
    end
```

---

### 3.3 Client-Side Encrypted Media Pipeline

Plaintext images, videos, audio notes, and files are **never** uploaded directly.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice
    participant Browser as Browser Client
    participant Server as GCS CONNECT Backend
    participant Storage as Hostinger Storage
    actor Bob as Bob

    Alice->>Browser: Selects high-resolution video / image
    Browser->>Browser: Generate ephemeral 256-bit Media Encryption Key (MEK)
    Browser->>Browser: Encrypt file buffer locally via AES-256-GCM
    Browser->>Browser: Generate client-side encrypted thumbnail
    Browser->>Browser: Compute SHA-256 checksum of ciphertext
    Browser->>Server: POST /api/media/upload (Encrypted payload, checksum, size)
    Server->>Server: Validate MIME type, size limit, virus/entropy signature
    Server->>Storage: Save encrypted file to /storage/vault/{uuid}.enc
    Server-->>Browser: Return media identifier {fileId: "uuid"}
    
    Note over Browser,Bob: Alice sends message with MEK encrypted inside E2EE payload
    Browser->>Bob: E2EE Message containing {fileId: "uuid", mek: [Encrypted with Double Ratchet], iv, tag, checksum}
    
    Bob->>Bob: Decrypts message to obtain fileId & MEK
    Bob->>Server: GET /api/media/download/{fileId}
    Server->>Storage: Retrieve ciphertext
    Server-->>Bob: Stream encrypted bytes
    Bob->>Bob: Verify SHA-256 checksum & decrypt with MEK in browser memory
    Bob->>Bob: Render image/video via Blob URL (URL.createObjectURL)
```

---

### 3.4 WebRTC 1-to-1 Voice & Video Calling Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Caller (Alice)
    participant Socket as Socket.IO Signaling Server
    participant Coturn as Coturn STUN / TURN Server
    actor Bob as Callee (Bob)

    Alice->>Socket: Emit "call:initiate" {targetUserId: Bob, callType: "video"}
    Socket->>Bob: Emit "call:incoming" {caller: Alice, callType: "video", callId}
    
    Bob->>Socket: Emit "call:accept" {callId}
    Socket->>Alice: Emit "call:accepted" {callId}

    par ICE Gathering
        Alice->>Coturn: Query STUN/TURN for public IP & relay candidates
        Bob->>Coturn: Query STUN/TURN for public IP & relay candidates
        Coturn-->>Alice: Return ICE Candidates
        Coturn-->>Bob: Return ICE Candidates
    end

    Alice->>Alice: Create WebRTC Offer (SDP)
    Alice->>Socket: Emit "call:signal" {type: "offer", sdp}
    Socket->>Bob: Relay "call:signal" {type: "offer", sdp}

    Bob->>Bob: Set Remote Description (Alice SDP) & Create Answer
    Bob->>Socket: Emit "call:signal" {type: "answer", sdp}
    Socket->>Alice: Relay "call:signal" {type: "answer", sdp}

    Alice->>Socket: Exchange ICE candidates
    Socket->>Bob: Relay ICE candidates

    Note over Alice,Bob: Media Stream Established
    alt Direct P2P Available
        Alice<<-->>Bob: Direct SRTP Encrypted Audio/Video (DTLS-SRTP)
    else Symmetric NAT / Firewall Blocking Direct P2P
        Alice<<-->>Coturn: SRTP media relay over UDP/TLS
        Coturn<<-->>Bob: SRTP media relay over UDP/TLS
        Note over Coturn: TURN server forwards encrypted SRTP packets without ability to inspect media
    end
```

---

## 4. Database Entity Relationships (ERD)

```mermaid
erDiagram
    users ||--o{ user_sessions : has
    users ||--o{ devices : owns
    users ||--o{ conversation_members : participates
    users ||--o{ audit_logs : triggers
    users ||--o{ user_blocks : blocks

    devices ||--o{ encryption_identity_keys : registers
    devices ||--o{ signed_prekeys : publishes
    devices ||--o{ one_time_prekeys : publishes
    devices ||--o{ messages : sends

    conversations ||--o{ conversation_members : contains
    conversations ||--o{ messages : logs
    conversations ||--o{ calls : hosts

    messages ||--o{ attachments : includes
    messages ||--o{ message_receipts : tracks
    messages ||--o{ message_reactions : receives

    calls ||--o{ call_participants : includes

    users {
        string id PK "UUID"
        string email UK
        string password_hash "Argon2id"
        string full_name
        string role "ADMIN | USER"
        string status "ACTIVE | SUSPENDED | PENDING"
        datetime created_at
        datetime updated_at
    }

    devices {
        string id PK "UUID"
        string user_id FK
        string device_name
        string device_fingerprint UK
        datetime last_seen_at
        boolean is_active
    }

    encryption_identity_keys {
        string id PK "UUID"
        string device_id FK
        string public_identity_key "Base64 Curve25519"
        datetime created_at
    }

    signed_prekeys {
        string id PK "UUID"
        string device_id FK
        int key_id
        string public_key "Base64"
        string signature "Base64 signed by Identity Key"
        datetime created_at
    }

    one_time_prekeys {
        string id PK "UUID"
        string device_id FK
        int key_id
        string public_key "Base64"
        boolean is_consumed
        datetime created_at
    }

    conversations {
        string id PK "UUID"
        string type "DIRECT | GROUP"
        string title "Nullable"
        datetime created_at
        datetime updated_at
    }

    messages {
        string id PK "UUID"
        string conversation_id FK
        string sender_device_id FK
        text encrypted_payload "Base64 Ciphertext"
        string initialization_vector "Base64 IV"
        string auth_tag "Base64 Auth Tag"
        string recipient_device_id "Nullable for multi-device"
        string message_type "TEXT | MEDIA | CALL_EVENT"
        boolean is_deleted_for_all
        datetime expires_at "Disappearing messages"
        datetime created_at
    }

    attachments {
        string id PK "UUID"
        string message_id FK
        string storage_path
        string encrypted_mime_type
        int file_size_bytes
        string ciphertext_sha256
        datetime created_at
    }

    calls {
        string id PK "UUID"
        string conversation_id FK
        string initiator_id FK
        string call_type "VOICE | VIDEO"
        string status "MISSED | COMPLETED | REJECTED"
        int duration_seconds
        datetime started_at
        datetime ended_at
    }
```

---

## 5. Official Black & Emerald Design System Specifications

The visual design system must enforce brand consistency across all viewports:

| Token Name | Hex Code | Visual Application |
| :--- | :--- | :--- |
| **`bg-primary`** | `#121816` | Main window background, global application canvas |
| **`accent-emerald`** | `#00A879` | Primary CTA buttons, active tabs, unread badges, sent checkmarks |
| **`pale-mint`** | `#B6F1D9` | Emerald hover highlights, subtle focus rings, badge text |
| **`surface-secondary`** | `#E9EFEC` | Light contrast elements, modal headers (light mode fallback) |
| **`card-bg`** | `#1C2420` | Message containers, dropdown menus, search inputs, modal cards |
| **`sidebar-bg`** | `#151D19` | Left chat list navigation, contact details drawer, admin sidebar |
| **`msg-received`** | `#25372E` | Incoming message bubble background |
| **`msg-sent`** | `#205B45` | Outgoing message bubble background |
| **`text-main`** | `#F0F5F1` | Primary headings, active contact names, message text |
| **`text-secondary`**| `#A4B5AA` | Timestamps, status text, preview snippets, unread indicators |
| **`border-emerald`** | `#31463A` | Subtle dividers, card borders, active input borders |
| **`status-error`** | `#D94D55` | Call disconnect button, validation errors, destructive actions |
| **`status-warning`**| `#D99B31` | Security alerts, reconnecting toast, self-destructing countdowns |
