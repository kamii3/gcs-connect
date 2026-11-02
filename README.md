# GCS CONNECT — Enterprise Secure Communications Platform
> **"Connect Freely. Communicate Securely."**  
> An enterprise-grade, browser-based secure communication platform engineered by **Global Crest Solutions (GCS)**.

[![Security Standard](https://img.shields.io/badge/OWASP%20ASVS-5.0.0%20Level%202%2F3-00A879?style=flat-square)](file:///home/ikram/Desktop/My%20Projects/gcs/ASVS_CHECKLIST.md)
[![Automated Tests](https://img.shields.io/badge/Tests-162%20Passed%20(100%25)-00A879?style=flat-square)](file:///home/ikram/Desktop/My%20Projects/gcs/scripts/run-all-tests.sh)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.2%20(App%20Router)-black?style=flat-square)](file:///home/ikram/Desktop/My%20Projects/gcs/src/app/page.tsx)
[![Encryption](https://img.shields.io/badge/E2EE-X3DH%20%2B%20Double%20Ratchet-B6F1D9?style=flat-square)](file:///home/ikram/Desktop/My%20Projects/gcs/src/lib/crypto/double-ratchet.ts)
[![Design System](https://img.shields.io/badge/Theme-Black%20%26%20Emerald-121816?style=flat-square)](file:///home/ikram/Desktop/My%20Projects/gcs/src/lib/design-tokens.ts)

---

## 🔒 The Zero-Plaintext Security Invariant

GCS CONNECT operates on a **strict zero-knowledge server architecture**:
1. **The Server is an Untrusted Courier:** Express, Socket.IO, and MySQL 8+ store and route ciphertext envelopes only.
2. **Zero Plaintext Storage:** Message contents, media payloads, thumbnails, and private keys never touch the database or backend filesystems in plaintext.
3. **Client-Side Cryptography:** All cryptographic key agreements (X3DH), ratchets (Double Ratchet), and authenticated file encryptions (AES-256-GCM + SHA-256) execute inside the browser's native Web Crypto API sandbox.
4. **Forward Secrecy & Post-Compromise Security:** Every exchanged message advances symmetric ratchets and generates ephemeral DH keypairs, ensuring prior messages cannot be decrypted even if a long-term key is later compromised.

---

## 🎨 Permanent Black & Emerald Design System

GCS CONNECT enforces an obsidian dark interface built with the permanent Black & Emerald brand palette across all pages, modals, and components:

| Token Name | HEX Value | Semantic Usage |
| :--- | :---: | :--- |
| **Obsidian Deep Background** | `#121816` | Global page background, outer framing |
| **Sidebar & Navigation** | `#151D19` | Left chat list navigation, modal headers |
| **Card & Panel Background** | `#1C2420` | Profile cards, prekey inspector, admin tables |
| **Emerald Primary Accent** | `#00A879` | Active buttons, verified badges, call controls |
| **Mint Highlight** | `#B6F1D9` | Headings, active states, glowing accents |
| **Sent Message Bubble** | `#205B45` | Outgoing encrypted chat bubbles |
| **Received Message Bubble** | `#25372E` | Incoming encrypted chat bubbles |
| **Subtle Emerald Border** | `#31463A` | Structural dividers, input field borders |
| **Danger / Hangup** | `#D94D55` | Call end, account suspension, destructive action |
| **Warning** | `#D99B31` | Key replenishment alerts, security warnings |
| **Primary Text** | `#F0F5F1` | Main readability body text |
| **Secondary Text** | `#A4B5AA` | Timestamps, metadata, device descriptions |

---

## 🏗️ Architecture & Core Components

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       CLIENT RUNTIME (Browser / PWA)                                   │
│                                                                                                        │
│  ┌──────────────────────┐  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────┐  │
│  │   Next.js 14 App     │  │  Client Crypto Vault  │  │   Messaging Client    │  │  WebRTC Manager  │  │
│  │  - Obsidian UI       │  │  - ECDH P-256 Keys    │  │  - X3DH Protocol      │  │  - Media Streams │  │
│  │  - Chat Dashboard    │  │  - IndexedDB AES-GCM  │  │  - Double Ratchet     │  │  - DTLS-SRTP P2P │  │
│  │  - Admin CMS         │  │  - OPK Inventory (15) │  │  - Safety Numbers     │  │  - Audio / Video │  │
│  └──────────┬───────────┘  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬─────────┘  │
└─────────────┼──────────────────────────┼──────────────────────────┼───────────────────────┼────────────┘
              │                          │                          │                       │
              │ HTTPS REST               │ Ciphertext Upload        │ Socket.IO WSS         │ P2P Audio
              ▼                          ▼                          ▼                       ▼
┌───────────────────────────────────────────────────────────────────────────┐  ┌─────────────────────────┐
│              HOSTINGER PRODUCTION BACKEND (Node.js / Express)             │  │   COTURN STUN / TURN    │
│                                                                           │  │  - NAT Traversal        │
│  ┌──────────────────────┐  ┌───────────────────────┐  ┌────────────────┐  │  │  - ICE Relay            │
│  │    REST API Hub      │  │ Socket.IO Signaling   │  │ Rate Limiter   │  │  └─────────────────────────┘
│  │  - /api/auth         │  │  - Presence & Rooms   │  │  - Token Bucket│  │
│  │  - /api/messages     │  │  - Typing Indicators  │  │  - 30 req/s    │  │
│  │  - /api/calls        │  │  - SDP Offer/Answer   │  │  - Retry-After │  │
│  │  - /api/admin        │  │  - ICE Trickling      │  │  - Auto-evict  │  │
│  └──────────┬───────────┘  └───────────┬───────────┘  └────────────────┘  │
│             │                          │                                  │
│             └──────────────────────────┼──────────────────────────────────┘
│                                        │
│                                        ▼
│                   ┌────────────────────────────────────────┐
│                   │        PRISMA ORM & MYSQL 8+           │
│                   │  - Zero Plaintext Tables               │
│                   │  - UUID Primary Keys                   │
│                   │  - Atomic OPK Consumption              │
│                   │  - Immutable Audit Logs                │
│                   │  - Nightly Encrypted Backups           │
│                   └────────────────────────────────────────┘
```

---

## 📋 Comprehensive Feature Checklist (25 Requirements)

| # | Capability | Architectural Implementation | Verification Test File |
| :-: | :--- | :--- | :--- |
| **1** | **Zero Plaintext Invariant** | No plaintext columns exist; payload/media encrypted client-side | [`security-audit.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/security-audit.test.ts) |
| **2** | **X3DH Key Agreement** | 4-DH master key derivation with One-Time Prekeys and SPK | [`crypto.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/lib/crypto/crypto.test.ts) |
| **3** | **Double Ratchet Protocol** | Symmetric and Diffie-Hellman ratchets per conversation | [`crypto.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/lib/crypto/crypto.test.ts) |
| **4** | **Safety Numbers** | 60-digit mutual fingerprint derived from both public identity keys | [`keys.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/keys.test.ts) |
| **5** | **Prekey Inventory Management** | Identity keys, signed prekeys, and auto-replenished OPK pool | [`keys.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/keys.test.ts) |
| **6** | **Multi-Device Support** | Distinct cryptographic vault and ratchet session per physical device | [`auth.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/auth.test.ts) |
| **7** | **Argon2id Authentication** | Memory-hard password hashing with HttpOnly JWT session cookies | [`auth.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/auth.test.ts) |
| **8** | **Delivery & Read Receipts** | Granular receipt tracking (`SENT`, `DELIVERED`, `READ`) | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **9** | **Disappearing Messages** | Configurable message TTL with background purge cleanup daemon | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **10** | **Edit & Delete for Everyone** | Cryptographic payload zeroing in database; tombstone flags | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **11** | **Emoji Reactions** | Metadata-level reactions without compromising ciphertext payload | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **12** | **Multi-User Groups** | Group conversations with `OWNER` / `ADMIN` / `MEMBER` RBAC | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **13** | **User Privacy & Blocking** | Mutual communication blocking strictly enforced across API & sockets | [`messaging.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/messaging.test.ts) |
| **14** | **Client-Side Encrypted Media** | AES-256-GCM media encryption with SHA-256 integrity verification | [`media.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/media.test.ts) |
| **15** | **Real-Time Socket.IO** | Authenticated WebSocket signaling with conversation rooms | [`socket.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/socket/socket.test.ts) |
| **16** | **User Presence Tracking** | `ONLINE`, `AWAY`, `OFFLINE` status tracking with heartbeat pings | [`socket.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/socket/socket.test.ts) |
| **17** | **WebRTC Voice & Video** | P2P audio/video encrypted via DTLS-SRTP with STUN/TURN ICE | [`calls.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/calls.test.ts) |
| **18** | **Administrative CMS** | User provisioning, role assignment, and device session revocation | [`admin.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/admin.test.ts) |
| **19** | **Compliance Audit Dashboard** | Real-time zero-knowledge verification, OPK count, and call metrics | [`admin.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/admin.test.ts) |
| **20** | **Immutable Audit Logs** | Tamper-evident admin action logging with IP and actor metadata | [`admin.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/routes/admin.test.ts) |
| **21** | **Black & Emerald UI** | Obsidian `#121816` & Emerald `#00A879` design token system | [`design-tokens.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/lib/design-tokens.ts) |
| **22** | **OSI & TCP/IP Layer Audit** | 15 layered controls across Application, Session, Transport, Host | [`security-audit.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/security-audit.test.ts) |
| **23** | **OWASP ASVS 5.0.0 Matrix** | Level 2 baseline and Level 3 cryptographic compliance (V1 to V17) | [`asvs.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/asvs.test.ts) |
| **24** | **10-Step E2E Lifecycle** | Automated multi-user lifecycle from provisioning to password reset | [`e2e-workflow.test.ts`](file:///home/ikram/Desktop/My%20Projects/gcs/src/server/e2e-workflow.test.ts) |
| **25** | **Production Deployment** | Zero-downtime deployment script, Nginx reverse proxy, backups | [`deploy-hostinger.sh`](file:///home/ikram/Desktop/My%20Projects/gcs/scripts/deploy-hostinger.sh) |

---

## ⚡ Quickstart & Local Development

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/globalcrestsolutions/gcs-connect.git
cd gcs-connect
npm install
```

### 2. Configure Environment Variables
Create a local `.env` file:
```ini
DATABASE_URL="mysql://gcs_dev:gcs_dev_password_2026@127.0.0.1:3307/gcs_connect"
PORT=3001
API_PORT=3001
HOST="0.0.0.0"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
JWT_SECRET="gcs_development_secret_key_minimum_32_characters_long_2026"
COOKIE_SIGNING_KEY="gcs_cookie_signing_key_secure_2026"
SESSION_COOKIE_NAME="gcs_session"
NODE_ENV="development"
```

### 3. Initialize Database
```bash
# Push schema to MySQL / MariaDB
npx prisma db push

# Seed initial system administrator
npm run prisma:seed # or npx prisma db seed
```

### 4. Run Development Servers
```bash
# Terminal 1: Real-Time API & Signaling Server (Port 3001)
npm run server

# Terminal 2: Next.js 14 Web Application (Port 3000)
npm run dev
```
Access the application at `http://localhost:3000` and the Administrative CMS at `http://localhost:3000/admin`.

---

## 🧪 Automated Testing & Verification Suite

Execute the unified automation script to verify database synchronization, execute all 16 Vitest test suites, and compile the Next.js production bundle:
```bash
./scripts/run-all-tests.sh
```

### Test Suite Summary:
```
========================================================================
                   ALL AUTOMATION CHECKS PASSED                         
========================================================================
  Prisma Schema Sync    : VERIFIED
  Vitest Test Suites    : 16/16 PASSED (162 Tests)
  Next.js Production    : COMPILED (0 ERRORS, 5/5 Pages)
  Total Pipeline Time   : 59s
========================================================================
```

Individual test suites:
```bash
# Run End-to-End Multi-User Integration Workflow
npx vitest run src/server/e2e-workflow.test.ts

# Run OWASP ASVS 5.0.0 Compliance Verification
npx vitest run src/server/asvs.test.ts

# Run OSI & TCP/IP Layered Security Audit
npx vitest run src/server/security-audit.test.ts

# Run WebRTC Voice & Video Signaling Suite
npx vitest run src/server/routes/calls.test.ts

# Run Cryptographic Storage & Ratchet Tests
npx vitest run src/lib/crypto/crypto.test.ts
```

---

## 🚀 Hostinger Production Deployment

Follow the step-by-step [Hostinger Production Deployment Guide](file:///home/ikram/Desktop/My%20Projects/gcs/HOSTINGER_DEPLOYMENT_GUIDE.md) to launch GCS CONNECT on a Hostinger KVM VPS:

1. **Deploy with One Command:**
   ```bash
   ./scripts/deploy-hostinger.sh
   ```
2. **Setup Automated Nightly Backups (AES-256 Encrypted):**
   ```bash
   ./scripts/backup-db.sh
   ```
3. **Nginx Reverse Proxy & TLS 1.3:**
   See [`deploy/nginx/gcs-connect.conf`](file:///home/ikram/Desktop/My%20Projects/gcs/deploy/nginx/gcs-connect.conf) for production SSL and rate-limiting rules.
4. **Systemd Services:**
   See [`deploy/systemd/gcs-api.service`](file:///home/ikram/Desktop/My%20Projects/gcs/deploy/systemd/gcs-api.service) and [`deploy/systemd/gcs-web.service`](file:///home/ikram/Desktop/My%20Projects/gcs/deploy/systemd/gcs-web.service).

---

## 📄 License & Intellectual Property

Copyright © 2026 **Global Crest Solutions (GCS)**. All Rights Reserved.  
*Connect Freely. Communicate Securely.*
