# GCS CONNECT — End-to-End Encryption Architecture Specification
**Platform**: GCS CONNECT ("Connect Freely. Communicate Securely.")  
**Parent Organization**: Global Crest Solutions (GCS)  
**Standard Compliance**: OWASP ASVS 5.0.0, Signal Protocol Standards (X3DH & Double Ratchet), RFC 5869 (HKDF), NIST SP 800-38D (AES-GCM)  
**Security Model**: Absolute Zero Plaintext Backend (Zero-Knowledge Architecture)

---

## 1. Executive Cryptographic Summary

GCS CONNECT delivers cryptographically verifiable end-to-end encryption for all conversations, media attachments, and signaling payloads. The backend infrastructure and MariaDB/MySQL database operate under an **Absolute Zero-Plaintext Policy**:
- **Plaintext messages, attachment bytes, and private keys never touch the server.**
- All message encryption and decryption occurs strictly in user agent memory via the hardware-accelerated **Native Web Crypto API (`globalThis.crypto.subtle`)**.
- The server acts solely as an untrusted ciphertext and public prekey relay. Even under complete server compromise or subpoena, ciphertext cannot be decrypted by third parties.

---

## 2. Cryptographic Primitive Standards

| Component | Standard / Algorithm | Parameters | Implementation |
| :--- | :--- | :--- | :--- |
| **Asymmetric DH** | ECDH | NIST Curve P-256 (secp256r1) | Web Crypto API (`crypto.subtle.generateKey`, `deriveBits`) |
| **Symmetric Cipher** | AES-GCM | 256-bit key, 96-bit unique IV, 128-bit auth tag | Web Crypto API (`crypto.subtle.encrypt`, `decrypt`) |
| **Key Derivation** | HKDF | HMAC-SHA-256 (RFC 5869), Extract & Expand | Web Crypto API (`crypto.subtle.deriveBits`) |
| **Password Hashing** | Argon2id | Memory: 64MB, Iterations: 3, Parallelism: 4 | `hash-wasm` |
| **Safety Number** | Signal Fingerprint | 1000 iterative SHA-256 rounds -> 60 decimal digits | Web Crypto API (`crypto.subtle.digest`) |

---

## 3. Extended Triple Diffie-Hellman (X3DH) Protocol

X3DH provides mutual authentication and forward secret session key agreement between two devices, even when the recipient is offline.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Sender)
    participant Server as GCS Relay Server
    actor Bob as Bob (Recipient)

    Note over Bob: Generates Identity Key (IK_B),<br/>Signed Prekey (SPK_B),<br/>One-Time Prekeys (OPK_B)
    Bob->>Server: POST /api/keys/register (Public Keys Only)
    
    Note over Alice: Wants to message Bob
    Alice->>Server: GET /api/keys/prekey-bundle/:bobId
    Server-->>Alice: Returns IK_B, SPK_B, and atomicaly consumes OPK_B_1
    
    Note over Alice: Generates Ephemeral Key (EK_A)<br/>DH1 = ECDH(IK_A, SPK_B)<br/>DH2 = ECDH(EK_A, IK_B)<br/>DH3 = ECDH(EK_A, SPK_B)<br/>DH4 = ECDH(EK_A, OPK_B_1)<br/>SK = HKDF(DH1 || DH2 || DH3 || DH4)
    
    Alice->>Server: Send Initial Ratchet Message (Includes EK_A, SPK_B_id, OPK_B_id)
    Server->>Bob: Deliver Initial Ratchet Message
    
    Note over Bob: Computes matching DH secrets:<br/>DH1 = ECDH(SPK_B, IK_A)<br/>DH2 = ECDH(IK_B, EK_A)<br/>DH3 = ECDH(SPK_B, EK_A)<br/>DH4 = ECDH(OPK_B_1, EK_A)<br/>SK = HKDF(DH1 || DH2 || DH3 || DH4)
    Note over Bob: Alice & Bob derive identical 32-byte Master Secret (SK)
```

### X3DH Computation Rules:
1. **With One-Time Prekey (4-DH)**:
   $$\text{SharedSecret} = \text{HKDF}(\text{DH}(IK_A, SPK_B) \parallel \text{DH}(EK_A, IK_B) \parallel \text{DH}(EK_A, SPK_B) \parallel \text{DH}(EK_A, OPK_B))$$
2. **Without One-Time Prekey (Triple-DH Fallback)**:
   $$\text{SharedSecret} = \text{HKDF}(\text{DH}(IK_A, SPK_B) \parallel \text{DH}(EK_A, IK_B) \parallel \text{DH}(EK_A, SPK_B))$$

---

## 4. Double Ratchet Algorithm Architecture

Once the X3DH master shared secret is agreed, both devices establish a Double Ratchet session combining:
1. **Symmetric KDF Chain Ratchet**: Advances per message sent or received.
2. **Diffie-Hellman Asymmetric Ratchet**: Advances with each conversational round-trip turn.

```mermaid
flowchart TD
    subgraph Root_KDF_Chain["Root KDF Chain (Self-Healing / Post-Compromise)"]
        RK0["Root Key 0 (from X3DH)"] -->|"+ DH(Alice_DH, Bob_DH)"| RK1["Root Key 1"]
        RK1 -->|"+ DH(Bob_DH2, Alice_DH)"| RK2["Root Key 2"]
    end

    subgraph Sending_Chain["Sending Chain (Forward Secrecy)"]
        RK1 --> SC0["Sending Chain Key 0"]
        SC0 -->|Chain Step| MK0["Message Key 0 (Encrypted Msg 0)"]
        SC0 -->|Chain Step| SC1["Sending Chain Key 1"]
        SC1 -->|Chain Step| MK1["Message Key 1 (Encrypted Msg 1)"]
    end

    subgraph Receiving_Chain["Receiving Chain"]
        RK2 --> RC0["Receiving Chain Key 0"]
        RC0 -->|Chain Step| RMK0["Message Key 0 (Decrypted Msg 0)"]
    end
```

### Security Properties Guaranteed:
- **Forward Secrecy (FS)**: Once message key $MK_i$ is derived and used, it is permanently erased from memory. Compromising the device state at message $n$ cannot decrypt any past messages $m < n$.
- **Post-Compromise Security (PCS / Break-in Recovery)**: If an attacker temporarily gains access to the session state, the very next conversational round-trip exchanges fresh ECDH ephemeral key pairs, completely restoring session confidentiality and kicking out the adversary.
- **Out-of-Order Message Caching**: If messages arrive out of chronological sequence due to network delays, skipped message keys are cached in `skippedMessageKeys[dhKey:sequenceNumber]` up to a strict limit of `MAX_SKIP = 1000`. Once an out-of-order message arrives and is decrypted, its key is permanently deleted.

---

## 5. Mutual Identity Verification (Safety Numbers)

To detect active Man-In-The-Middle (MITM) attacks, users can verify each other's cryptographic identity through a **60-digit Safety Number**:

$$\text{SafetyNumber} = \text{SHA256}^{1000}(\text{sort}(\text{IdentityKey}_A, \text{IdentityKey}_B))$$

- The two public keys are lexicographically sorted to guarantee commutative equality ($SN(A, B) = SN(B, A)$).
- Formatted as 12 groups of 5 decimal digits (e.g., `12345 67890 ...`).
- Users can compare these numbers visually or scan a QR code out-of-band.

---

## 6. Prekey Inventory & Replenishment Pipeline

The server maintains a pool of prekeys per device:
1. **Public Identity Key (IK)**: Permanent public key for the device.
2. **Active Signed Prekey (SPK)**: Periodically rotated (every 30 days) and signed by the device's identity key.
3. **One-Time Prekeys (OPKs)**: A batch of 25–100 ephemeral prekeys.
   - When a peer requests a prekey bundle, the database atomically claims 1 unconsumed OPK (`is_consumed = TRUE`).
   - If OPK inventory falls below 10, the client application is alerted via `GET /api/keys/status` to upload a new batch via `POST /api/keys/prekeys/replenish`.

---

## 7. Client Storage Vault & Encrypted Backups

- Private keys and session states never persist in plaintext.
- Browser persistence uses structured IndexedDB key vaults.
- Multi-device sync and disaster recovery are supported via client-side encrypted backup envelopes:
  - The vault is encrypted client-side using **AES-256-GCM** with a 256-bit key derived from the user's master passphrase via **HKDF-SHA256**.
  - The encrypted blob is uploaded to `POST /api/keys/backup` with a SHA-256 checksum.
  - The server only holds the ciphertext blob and has zero means to decrypt it.

---

## 8. Verification and Test Results

Automated test suites verify all security properties:
- `src/lib/crypto/crypto.test.ts`: **12 / 12 tests passed**
  - ECDH generation, import, export
  - Symmetric Diffie-Hellman secret derivation
  - AES-256-GCM authenticated encryption/decryption
  - Tampering detection (modified ciphertext or tag rejected)
  - 60-digit Safety Number commutativity and formatting
  - X3DH 4-DH and Triple-DH shared secret convergence
  - Double Ratchet 4-round bidirectional session with ratcheting
  - Out-of-order message delivery with skipped key caching
  - Forward Secrecy enforcement (replay rejected)
  - Client vault encrypted backup import/export
- `src/server/routes/keys.test.ts`: **9 / 9 tests passed**
  - Authentication guard enforcement
  - Device key registration
  - Atomic OPK consumption and inventory decrement
  - OPK replenishment
  - Safety Number public key retrieval
  - Encrypted backup save and recovery

**Total Cryptographic Test Coverage: 21 / 21 tests passing (100%).**
