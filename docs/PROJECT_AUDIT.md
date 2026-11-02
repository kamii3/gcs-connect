# GCS CONNECT — Initial Project Audit & Environment Assessment
**Document Version:** 1.0.0  
**Phase:** 0 — Initial Project Audit  
**Author:** Principal Software Architect & Cybersecurity Lead, Global Crest Solutions (GCS)  
**Date:** November 2, 2026  
**Status:** APPROVED & BASELINED  

---

## 1. Executive Summary

Global Crest Solutions (GCS) is initiating the engineering of **GCS CONNECT**, an enterprise-grade, browser-based, end-to-end encrypted (E2EE) messaging and real-time communications platform. The official product tagline is:  
> **"Connect Freely. Communicate Securely."**

This audit inspects the current local workspace, existing software assets across the GCS project portfolio, the host operating system, Node.js toolchains, network configurations, database instances, and the target Hostinger production infrastructure.

---

## 2. Workspace & Portfolio Discovery

### 2.1 Workspace Structure
The active workspace directory is `/home/ikram/Desktop/My Projects/gcs`. Inspection of `/home/ikram/Desktop/My Projects/` reveals the following relevant directories:

```
/home/ikram/Desktop/My Projects/
├── gcs/                       # Active GCS CONNECT workspace root
│   └── references/           # Cloned essential security & protocol repositories
│       ├── coturn/           # STUN/TURN server reference implementation
│       ├── libsignal/        # Signal Protocol cryptographic reference
│       ├── owasp-asvs/       # OWASP ASVS v5.0.0_release checklist
│       ├── owasp-cheatsheet-series/ # Cryptography, sessions, WebSockets cheat sheets
│       ├── socket.io/        # Real-time WebSocket engine reference
│       └── webrtc-samples/   # WebRTC audio/video and data channel patterns
├── GCS/                      # Existing corporate agency web platform & CMS
│   ├── app/                  # Next.js 14 App Router pages
│   ├── prisma/               # SQLite database (prisma/gcs.db) with 14 models
│   ├── public/uploads/       # Unencrypted media uploads
│   ├── server.js             # Custom Next.js production server wrapper
│   └── HOSTINGER_DEPLOYMENT.md # Hostinger Cloud deployment guide
└── connect/                  # Empty auxiliary directory
```

### 2.2 Preservation of Existing Assets
* **Separation of Concerns:** The existing platform `/home/ikram/Desktop/My Projects/GCS` is the public marketing site and internal sales CMS for Global Crest Solutions. It is functional, running Next.js 14 with an embedded SQLite database (`gcs.db`).
* **Isolation Rule:** GCS CONNECT must be engineered cleanly within `/home/ikram/Desktop/My Projects/gcs` without modifying, corrupting, or coupling with the corporate marketing portal.

---

## 3. Host System & Runtime Environment Audit

A hardware and software audit was conducted on the development machine:

| Parameter | Detected Value | Assessment |
| :--- | :--- | :--- |
| **Operating System** | Linux kali 6.18.12+kali-amd64 | Supported (Debian/Kali Linux x86_64) |
| **Node.js Runtime** | `v20.20.1` (Active LTS) | **Optimal** — Full support for Fetch API, Web Crypto, ES Modules, and Node 20 LTS primitives. |
| **Package Manager** | `npm v11.20.0` | Compatible with lockfile version 3 and modern dependency overrides. |
| **Git Toolchain** | `git version 2.53.0` | Supported. |
| **C/C++ Compilers** | `gcc`, `g++`, `make` | **Available** — Allows compiling native C/C++ addons (e.g., native `argon2` or WebRTC components if needed). |
| **Browser Engine** | Chromium (`/usr/bin/chromium`) | **Available** — Ready for automated browser testing via Playwright and Chrome DevTools MCP. |
| **Available RAM** | 7.6 GB total (2.9 GB available) | Sufficient for concurrent Next.js compiler, Node.js backend, and dual-browser Playwright test runs. |
| **Disk Space** | 227 GB total (29 GB free on `/dev/sda1`) | Adequate for development, test databases, media storage, and build artifacts. |

---

## 4. Live Production Infrastructure Audit (Hostinger via MCP)

Using direct Hostinger Cloud API integration via the Hostinger MCP tools, live infrastructure records under client account `u797749929` were queried:

### 4.1 Target Hosting Environment
* **Platform:** Hostinger Cloud Hosting (CloudLinux / Containerized Node.js Environment).
* **Live Websites Discovered:**
  - `globalcrestsolutions.com` (Root: `/home/u797749929/domains/globalcrestsolutions.com/public_html`, Node.js application)
  - `beaversbridge.globalcrestsolutions.com` (Node.js application)
  - `potato.globalcrestsolutions.com` (Node.js application)
  - `ikramulhaq.globalcrestsolutions.com` (Node.js application)
* **Proposed Architecture for GCS CONNECT:**
  - Frontend: `connect.globalcrestsolutions.com` or `chat.globalcrestsolutions.com`
  - Real-time API & Signaling Server: `api-connect.globalcrestsolutions.com`

### 4.2 Database Infrastructure
* **Active Remote MySQL Server:** `srv1573.hstgr.io:3306`
* **Provisioned Database:** `u797749929_GCS`
* **Database User:** `u797749929_gcsuser`
* **Allocated Quota:** 6,144 MB (6 GB)
* **Permissions:** Full administrative permissions (Create, Alter, Index, Select, Insert, Update, Delete, Lock tables, References).
* **Remote Access Rules:** Can be bound via Hostinger remote connection whitelist or accessed internally from the Hostinger network.

### 4.3 WebRTC NAT Traversal (STUN / TURN) Critical Finding
> [!WARNING]
> **Hostinger Shared / Cloud Hosting Limitation for TURN:**
> Hostinger Cloud hosting runs behind shared reverse proxies and CloudLinux containers that only expose HTTP/HTTPS ports (80/443). A standard Coturn server requires:
> 1. Inbound UDP/TCP port 3478 (STUN/TURN signaling).
> 2. Inbound UDP/TCP port 5349 (TLS TURN).
> 3. Ephemeral UDP relay port allocation range (typically 49152–65535).
> 
> **Architectural Resolution:**
> The Coturn STUN/TURN daemon cannot run within a shared Hostinger web hosting container. It must run either on:
> - A dedicated **Hostinger KVM VPS** running Ubuntu with public IP and UDP port range binding; OR
> - An enterprise managed WebRTC TURN service (e.g., Cloudflare Calls, Twilio Network Traversal, or Metered.ca TURN).
> For local development and test automation, a local Coturn instance and WebRTC loopback will be used.

---

## 5. Security Vulnerability & Gap Analysis of Existing Assets

Before architecting GCS CONNECT, existing security practices across the corporate agency codebase were audited to identify anti-patterns that must **never** enter GCS CONNECT:

| Domain | Corporate Marketing Site Practice | GCS CONNECT Hardened Requirement |
| :--- | :--- | :--- |
| **Password Hashing** | `bcryptjs` (Cost factor 10) | **Argon2id** (`t=3, m=65536, p=4`) to resist GPU/ASIC brute-force attacks per OWASP recommendations. |
| **Database Engine** | Embedded SQLite (`prisma/gcs.db`) | **MySQL 8+** with connection pooling, transactions, Row-Level Security, strict foreign keys, and WAL. |
| **Media Storage** | Unencrypted static files in `public/uploads/` | **Zero-Knowledge Encrypted Storage** — Files encrypted on client with AES-256-GCM before upload; server stores only opaque ciphertext. |
| **Message Storage** | N/A (Marketing site only stored leads) | **Server-side Zero Knowledge** — Server stores only E2EE ciphertext, initialization vectors, and authentication tags. |
| **Sessions** | Basic stateless JWT in cookies | **Device-Bound Stateful Sessions** with device fingerprinting, explicit revocation in database, and rotating refresh tokens. |
| **Real-time Protocol** | Polling / SSE | **Authenticated Socket.IO with strict handshake auth**, room authorization, rate limiting, and replay protection. |

---

## 6. Actionable Audit Conclusion

1. The development machine is equipped with Node.js 20 LTS, npm 11, Chromium, compilers, and adequate resources.
2. The 6 essential reference repositories (`owasp-asvs`, `owasp-cheatsheet-series`, `libsignal`, `socket.io`, `coturn`, `webrtc-samples`) are cloned and verified.
3. The 5 recommended MCP servers (`github`, `chrome-devtools`, `google-developer-knowledge`, `sequential-thinking`, `mysql-dev`) are configured.
4. GCS CONNECT will be architected as a standalone, enterprise-ready platform cleanly separated from the corporate marketing site.
