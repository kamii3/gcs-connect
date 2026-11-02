# GCS CONNECT — Technology Stack Assessment & Specification
**Document Version:** 1.0.0  
**Phase:** 0 — Initial Project Audit  
**Author:** Principal Software Architect, Global Crest Solutions  
**Date:** November 2, 2026  
**Status:** APPROVED & BASELINED  

---

## 1. Stack Evaluation & Compatibility Matrix

Every dependency adopted for **GCS CONNECT** must satisfy four strict gates:
1. **Security & Vulnerability History:** Zero active high/critical CVEs; audited cryptographic implementation.
2. **License Compatibility:** Commercial permissive license (MIT, Apache-2.0, BSD) that does not contaminate the proprietary GCS CONNECT codebase.
3. **Browser & Runtime Interoperability:** Native browser Web Crypto and Node.js 20 LTS support without esoteric binary toolchains.
4. **Maintenance & Production Maturity:** Actively maintained with predictable semantic versioning.

---

## 2. Frontend Technology Stack

| Layer | Selection | Version | Justification & Security Attributes |
| :--- | :--- | :--- | :--- |
| **Framework** | **Next.js** | `15.x / 14.x` (App Router) | Modern React Server Components for administrative tooling; client components for real-time reactive chat; built-in security headers, script sandboxing, and CSRF protection. |
| **Language** | **TypeScript** | `^5.4.5` | Strict type checking (`noImplicitAny`, `strictNullChecks`), preventing runtime type coercion bugs and memory leaks. |
| **UI Styling** | **Tailwind CSS** | `^3.4.17` | Utility-first CSS enforcing the Black & Emerald design system tokens with zero runtime CSS-in-JS overhead. |
| **Icons** | **Lucide React** | `^1.42.0` | Accessible, tree-shakeable SVG icons matching WhatsApp-style UI paradigms. |
| **Motion** | **Framer Motion** | `^13.x` | Hardware-accelerated micro-animations for message pop-ins, drawers, and calling transitions with reduced-motion support. |
| **Local Storage** | **`idb` (IndexedDB Wrapper)** | `^8.0.0` | High-performance, promise-based asynchronous client storage for Double Ratchet key states and offline message cache. |

---

## 3. Real-Time & Backend Technology Stack

| Layer | Selection | Version | Justification & Security Attributes |
| :--- | :--- | :--- | :--- |
| **Runtime** | **Node.js** | `v20.20.1 LTS` | Built-in native `crypto`, `fetch`, Streams API, and stable Long-Term Support matching Hostinger Cloud Node.js engines. |
| **HTTP Server** | **Express.js** | `^4.21.0` | Lightweight, robust routing framework for REST API endpoints with middleware chains for rate limiting, CORS, and Helmet headers. |
| **Real-time Protocol** | **Socket.IO** | `^4.8.0` | WebSocket engine with automatic HTTP long-polling fallback, room authorization, packet-level acknowledgment, and reconnection management. |
| **Data Validation** | **Zod** | `^3.23.0` | Schema validation for all HTTP payloads, query strings, and Socket.IO packet events, eliminating prototype pollution and malformed payloads. |
| **Security Headers** | **Helmet** | `^8.0.0` | Automatic injection of Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options, and Frameguard. |

---

## 4. Database & ORM Tier

| Layer | Selection | Version | Justification & Security Attributes |
| :--- | :--- | :--- | :--- |
| **Database Engine** | **MySQL 8+** | `8.0.x / 8.4 LTS` | Enterprise relational database with full ACID compliance, InnoDB engine, row-level locking, and binary log replication. |
| **ORM** | **Prisma ORM** | `^5.22.0` | Type-safe query builder, declarative schema migrations, automated connection pooling, and parameterized queries that prevent SQL injection. |
| **Migration Tool** | **Prisma Migrate** | Included | Deterministic, version-controlled database migrations applied safely in deployment pipelines. |

---

## 5. Cryptography & Security Stack

| Layer | Selection | Standard / Algorithm | Justification & Security Attributes |
| :--- | :--- | :--- | :--- |
| **Password Hashing** | **Argon2id** (`argon2`) | RFC 9106 | Gold standard for password hashing; memory-hard function resistant to GPU/FPGA/ASIC parallel cracking attacks. |
| **E2EE Key Agreement** | **Web Crypto API (ECDH / X25519)** | RFC 7748 / Web Crypto | Native browser implementation running in C++ core; immune to JavaScript timing attacks; zero external dependencies. |
| **Symmetric Encryption** | **AES-256-GCM** | NIST SP 800-38D | Authenticated Encryption with Associated Data (AEAD); provides both confidentiality and tamper-proof message integrity. |
| **Key Derivation** | **HKDF-SHA256** | RFC 5869 | Extract-and-expand HMAC-based key derivation for ratcheting chains. |
| **Session Tokens** | **`jose`** | RFC 7519 | Lightweight, audited cryptographic library for JWT/JWE tokens in HttpOnly, SameSite=Strict cookies. |

---

## 6. Voice, Video & Media Processing

| Layer | Selection | Standard / Package | Justification & Security Attributes |
| :--- | :--- | :--- | :--- |
| **Media Transport** | **WebRTC** | `RTCPeerConnection` | Direct peer-to-peer audio/video streaming encrypted via DTLS 1.2/1.3 and SRTP. |
| **NAT Traversal** | **Coturn** | RFC 5766 (STUN / TURN) | Industry-standard STUN/TURN server providing UDP/TCP media relays across symmetric NATs and firewalls. |
| **Client Media Crypto** | **Web Crypto API** | AES-256-GCM | Encrypts raw binary buffers (blobs) in the browser before transmission; server stores only encrypted files. |
| **MIME Validation** | **`file-type`** | Magic Number Inspection | Inspects binary file headers rather than trust client-submitted file extensions. |

---

## 7. Automated Testing Stack

| Layer | Tool | Purpose |
| :--- | :--- | :--- |
| **Unit & Crypto Testing** | **Vitest** | Sub-second execution of cryptographic test vectors, Zod schemas, and utility functions. |
| **API Integration Testing** | **Supertest** | HTTP endpoint verification, cookie assertion, and authentication rejection tests. |
| **E2E Multi-User Testing** | **Playwright** | Headless Chromium dual-context automation testing real-time chat between two isolated browser sessions. |
| **Security Scanning** | **npm audit** & **ESLint Security** | Static code analysis detecting prototype pollution, dangerous regexes, and vulnerable dependencies. |
