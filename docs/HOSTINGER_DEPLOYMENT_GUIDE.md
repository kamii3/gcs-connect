# GCS CONNECT — Hostinger Production Deployment Guide
**Document Version:** 2.0.0
**Target Environments:**
1. **Hostinger Cloud / Web Hosting** (Cloud Startup / Business plans via hPanel Node.js Application Manager)
2. **Hostinger KVM VPS** (Ubuntu 22.04 / 24.04 LTS with Nginx + Systemd)
**Security Standard:** Zero Plaintext Architecture & OWASP ASVS 5.0.0 Level 2/3  
**Platform:** Next.js 14 + Node.js / Express + Socket.IO + MariaDB / MySQL 8+ + WebRTC  

---

## 1. System Architecture Overview

### Option A: Hostinger Cloud Hosting (hPanel Unified Server)
```
                          Internet (HTTPS / WSS)
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  Hostinger LiteSpeed Server   │
                    │   - SSL Termination & CDN     │
                    │   - Phusion Passenger Engine  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Unified Node.js App       │
                    │       (Entry: server.js)      │
                    │  - Next.js 14 Frontend SSR    │
                    │  - Express REST API (/api/*)  │
                    │  - Socket.IO Long-Polling/WS  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Hostinger Cloud Database    │
                    │   (MySQL 8+ / srv*.hstgr.io)  │
                    └───────────────────────────────┘
```

### Option B: Hostinger KVM VPS (Split Daemon Architecture)
```
                           Internet (HTTPS / WSS)
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │     Hostinger VPS (Ubuntu)      │
                    │        UFW Firewall (80, 443)   │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │          Nginx Reverse Proxy         │
                  │   - TLS 1.3 Termination (Certbot)    │
                  │   - Rate Limiting Zones (30r/s)      │
                  │   - HSTS, CSP, Anti-Clickjacking     │
                  └──────────────┬──────────────┬────────┘
                                 │              │
                   /api & /socket.io            / (Frontend)
                                 │              │
                                 ▼              ▼
         ┌───────────────────────────────┐  ┌────────────────────────────┐
         │     gcs-api.service (3001)    │  │   gcs-web.service (3000)   │
         │  - Express REST Endpoints     │  │  - Next.js 14 SSR & Static │
         │  - Socket.IO Real-Time Rooms  │  │  - Black & Emerald Theme   │
         │  - WebRTC DTLS Signaling Hub  │  │  - Zero Plaintext Client   │
         └───────────────┬───────────────┘  └────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │    MariaDB / MySQL (3306)     │
         │  - Prisma ORM Data Layer      │
         │  - Zero Plaintext Invariant   │
         │  - Automated Encrypted Dump   │
         └───────────────────────────────┘
```

---

## 2. Hostinger Cloud Hosting Deployment (hPanel)

If deploying to Hostinger Cloud / Shared Web Hosting (e.g. Cloud Startup):

### 2.1 Critical Configuration Parameters
When creating or updating the Node.js application in Hostinger hPanel or via the Hostinger Deployment API:
- **Node.js Version:** `22` (or `20`)
- **Application Type (`appType`):** `express`
- **Entry File (`entryFile`):** `server.js`
- **Build Script (`buildScript`):** `build`
- **Application Root:** Use the directory where the archive is extracted. Keep the Next.js `.next` build directory inside that root; it is not the application root or a document root.
- **Build Script:** Build locally with `npm run package:hostinger` and upload the resulting archive as described in [the manual upload guide](HOSTINGER_MANUAL_UPLOAD.md). For hPanel deployments that build from source, use `npm run build`.
- **Package Manager:** `npm`

### 2.2 Environment Variables (Configured in hPanel > Advanced > Environment Variables)
```ini
NODE_ENV="production"
PORT=3000
HOST="0.0.0.0"
NEXT_PUBLIC_APP_URL="https://<YOUR_DOMAIN>"
NEXT_PUBLIC_API_URL="https://<YOUR_DOMAIN>/api"
NEXT_PUBLIC_SOCKET_URL="https://<YOUR_DOMAIN>"
DATABASE_URL="mysql://<DB_USER>:<DB_PASSWORD>@<DB_HOST>:3306/<DB_NAME>"
JWT_SECRET="<SECURE_BASE64_KEY>"
COOKIE_SIGNING_KEY="<SECURE_BASE64_KEY>"
SESSION_COOKIE_NAME="gcs_session"
SESSION_EXPIRY_DAYS=7
COOKIE_SECURE="true"
ADMIN_INITIAL_EMAIL="admin@globalcrestsolutions.com"
ADMIN_INITIAL_PASSWORD="<STRONG_ADMIN_PASSWORD>"
ADMIN_INITIAL_NAME="Global Crest Administrator"
STUN_SERVER_URL="stun:stun.l.google.com:19302"
STORAGE_VAULT_PATH="./storage/vault"
MAX_UPLOAD_SIZE_BYTES=52428800
```

---

## 3. Server Prerequisites & Initial Hardening (Hostinger VPS)

### 2.1 Update System & Install Required Toolchains
Connect to your Hostinger VPS via SSH as `root`:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw certbot python3-certbot-nginx mariadb-server openssl build-essential
```

### 2.2 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Should display v20.x.x
npm -v  # Should display v10.x.x
```

### 2.3 Configure UFW Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh        # Port 22
sudo ufw allow 80/tcp     # HTTP (Certbot verification)
sudo ufw allow 443/tcp    # HTTPS / WSS
sudo ufw enable
```

### 2.4 Create Dedicated Deployment User (`gcs`)
```bash
sudo adduser --disabled-password --gecos "" gcs
sudo usermod -aG sudo gcs
sudo mkdir -p /var/www/gcs-connect
sudo chown -R gcs:gcs /var/www/gcs-connect
```

---

## 3. Database Setup (MySQL 8+ / MariaDB)

### 3.1 Secure MySQL Installation
```bash
sudo mysql_secure_installation
```

### 3.2 Create Production Database & Dedicated User
Log in to MySQL root shell:
```bash
sudo mysql -u root
```
Run SQL commands:
```sql
CREATE DATABASE gcs_connect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'gcs_prod_user'@'localhost' IDENTIFIED BY 'StrongGeneratedPassword2026!';
GRANT ALL PRIVILEGES ON gcs_connect.* TO 'gcs_prod_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Application Deployment

### 4.1 Clone Repository & Set Permissions
Log in as user `gcs`:
```bash
su - gcs
cd /var/www/gcs-connect
git clone <YOUR_GIT_REPOSITORY_URL> .
```

### 4.2 Configure Environment (`.env`)
Create `/var/www/gcs-connect/.env`:
```ini
NODE_ENV="production"
PORT=3001
API_PORT=3001
HOST="0.0.0.0"

# Application Domains
NEXT_PUBLIC_APP_URL="https://connect.globalcrestsolutions.com"
NEXT_PUBLIC_API_URL="https://connect.globalcrestsolutions.com/api"
NEXT_PUBLIC_SOCKET_URL="https://connect.globalcrestsolutions.com"

# MySQL Database Connection
DATABASE_URL="mysql://gcs_prod_user:StrongGeneratedPassword2026!@127.0.0.1:3306/gcs_connect"

# High-Entropy Cryptographic Keys (generate with openssl rand -base64 48)
JWT_SECRET="<GENERATED_48_BYTE_BASE64_SECRET>"
COOKIE_SIGNING_KEY="<GENERATED_48_BYTE_BASE64_SECRET>"
BACKUP_ENCRYPTION_KEY="<GENERATED_32_BYTE_BASE64_KEY>"
SESSION_COOKIE_NAME="gcs_session"

# Storage & Calling Constraints
MAX_UPLOAD_SIZE_BYTES=52428800
STUN_SERVER_URL="stun:stun.l.google.com:19302"
```
Protect file permissions:
```bash
chmod 600 /var/www/gcs-connect/.env
```

### 4.3 Run Automated Deployment Script
```bash
chmod +x scripts/deploy-hostinger.sh scripts/backup-db.sh
./scripts/deploy-hostinger.sh
```

---

## 5. Nginx & SSL Certificate Setup

### 5.1 Install Nginx Configuration
Copy the supplied Nginx configuration:
```bash
sudo cp deploy/nginx/gcs-connect.conf /etc/nginx/sites-available/gcs-connect.conf
sudo ln -sf /etc/nginx/sites-available/gcs-connect.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 5.2 Obtain SSL Certificate via Let's Encrypt
```bash
sudo certbot --nginx -d connect.globalcrestsolutions.com --agree-tos -m admin@globalcrestsolutions.com --redirect
```

### 5.3 Test & Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Systemd Background Daemons

### 6.1 Install Systemd Units
```bash
sudo cp deploy/systemd/gcs-api.service /etc/systemd/system/
sudo cp deploy/systemd/gcs-web.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### 6.2 Enable & Start Services
```bash
sudo systemctl enable gcs-api.service gcs-web.service
sudo systemctl start gcs-api.service gcs-web.service
```

### 6.3 Verify Service Status
```bash
sudo systemctl status gcs-api.service
sudo systemctl status gcs-web.service
```

---

## 7. Automated Backups & Maintenance

### 7.1 Setup Nightly Encrypted Database Backup via Cron
Edit root crontab:
```bash
sudo crontab -e
```
Add the following line (runs every morning at 02:00 UTC):
```cron
0 2 * * * /var/www/gcs-connect/scripts/backup-db.sh >> /var/log/gcs-backup.log 2>&1
```

### 7.2 Manual Backup Trigger
```bash
/var/www/gcs-connect/scripts/backup-db.sh
```
Encrypted archives (`*.sql.gz.enc`) and SHA-256 hashes are automatically placed in `/var/www/gcs-connect/backups` and retained for 30 days.

---

## 8. Monitoring & Health Probes

### 8.1 Real-Time System Journal
```bash
# Monitor API and WebSocket logs
sudo journalctl -u gcs-api.service -f

# Monitor Next.js SSR logs
sudo journalctl -u gcs-web.service -f
```

### 8.2 Live Healthcheck Probe
```bash
curl -s https://connect.globalcrestsolutions.com/api/health | jq .
```
Expected Output:
```json
{
  "status": "ONLINE",
  "service": "GCS CONNECT Real-Time API & Signaling Hub",
  "tagline": "Connect Freely. Communicate Securely.",
  "security": {
    "zeroKnowledge": true,
    "e2eeProtocols": ["X3DH", "Double Ratchet", "AES-256-GCM"],
    "webrtcSecurity": "DTLS-SRTP"
  }
}
```

---

## 9. Rollback Runbook

If a deployment encounters unexpected runtime errors:
```bash
# 1. Revert Git repository to the previous stable release commit/tag
cd /var/www/gcs-connect
git checkout <PREVIOUS_STABLE_COMMIT_HASH>

# 2. Rebuild and re-deploy
npm install
npx prisma generate
NODE_ENV=production npm run build

# 3. Restart services
sudo systemctl restart gcs-api.service gcs-web.service
```
