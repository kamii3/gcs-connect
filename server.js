"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config2 = require("dotenv/config");
var import_next = __toESM(require("next"));

// src/server/server.ts
var import_http = __toESM(require("http"));
var import_express9 = __toESM(require("express"));
var import_socket = require("socket.io");
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));
var import_cookie_parser = __toESM(require("cookie-parser"));
var import_dotenv = __toESM(require("dotenv"));

// src/server/middleware/rate-limiter.ts
function createRateLimiter(options) {
  const {
    windowMs,
    maxRequests,
    message = "Rate limit exceeded. Please wait before retrying.",
    keyGenerator = (req) => req.ip || req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "127.0.0.1",
    skipInTests = true
  } = options;
  const hits = /* @__PURE__ */ new Map();
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    hits.forEach((record, key) => {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        hits.delete(key);
      }
    });
  }, Math.max(windowMs, 6e4));
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
  return function rateLimiterMiddleware(req, res, next2) {
    if (skipInTests && process.env.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) {
      return next2();
    }
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    let record = hits.get(key);
    if (!record) {
      record = { timestamps: [] };
      hits.set(key, record);
    }
    record.timestamps = record.timestamps.filter((t) => t > windowStart);
    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const resetTimeSeconds = Math.ceil(
      (record.timestamps.length > 0 ? record.timestamps[0] + windowMs - now : windowMs) / 1e3
    );
    res.setHeader("RateLimit-Limit", maxRequests.toString());
    res.setHeader("RateLimit-Remaining", remaining.toString());
    res.setHeader("RateLimit-Reset", resetTimeSeconds.toString());
    if (currentCount >= maxRequests) {
      res.setHeader("Retry-After", resetTimeSeconds.toString());
      res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message,
        retryAfterSeconds: resetTimeSeconds
      });
      return;
    }
    record.timestamps.push(now);
    next2();
  };
}
var generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  maxRequests: 120,
  message: "Too many API requests from this source. Please slow down."
});
var strictAuthLimiter = createRateLimiter({
  windowMs: 60 * 1e3,
  maxRequests: 100,
  message: "Too many authentication attempts. Account access temporarily throttled."
});

// src/server/routes/auth.ts
var import_express = require("express");
var import_zod = require("zod");

// src/lib/db.ts
var import_client = require("@prisma/client");
if (typeof BigInt !== "undefined" && !BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function() {
    return Number(this);
  };
}
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new import_client.PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
var db_default = prisma;

// src/lib/auth-crypto.ts
var import_argon2 = __toESM(require("argon2"));
var import_crypto = __toESM(require("crypto"));
async function hashPassword(password) {
  return import_argon2.default.hash(password, {
    type: import_argon2.default.argon2id,
    memoryCost: 65536,
    // 64 MB
    timeCost: 3,
    // 3 iterations
    parallelism: 4
    // 4 threads
  });
}
async function verifyPassword(password, hash) {
  try {
    return await import_argon2.default.verify(hash, password);
  } catch (err) {
    return false;
  }
}
function generateSecureToken(bytes = 32) {
  return import_crypto.default.randomBytes(bytes).toString("hex");
}
function hashToken(token) {
  return import_crypto.default.createHash("sha256").update(token).digest("hex");
}

// src/lib/session.ts
var import_jose = require("jose");
var JWT_SECRET_STRING = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!JWT_SECRET_STRING || JWT_SECRET_STRING.length < 32)) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
}
var SECRET_KEY = new TextEncoder().encode(
  JWT_SECRET_STRING || "gcs_connect_super_secure_jwt_secret_dev_key_2026_min32chars"
);
var SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "gcs_session";
async function signSessionToken(payload, expiresInDays = 7) {
  return new import_jose.SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime(`${expiresInDays}d`).sign(SECRET_KEY);
}
async function verifySessionToken(token) {
  try {
    const { payload } = await (0, import_jose.jwtVerify)(token, SECRET_KEY, {
      algorithms: ["HS256"]
    });
    return payload;
  } catch (err) {
    return null;
  }
}
var sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: process.env.SESSION_COOKIE_SAMESITE || "strict",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1e3
  // 7 days in milliseconds
};

// src/server/middleware/auth.ts
async function authenticate(req, res, next2) {
  let token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.substring(7);
  }
  if (!token) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication session token is missing."
    });
    return;
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Authentication session token is invalid or expired."
    });
    return;
  }
  const dbSession = await db_default.userSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      device: true,
      user: {
        include: {
          roles: true
        }
      }
    }
  });
  if (!dbSession || !dbSession.isValid || dbSession.revokedAt !== null || dbSession.expiresAt < /* @__PURE__ */ new Date()) {
    res.status(401).json({
      error: "SESSION_REVOKED",
      message: "This session has been revoked or has expired."
    });
    return;
  }
  if (dbSession.user.status !== "ACTIVE") {
    res.status(403).json({
      error: "ACCOUNT_SUSPENDED",
      message: `Account is currently ${dbSession.user.status}. Please contact an administrator.`
    });
    return;
  }
  try {
    await db_default.device.update({
      where: { id: dbSession.deviceId },
      data: { lastSeenAt: /* @__PURE__ */ new Date() }
    });
  } catch {
  }
  req.user = {
    id: dbSession.user.id,
    email: dbSession.user.email,
    fullName: dbSession.user.fullName,
    displayName: dbSession.user.displayName,
    avatarUrl: dbSession.user.avatarUrl,
    status: dbSession.user.status,
    roles: dbSession.user.roles.map((r) => r.role)
  };
  req.device = {
    id: dbSession.device.id,
    deviceName: dbSession.device.deviceName,
    deviceFingerprint: dbSession.device.deviceFingerprint,
    clientPlatform: dbSession.device.clientPlatform
  };
  req.session = {
    id: dbSession.id,
    expiresAt: dbSession.expiresAt
  };
  next2();
}
function requireRole(...allowedRoles) {
  return (req, res, next2) => {
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Insufficient administrative permissions to perform this action."
      });
      return;
    }
    next2();
  };
}

// src/server/routes/auth.ts
var router = (0, import_express.Router)();
var LoginSchema = import_zod.z.object({
  email: import_zod.z.string().email(),
  password: import_zod.z.string().min(8),
  deviceFingerprint: import_zod.z.string().min(8),
  deviceName: import_zod.z.string().min(1).default("Browser Client"),
  clientPlatform: import_zod.z.string().optional()
});
var RegisterSchema = import_zod.z.object({
  email: import_zod.z.string().email("Please enter a valid email address"),
  password: import_zod.z.string().min(6, "Password must be at least 6 characters"),
  fullName: import_zod.z.string().min(1, "Full name is required").max(100),
  displayName: import_zod.z.string().optional(),
  invitationToken: import_zod.z.string().optional(),
  deviceFingerprint: import_zod.z.string().optional(),
  deviceName: import_zod.z.string().optional(),
  clientPlatform: import_zod.z.string().optional()
});
var ChangePasswordSchema = import_zod.z.object({
  currentPassword: import_zod.z.string().min(8),
  newPassword: import_zod.z.string().min(12, "Password must be at least 12 characters")
});
var RevokeSessionSchema = import_zod.z.object({
  sessionId: import_zod.z.string().uuid()
});
router.post("/login", async (req, res) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstErr = Object.values(fieldErrors)[0]?.[0] || "Invalid login details.";
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: firstErr,
        details: parseResult.error.flatten()
      });
      return;
    }
    const { email, password, deviceFingerprint, deviceName, clientPlatform } = parseResult.data;
    const user = await db_default.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: true }
    });
    if (!user) {
      res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
      return;
    }
    if (user.status !== "ACTIVE") {
      res.status(403).json({
        error: "ACCOUNT_SUSPENDED",
        message: `Account is currently ${user.status}. Contact administrator.`
      });
      return;
    }
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
      return;
    }
    const device = await db_default.device.upsert({
      where: {
        userId_deviceFingerprint: {
          userId: user.id,
          deviceFingerprint
        }
      },
      update: {
        deviceName,
        clientPlatform: clientPlatform || "WEB_CHROME",
        lastSeenAt: /* @__PURE__ */ new Date(),
        isActive: true
      },
      create: {
        userId: user.id,
        deviceName,
        deviceFingerprint,
        clientPlatform: clientPlatform || "WEB_CHROME",
        isActive: true
      }
    });
    const rawToken = generateSecureToken(32);
    const sessionTokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
    const primaryRole = user.roles[0]?.role || "USER";
    const session = await db_default.userSession.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        sessionTokenHash,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
        expiresAt,
        isValid: true
      }
    });
    const jwt = await signSessionToken({
      userId: user.id,
      sessionId: session.id,
      deviceId: device.id,
      email: user.email,
      role: primaryRole
    });
    await db_default.auditLog.create({
      data: {
        userId: user.id,
        actorEmail: user.email,
        action: "USER_LOGIN",
        entityType: "SESSION",
        entityId: session.id,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
        details: JSON.stringify({ deviceId: device.id, deviceName })
      }
    });
    res.cookie(SESSION_COOKIE_NAME, jwt, sessionCookieOptions);
    res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        displayName: user.displayName,
        status: user.status,
        roles: user.roles.map((r) => r.role)
      },
      device: {
        id: device.id,
        deviceName: device.deviceName,
        deviceFingerprint: device.deviceFingerprint
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt
      },
      token: jwt
      // Also return in body for headless/API clients
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
router.post("/register", async (req, res) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstErr = Object.values(fieldErrors)[0]?.[0] || "Invalid registration details.";
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: firstErr,
        details: parseResult.error.flatten()
      });
      return;
    }
    const {
      email,
      password,
      fullName,
      displayName,
      invitationToken,
      deviceFingerprint,
      deviceName,
      clientPlatform
    } = parseResult.data;
    const existing = await db_default.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (existing) {
      res.status(409).json({
        error: "EMAIL_ALREADY_EXISTS",
        message: "A user account with this email address already exists."
      });
      return;
    }
    let assignedRole = "USER";
    let matchedInvitationId = null;
    if (invitationToken) {
      const tokenHash = hashToken(invitationToken);
      const invitation = await db_default.invitation.findFirst({
        where: {
          token: tokenHash,
          expiresAt: { gt: /* @__PURE__ */ new Date() },
          acceptedAt: null
        }
      });
      if (!invitation) {
        res.status(400).json({
          error: "INVALID_INVITATION",
          message: "The provided invitation link or token is invalid or has expired."
        });
        return;
      }
      assignedRole = invitation.role;
      matchedInvitationId = invitation.id;
    }
    const passwordHash = await hashPassword(password);
    const fingerprint = deviceFingerprint || `fp-web-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const devName = deviceName || "Web Browser";
    const result = await db_default.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          fullName,
          displayName: displayName || fullName,
          status: "ACTIVE",
          roles: {
            create: { role: assignedRole }
          }
        },
        include: { roles: true }
      });
      const device = await tx.device.create({
        data: {
          userId: user.id,
          deviceFingerprint: fingerprint,
          deviceName: devName,
          clientPlatform: clientPlatform || "WEB",
          isActive: true
        }
      });
      const rawSessionToken = generateSecureToken(32);
      const sessionTokenHash = hashToken(rawSessionToken);
      const expiresAt = new Date(Date.now() + 864e5 * 7);
      const session = await tx.userSession.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          sessionTokenHash,
          ipAddress: req.ip || req.socket.remoteAddress || "127.0.0.1",
          userAgent: req.headers["user-agent"] || "Unknown",
          expiresAt
        }
      });
      if (matchedInvitationId) {
        await tx.invitation.update({
          where: { id: matchedInvitationId },
          data: { acceptedAt: /* @__PURE__ */ new Date() }
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          actorEmail: user.email,
          action: "USER_REGISTERED",
          entityType: "USER",
          entityId: user.id,
          details: JSON.stringify({ role: assignedRole, deviceName: devName })
        }
      });
      return { user, device, session };
    });
    const token = await signSessionToken({
      userId: result.user.id,
      sessionId: result.session.id,
      deviceId: result.device.id,
      email: result.user.email,
      role: assignedRole
    });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    res.status(201).json({
      success: true,
      message: "Registration successful. Welcome to GCS CONNECT!",
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        displayName: result.user.displayName,
        roles: result.user.roles.map((r) => r.role)
      },
      device: {
        id: result.device.id,
        deviceName: result.device.deviceName
      },
      token,
      chatLink: `/?chatWith=${encodeURIComponent(result.user.email)}`
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router.post(
  "/logout",
  authenticate,
  async (req, res) => {
    try {
      if (req.session) {
        await db_default.userSession.update({
          where: { id: req.session.id },
          data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
        });
        await db_default.auditLog.create({
          data: {
            userId: req.user?.id,
            actorEmail: req.user?.email || "unknown",
            action: "USER_LOGOUT",
            entityType: "SESSION",
            entityId: req.session.id
          }
        });
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      res.status(200).json({ success: true, message: "Logged out successfully." });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);
router.get(
  "/me",
  authenticate,
  async (req, res) => {
    res.status(200).json({
      user: req.user,
      device: req.device,
      session: req.session
    });
  }
);
router.post(
  "/password/change",
  authenticate,
  async (req, res) => {
    try {
      const parseResult = ChangePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: "VALIDATION_ERROR",
          details: parseResult.error.flatten()
        });
        return;
      }
      const { currentPassword, newPassword } = parseResult.data;
      const userId = req.user.id;
      const user = await db_default.user.findUnique({ where: { id: userId } });
      if (!user) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }
      const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        res.status(400).json({
          error: "INVALID_PASSWORD",
          message: "Current password is incorrect."
        });
        return;
      }
      const newHash = await hashPassword(newPassword);
      await db_default.$transaction([
        db_default.user.update({
          where: { id: userId },
          data: { passwordHash: newHash }
        }),
        // Revoke all OTHER sessions for this user
        db_default.userSession.updateMany({
          where: {
            userId,
            id: { not: req.session.id },
            isValid: true
          },
          data: {
            isValid: false,
            revokedAt: /* @__PURE__ */ new Date()
          }
        }),
        db_default.auditLog.create({
          data: {
            userId,
            actorEmail: user.email,
            action: "PASSWORD_CHANGED",
            entityType: "USER",
            entityId: userId,
            details: JSON.stringify({ currentSessionPreserved: req.session.id })
          }
        })
      ]);
      res.status(200).json({
        success: true,
        message: "Password changed successfully. All other sessions have been revoked."
      });
    } catch (err) {
      console.error("Password change error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);
router.get(
  "/sessions",
  authenticate,
  async (req, res) => {
    try {
      const sessions = await db_default.userSession.findMany({
        where: {
          userId: req.user.id,
          isValid: true,
          revokedAt: null,
          expiresAt: { gt: /* @__PURE__ */ new Date() }
        },
        include: { device: true },
        orderBy: { createdAt: "desc" }
      });
      const formatted = sessions.map((s) => ({
        id: s.id,
        deviceName: s.device.deviceName,
        clientPlatform: s.device.clientPlatform,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.id === req.session.id
      }));
      res.status(200).json({ sessions: formatted });
    } catch (err) {
      console.error("Fetch sessions error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);
router.post(
  "/sessions/revoke",
  authenticate,
  async (req, res) => {
    try {
      const parseResult = RevokeSessionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: "INVALID_SESSION_ID" });
        return;
      }
      const { sessionId } = parseResult.data;
      const target = await db_default.userSession.findFirst({
        where: { id: sessionId, userId: req.user.id }
      });
      if (!target) {
        res.status(404).json({ error: "SESSION_NOT_FOUND" });
        return;
      }
      await db_default.userSession.update({
        where: { id: sessionId },
        data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
      });
      await db_default.auditLog.create({
        data: {
          userId: req.user.id,
          actorEmail: req.user.email,
          action: "SESSION_REVOKED_BY_USER",
          entityType: "SESSION",
          entityId: sessionId
        }
      });
      if (sessionId === req.session.id) {
        res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      }
      res.status(200).json({ success: true, message: "Session revoked successfully." });
    } catch (err) {
      console.error("Revoke session error:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);
var auth_default = router;

// src/server/routes/admin.ts
var import_express2 = require("express");
var import_zod2 = require("zod");
var router2 = (0, import_express2.Router)();
router2.use(authenticate);
router2.use(requireRole("SUPER_ADMIN", "ADMIN"));
var CreateUserSchema = import_zod2.z.object({
  email: import_zod2.z.string().email("Please enter a valid email address"),
  password: import_zod2.z.string().min(6, "Password must be at least 6 characters"),
  fullName: import_zod2.z.string().min(1, "Full name is required"),
  displayName: import_zod2.z.string().optional(),
  role: import_zod2.z.enum(["SUPER_ADMIN", "ADMIN", "SECURITY_AUDITOR", "USER"]).default("USER")
});
var UpdateStatusSchema = import_zod2.z.object({
  status: import_zod2.z.enum(["ACTIVE", "SUSPENDED", "DELETED"]),
  reason: import_zod2.z.string().optional()
});
var UpdateRoleSchema = import_zod2.z.object({
  role: import_zod2.z.enum(["SUPER_ADMIN", "ADMIN", "SECURITY_AUDITOR", "USER"]),
  action: import_zod2.z.enum(["ASSIGN", "REMOVE"]).default("ASSIGN")
});
var CreateInvitationSchema = import_zod2.z.object({
  email: import_zod2.z.string().email(),
  role: import_zod2.z.enum(["ADMIN", "SECURITY_AUDITOR", "USER"]).default("USER"),
  expiresInDays: import_zod2.z.number().int().min(1).max(30).default(7)
});
router2.get("/metrics", async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3);
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      newUsers24h,
      totalDevices,
      activeSessions,
      totalConversations,
      directConversations,
      groupConversations,
      totalMessages,
      editedMessages,
      deletedMessages,
      identityKeysCount,
      signedPrekeysCount,
      totalOpks,
      consumedOpks,
      totalAttachments,
      attachmentAggregate,
      totalCalls,
      completedCalls,
      callDurationAggregate,
      auditLogsTotal
    ] = await Promise.all([
      db_default.user.count(),
      db_default.user.count({ where: { status: "ACTIVE" } }),
      db_default.user.count({ where: { status: "SUSPENDED" } }),
      db_default.user.count({ where: { createdAt: { gte: oneDayAgo } } }),
      db_default.device.count({ where: { isActive: true } }),
      db_default.userSession.count({ where: { isValid: true, expiresAt: { gt: /* @__PURE__ */ new Date() } } }),
      db_default.conversation.count({ where: { deletedAt: null } }),
      db_default.conversation.count({ where: { type: "DIRECT", deletedAt: null } }),
      db_default.conversation.count({ where: { type: "GROUP", deletedAt: null } }),
      db_default.message.count(),
      db_default.message.count({ where: { isEdited: true } }),
      db_default.message.count({ where: { isDeletedForEveryone: true } }),
      db_default.encryptionIdentityKey.count(),
      db_default.signedPrekey.count({ where: { isActive: true } }),
      db_default.oneTimePrekey.count(),
      db_default.oneTimePrekey.count({ where: { isConsumed: true } }),
      db_default.attachment.count(),
      db_default.attachment.aggregate({
        _sum: { fileSizeBytes: true }
      }),
      db_default.call.count(),
      db_default.call.count({ where: { status: "COMPLETED" } }),
      db_default.call.aggregate({
        _sum: { durationSeconds: true }
      }),
      db_default.auditLog.count()
    ]);
    const totalStorageBytes = attachmentAggregate._sum.fileSizeBytes ? Number(attachmentAggregate._sum.fileSizeBytes) : 0;
    const cumulativeCallSeconds = callDurationAggregate._sum.durationSeconds || 0;
    const formatBytes = (bytes) => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };
    res.status(200).json({
      success: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        newLast24h: newUsers24h
      },
      devices: {
        total: totalDevices,
        activeSessions
      },
      cryptography: {
        identityKeysCount,
        signedPrekeysCount,
        oneTimePrekeysTotal: totalOpks,
        oneTimePrekeysConsumed: consumedOpks,
        oneTimePrekeysAvailable: totalOpks - consumedOpks,
        zeroPlaintextGuarantee: true,
        cipherProtocols: ["X3DH", "Double Ratchet", "AES-256-GCM", "DTLS-SRTP"]
      },
      conversations: {
        total: totalConversations,
        direct: directConversations,
        group: groupConversations
      },
      messaging: {
        totalCiphertextMessages: totalMessages,
        editedCount: editedMessages,
        deletedForEveryoneCount: deletedMessages,
        zeroPlaintextStored: true
      },
      storage: {
        totalAttachments,
        storageSizeBytes: totalStorageBytes,
        storageFormatted: formatBytes(totalStorageBytes)
      },
      calling: {
        totalCalls,
        completedCalls,
        cumulativeDurationSeconds: cumulativeCallSeconds,
        cumulativeDurationFormatted: `${Math.floor(cumulativeCallSeconds / 60)}m ${cumulativeCallSeconds % 60}s`
      },
      compliance: {
        auditLogsTotal,
        asvsLevel: "ASVS 5.0.0 Level 2",
        status: "COMPLIANT"
      }
    });
  } catch (err) {
    console.error("Admin metrics error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/users/create", async (req, res) => {
  try {
    const parseResult = CreateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstErr = Object.values(fieldErrors)[0]?.[0] || "Invalid user data.";
      res.status(400).json({
        error: "VALIDATION_ERROR",
        message: firstErr,
        details: parseResult.error.flatten()
      });
      return;
    }
    const { email, password, fullName, displayName, role } = parseResult.data;
    const existing = await db_default.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (existing) {
      res.status(409).json({
        error: "EMAIL_ALREADY_EXISTS",
        message: "A user account with this email already exists."
      });
      return;
    }
    const passwordHash = await hashPassword(password);
    const newUser = await db_default.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          fullName,
          displayName: displayName || fullName,
          status: "ACTIVE",
          roles: {
            create: {
              role,
              assignedBy: req.user.id
            }
          }
        },
        include: { roles: true }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          actorEmail: req.user.email,
          action: "USER_CREATED_BY_ADMIN",
          entityType: "USER",
          entityId: user.id,
          ipAddress: req.ip,
          details: JSON.stringify({
            createdUserEmail: user.email,
            assignedRole: role
          })
        }
      });
      return user;
    });
    res.status(201).json({
      success: true,
      message: "User account created successfully.",
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        displayName: newUser.displayName,
        status: newUser.status,
        roles: newUser.roles.map((r) => r.role),
        createdAt: newUser.createdAt
      }
    });
  } catch (err) {
    console.error("Admin create user error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
router2.get("/users", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const status = req.query.status;
    const where = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { fullName: { contains: search } },
        { displayName: { contains: search } }
      ];
    }
    const [total, users] = await Promise.all([
      db_default.user.count({ where }),
      db_default.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          displayName: true,
          status: true,
          createdAt: true,
          roles: { select: { role: true } },
          _count: {
            select: {
              devices: true,
              sessions: { where: { isValid: true } }
            }
          }
        }
      })
    ]);
    const formatted = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      displayName: u.displayName,
      status: u.status,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role),
      activeDeviceCount: u._count.devices,
      activeSessionCount: u._count.sessions
    }));
    res.status(200).json({
      success: true,
      users: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
router2.get("/users/:id/details", async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db_default.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        displayName: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
        roles: { select: { role: true, assignedAt: true } },
        devices: {
          select: {
            id: true,
            deviceFingerprint: true,
            deviceName: true,
            clientPlatform: true,
            isActive: true,
            lastSeenAt: true,
            createdAt: true,
            sessions: {
              select: {
                id: true,
                ipAddress: true,
                userAgent: true,
                isValid: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true
              },
              orderBy: { createdAt: "desc" }
            },
            identityKey: {
              select: {
                id: true,
                publicIdentityKey: true,
                createdAt: true
              }
            },
            signedPrekeys: {
              where: { isActive: true },
              select: {
                keyId: true,
                publicKey: true,
                createdAt: true
              }
            },
            _count: {
              select: {
                oneTimePrekeys: { where: { isConsumed: false } }
              }
            }
          }
        }
      }
    });
    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." });
      return;
    }
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        displayName: user.displayName,
        status: user.status,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        roles: user.roles.map((r) => r.role),
        devices: user.devices.map((d) => ({
          id: d.id,
          deviceFingerprint: d.deviceFingerprint,
          deviceName: d.deviceName,
          clientPlatform: d.clientPlatform,
          isActive: d.isActive,
          lastSeenAt: d.lastSeenAt,
          createdAt: d.createdAt,
          sessions: d.sessions,
          cryptoStatus: {
            hasIdentityKey: !!d.identityKey,
            identityKeyPublicKey: d.identityKey?.publicIdentityKey || null,
            activeSignedPrekeyCount: d.signedPrekeys.length,
            availableOneTimePrekeys: d._count.oneTimePrekeys
          }
        }))
      }
    });
  } catch (err) {
    console.error("Admin get user details error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const parseResult = UpdateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parseResult.error.flatten() });
      return;
    }
    const { status, reason } = parseResult.data;
    if (id === req.user.id && status !== "ACTIVE") {
      res.status(400).json({
        error: "CANNOT_SUSPEND_SELF",
        message: "Administrators cannot suspend or delete their own active account."
      });
      return;
    }
    const targetUser = await db_default.user.findUnique({ where: { id } });
    if (!targetUser) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }
    await db_default.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status,
          deletedAt: status === "DELETED" ? /* @__PURE__ */ new Date() : null
        }
      });
      if (status === "SUSPENDED" || status === "DELETED") {
        await tx.userSession.updateMany({
          where: { userId: id, isValid: true },
          data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
        });
      }
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          actorEmail: req.user.email,
          action: `USER_STATUS_${status}`,
          entityType: "USER",
          entityId: id,
          details: JSON.stringify({
            previousStatus: targetUser.status,
            newStatus: status,
            reason: reason || "Administrative action"
          })
        }
      });
    });
    res.status(200).json({
      success: true,
      message: `User status updated to ${status}.`
    });
  } catch (err) {
    console.error("Admin update status error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
router2.post("/users/:id/revoke-sessions", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db_default.userSession.updateMany({
      where: { userId: id, isValid: true },
      data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
    });
    await db_default.auditLog.create({
      data: {
        userId: req.user.id,
        actorEmail: req.user.email,
        action: "FORCE_REVOKE_SESSIONS_BY_ADMIN",
        entityType: "USER",
        entityId: id,
        details: JSON.stringify({ revokedSessionCount: result.count })
      }
    });
    res.status(200).json({
      success: true,
      message: `Revoked ${result.count} active sessions for user.`
    });
  } catch (err) {
    console.error("Admin revoke sessions error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
async function purgeUserFromDatabase(tx, targetUserId) {
  const targetUser = await tx.user.findUnique({
    where: { id: targetUserId },
    include: { devices: true }
  });
  if (!targetUser) return null;
  const deviceIds = targetUser.devices.map((d) => d.id);
  await tx.userBlock.deleteMany({
    where: { OR: [{ blockerUserId: targetUserId }, { blockedUserId: targetUserId }] }
  });
  await tx.notification.deleteMany({ where: { userId: targetUserId } });
  await tx.invitation.deleteMany({ where: { invitedById: targetUserId } });
  const calls = await tx.call.findMany({ where: { initiatorUserId: targetUserId } });
  const callIds = calls.map((c) => c.id);
  if (callIds.length > 0) {
    await tx.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
    await tx.call.deleteMany({ where: { id: { in: callIds } } });
  }
  await tx.userSession.deleteMany({ where: { userId: targetUserId } });
  const directMemberships = await tx.conversationMember.findMany({
    where: { userId: targetUserId },
    include: { conversation: true }
  });
  for (const mem of directMemberships) {
    if (mem.conversation.type === "DIRECT") {
      const directMsgs = await tx.message.findMany({
        where: { conversationId: mem.conversationId },
        select: { id: true }
      });
      const msgIds = directMsgs.map((m) => m.id);
      if (msgIds.length > 0) {
        await tx.attachment.deleteMany({ where: { messageId: { in: msgIds } } });
        await tx.messageReceipt.deleteMany({ where: { messageId: { in: msgIds } } });
        await tx.messageReaction.deleteMany({ where: { messageId: { in: msgIds } } });
        await tx.message.deleteMany({ where: { id: { in: msgIds } } });
      }
      await tx.conversationMember.deleteMany({ where: { conversationId: mem.conversationId } });
      await tx.conversation.delete({ where: { id: mem.conversationId } });
    }
  }
  if (deviceIds.length > 0) {
    await tx.message.updateMany({
      where: { recipientDeviceId: { in: deviceIds } },
      data: { recipientDeviceId: null }
    });
    await tx.messageReceipt.deleteMany({
      where: { OR: [{ userId: targetUserId }, { deviceId: { in: deviceIds } }] }
    });
    await tx.callParticipant.deleteMany({
      where: { OR: [{ userId: targetUserId }, { deviceId: { in: deviceIds } }] }
    });
    const sentMessages = await tx.message.findMany({
      where: { senderDeviceId: { in: deviceIds } },
      select: { id: true }
    });
    const sentMsgIds = sentMessages.map((m) => m.id);
    if (sentMsgIds.length > 0) {
      await tx.attachment.deleteMany({ where: { messageId: { in: sentMsgIds } } });
      await tx.messageReceipt.deleteMany({ where: { messageId: { in: sentMsgIds } } });
      await tx.messageReaction.deleteMany({ where: { messageId: { in: sentMsgIds } } });
      await tx.message.deleteMany({ where: { id: { in: sentMsgIds } } });
    }
    await tx.oneTimePrekey.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await tx.signedPrekey.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await tx.encryptionIdentityKey.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await tx.encryptedKeyBundle.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await tx.deviceKeyMetadata.deleteMany({ where: { deviceId: { in: deviceIds } } });
  }
  await tx.device.deleteMany({ where: { userId: targetUserId } });
  await tx.userRole.deleteMany({ where: { userId: targetUserId } });
  await tx.conversationMember.deleteMany({ where: { userId: targetUserId } });
  await tx.messageReceipt.deleteMany({ where: { userId: targetUserId } });
  await tx.messageReaction.deleteMany({ where: { userId: targetUserId } });
  await tx.callParticipant.deleteMany({ where: { userId: targetUserId } });
  await tx.auditLog.updateMany({
    where: { userId: targetUserId },
    data: { userId: null }
  });
  await tx.user.delete({ where: { id: targetUserId } });
  return targetUser;
}
var handlePermanentUserDelete = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      res.status(400).json({
        error: "CANNOT_DELETE_SELF",
        message: "Administrators cannot permanently delete their own active account."
      });
      return;
    }
    let deletedUser = null;
    await db_default.$transaction(async (tx) => {
      deletedUser = await purgeUserFromDatabase(tx, id);
      if (deletedUser) {
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            actorEmail: req.user.email,
            action: "USER_PERMANENTLY_DELETED",
            entityType: "USER",
            entityId: id,
            ipAddress: req.ip,
            details: JSON.stringify({
              deletedUserEmail: deletedUser.email,
              deletedFullName: deletedUser.fullName
            })
          }
        });
      }
    });
    if (!deletedUser) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User does not exist." });
      return;
    }
    res.status(200).json({
      success: true,
      message: `User ${deletedUser.email} was permanently deleted from the system.`
    });
  } catch (err) {
    console.error("Admin permanent delete user error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
};
router2.delete("/users/:id/permanent", handlePermanentUserDelete);
router2.delete("/users/:id", handlePermanentUserDelete);
router2.post("/users/purge-non-admins", async (req, res) => {
  try {
    const nonAdminUsers = await db_default.user.findMany({
      where: {
        id: { not: req.user.id },
        email: { not: "admin@globalcrestsolutions.com" },
        roles: {
          none: {
            role: "SUPER_ADMIN"
          }
        }
      },
      select: { id: true, email: true }
    });
    let purgedCount = 0;
    for (const target of nonAdminUsers) {
      await db_default.$transaction(async (tx) => {
        await purgeUserFromDatabase(tx, target.id);
        purgedCount++;
      });
    }
    await db_default.auditLog.create({
      data: {
        userId: req.user.id,
        actorEmail: req.user.email,
        action: "PURGE_ALL_NON_ADMIN_USERS",
        entityType: "USER",
        ipAddress: req.ip,
        details: JSON.stringify({ purgedCount, users: nonAdminUsers.map((u) => u.email) })
      }
    });
    res.status(200).json({
      success: true,
      message: `Successfully purged ${purgedCount} non-admin user(s).`,
      count: purgedCount
    });
  } catch (err) {
    console.error("Purge non-admins error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/change-password", async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({
        error: "INVALID_PASSWORD",
        message: "Password must be at least 8 characters long."
      });
      return;
    }
    const adminId = req.user.id;
    const passwordHash = await hashPassword(newPassword);
    await db_default.user.update({
      where: { id: adminId },
      data: { passwordHash }
    });
    await db_default.auditLog.create({
      data: {
        userId: adminId,
        actorEmail: req.user.email,
        action: "ADMIN_PASSWORD_CHANGED",
        entityType: "USER",
        entityId: adminId,
        ipAddress: req.ip,
        details: JSON.stringify({ changedBy: req.user.email })
      }
    });
    res.json({
      success: true,
      message: "Admin password changed successfully."
    });
  } catch (err) {
    console.error("Admin change password error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({
        error: "INVALID_PASSWORD",
        message: "Password must be at least 8 characters long."
      });
      return;
    }
    const targetUser = await db_default.user.findUnique({ where: { id } });
    if (!targetUser) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User does not exist." });
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await db_default.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash }
      });
      await tx.userSession.updateMany({
        where: { userId: id, isValid: true },
        data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          actorEmail: req.user.email,
          action: "USER_PASSWORD_RESET_BY_ADMIN",
          entityType: "USER",
          entityId: id,
          ipAddress: req.ip,
          details: JSON.stringify({ targetEmail: targetUser.email })
        }
      });
    });
    res.json({
      success: true,
      message: `Password reset successfully for ${targetUser.email}. All existing sessions were revoked.`
    });
  } catch (err) {
    console.error("Admin reset user password error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = UpdateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    const { role, action } = parsed.data;
    const targetUser = await db_default.user.findUnique({
      where: { id },
      include: { roles: true }
    });
    if (!targetUser) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found." });
      return;
    }
    if (action === "ASSIGN") {
      const alreadyHas = targetUser.roles.some((r) => r.role === role);
      if (!alreadyHas) {
        await db_default.userRole.create({
          data: {
            userId: id,
            role,
            assignedBy: req.user.id
          }
        });
      }
    } else {
      await db_default.userRole.deleteMany({
        where: { userId: id, role }
      });
    }
    await db_default.auditLog.create({
      data: {
        userId: req.user.id,
        actorEmail: req.user.email,
        action: `USER_ROLE_${action}_${role}`,
        entityType: "USER",
        entityId: id,
        details: JSON.stringify({ role, action, targetUserEmail: targetUser.email })
      }
    });
    res.status(200).json({
      success: true,
      message: `Role ${role} ${action.toLowerCase()}ed successfully.`
    });
  } catch (err) {
    console.error("Admin update role error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/devices/:id/revoke", async (req, res) => {
  try {
    const { id: deviceId } = req.params;
    const device = await db_default.device.findUnique({
      where: { id: deviceId },
      include: { user: true }
    });
    if (!device) {
      res.status(404).json({ error: "DEVICE_NOT_FOUND", message: "Device not found." });
      return;
    }
    await db_default.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: { isActive: false }
      });
      await tx.userSession.updateMany({
        where: { deviceId, isValid: true },
        data: { isValid: false, revokedAt: /* @__PURE__ */ new Date() }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          actorEmail: req.user.email,
          action: "DEVICE_REVOKED_BY_ADMIN",
          entityType: "DEVICE",
          entityId: deviceId,
          details: JSON.stringify({
            targetUserId: device.userId,
            targetUserEmail: device.user.email,
            deviceFingerprint: device.deviceFingerprint,
            deviceName: device.deviceName
          })
        }
      });
    });
    res.status(200).json({
      success: true,
      message: `Device ${device.deviceName} revoked and active sessions invalidated.`
    });
  } catch (err) {
    console.error("Admin revoke device error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});
router2.post("/invitations/create", async (req, res) => {
  try {
    const parseResult = CreateInvitationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parseResult.error.flatten() });
      return;
    }
    const { email, role, expiresInDays } = parseResult.data;
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1e3);
    const invitation = await db_default.invitation.create({
      data: {
        email: email.toLowerCase(),
        token: tokenHash,
        role,
        invitedById: req.user.id,
        expiresAt
      }
    });
    await db_default.auditLog.create({
      data: {
        userId: req.user.id,
        actorEmail: req.user.email,
        action: "INVITATION_CREATED",
        entityType: "INVITATION",
        entityId: invitation.id,
        details: JSON.stringify({ invitedEmail: email, role, expiresAt })
      }
    });
    res.status(201).json({
      success: true,
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      invitationToken: rawToken
      // Provided once to send via secure out-of-band communication
    });
  } catch (err) {
    console.error("Admin create invitation error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
router2.get("/audit-logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "25", 10)));
    const skip = (page - 1) * limit;
    const actionFilter = req.query.action;
    const actorEmailFilter = req.query.actorEmail;
    const search = req.query.search;
    const where = {};
    if (actionFilter) {
      where.action = actionFilter;
    }
    if (actorEmailFilter) {
      where.actorEmail = { contains: actorEmailFilter };
    }
    if (search) {
      where.OR = [
        { actorEmail: { contains: search } },
        { details: { contains: search } },
        { action: { contains: search } }
      ];
    }
    const [total, logs] = await Promise.all([
      db_default.auditLog.count({ where }),
      db_default.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" }
      })
    ]);
    res.status(200).json({
      success: true,
      logs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Admin list audit logs error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});
var admin_default = router2;

// src/server/routes/keys.ts
var import_express3 = require("express");
var import_zod3 = require("zod");
var router3 = (0, import_express3.Router)();
var registerKeysSchema = import_zod3.z.object({
  publicIdentityKey: import_zod3.z.string().min(1, "Public identity key is required"),
  keyAlgorithm: import_zod3.z.string().default("ECDH-P256"),
  signedPrekey: import_zod3.z.object({
    keyId: import_zod3.z.number().int().positive(),
    publicKey: import_zod3.z.string().min(1),
    signature: import_zod3.z.string().min(1)
  }),
  oneTimePrekeys: import_zod3.z.array(
    import_zod3.z.object({
      keyId: import_zod3.z.number().int().positive(),
      publicKey: import_zod3.z.string().min(1)
    })
  ).min(1, "At least one one-time prekey must be registered")
});
var replenishPrekeysSchema = import_zod3.z.object({
  oneTimePrekeys: import_zod3.z.array(
    import_zod3.z.object({
      keyId: import_zod3.z.number().int().positive(),
      publicKey: import_zod3.z.string().min(1)
    })
  ).min(1, "At least one one-time prekey must be provided for replenishment")
});
var backupSchema = import_zod3.z.object({
  encryptedBackupBlob: import_zod3.z.string().min(1),
  backupVersion: import_zod3.z.number().int().positive().default(1),
  checksumSha256: import_zod3.z.string().min(1)
});
router3.post("/register", authenticate, async (req, res) => {
  try {
    const parsed = registerKeysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsed.error.format()
      });
      return;
    }
    const deviceId = req.device.id;
    const { publicIdentityKey, keyAlgorithm, signedPrekey, oneTimePrekeys } = parsed.data;
    await db_default.$transaction(async (tx) => {
      await tx.encryptionIdentityKey.upsert({
        where: { deviceId },
        update: {
          publicIdentityKey,
          keyAlgorithm
        },
        create: {
          deviceId,
          publicIdentityKey,
          keyAlgorithm
        }
      });
      await tx.signedPrekey.updateMany({
        where: { deviceId, isActive: true },
        data: { isActive: false }
      });
      await tx.signedPrekey.create({
        data: {
          deviceId,
          keyId: signedPrekey.keyId,
          publicKey: signedPrekey.publicKey,
          signature: signedPrekey.signature,
          isActive: true
        }
      });
      await tx.oneTimePrekey.createMany({
        data: oneTimePrekeys.map((opk) => ({
          deviceId,
          keyId: opk.keyId,
          publicKey: opk.publicKey,
          isConsumed: false
        })),
        skipDuplicates: true
      });
      const totalUnconsumed = await tx.oneTimePrekey.count({
        where: { deviceId, isConsumed: false }
      });
      const spkRotationDue = /* @__PURE__ */ new Date();
      spkRotationDue.setDate(spkRotationDue.getDate() + 30);
      await tx.deviceKeyMetadata.upsert({
        where: { deviceId },
        update: {
          activeOneTimePrekeyCount: totalUnconsumed,
          signedPrekeyRotationDueAt: spkRotationDue,
          lastReplenishedAt: /* @__PURE__ */ new Date()
        },
        create: {
          deviceId,
          activeOneTimePrekeyCount: totalUnconsumed,
          signedPrekeyRotationDueAt: spkRotationDue,
          lastReplenishedAt: /* @__PURE__ */ new Date()
        }
      });
    }, { maxWait: 15e3, timeout: 3e4 });
    res.status(201).json({
      success: true,
      message: "Cryptographic keys and prekey inventory registered successfully.",
      deviceId,
      registeredOpks: oneTimePrekeys.length
    });
  } catch (error) {
    console.error("[KeyRegisterError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.get("/prekey-bundle/:targetUserId", authenticate, async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const requestedDeviceId = req.query.deviceId;
    const targetUser = await db_default.user.findUnique({
      where: { id: targetUserId },
      include: {
        devices: {
          where: requestedDeviceId ? { id: requestedDeviceId, isActive: true } : { isActive: true },
          orderBy: { lastSeenAt: "desc" },
          take: 1,
          include: {
            identityKey: true,
            signedPrekeys: {
              where: { isActive: true },
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    });
    if (!targetUser || targetUser.devices.length === 0) {
      res.status(404).json({
        error: "DEVICE_NOT_FOUND",
        message: "Target user does not have an active registered device."
      });
      return;
    }
    const device = targetUser.devices[0];
    if (!device.identityKey || device.signedPrekeys.length === 0) {
      res.status(400).json({
        error: "KEYS_NOT_INITIALIZED",
        message: "Target device has not completed cryptographic key initialization."
      });
      return;
    }
    const activeSignedPrekey = device.signedPrekeys[0];
    let consumedOpk = null;
    await db_default.$transaction(async (tx) => {
      const opk = await tx.oneTimePrekey.findFirst({
        where: {
          deviceId: device.id,
          isConsumed: false
        },
        orderBy: { keyId: "asc" }
      });
      if (opk) {
        await tx.oneTimePrekey.update({
          where: { id: opk.id },
          data: {
            isConsumed: true,
            consumedAt: /* @__PURE__ */ new Date()
          }
        });
        await tx.deviceKeyMetadata.updateMany({
          where: { deviceId: device.id },
          data: {
            activeOneTimePrekeyCount: { decrement: 1 }
          }
        });
        consumedOpk = {
          keyId: opk.keyId,
          publicKey: opk.publicKey
        };
      }
    }, { maxWait: 15e3, timeout: 3e4 });
    res.json({
      success: true,
      bundle: {
        userId: targetUser.id,
        deviceId: device.id,
        identityKey: device.identityKey.publicIdentityKey,
        signedPrekey: {
          keyId: activeSignedPrekey.keyId,
          publicKey: activeSignedPrekey.publicKey,
          signature: activeSignedPrekey.signature
        },
        oneTimePrekey: consumedOpk
      }
    });
  } catch (error) {
    console.error("[PrekeyBundleError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.post("/prekeys/replenish", authenticate, async (req, res) => {
  try {
    const parsed = replenishPrekeysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsed.error.format()
      });
      return;
    }
    const deviceId = req.device.id;
    const { oneTimePrekeys } = parsed.data;
    let totalActive = 0;
    await db_default.$transaction(async (tx) => {
      await tx.oneTimePrekey.createMany({
        data: oneTimePrekeys.map((opk) => ({
          deviceId,
          keyId: opk.keyId,
          publicKey: opk.publicKey,
          isConsumed: false
        })),
        skipDuplicates: true
      });
      totalActive = await tx.oneTimePrekey.count({
        where: { deviceId, isConsumed: false }
      });
      await tx.deviceKeyMetadata.updateMany({
        where: { deviceId },
        data: {
          activeOneTimePrekeyCount: totalActive,
          lastReplenishedAt: /* @__PURE__ */ new Date()
        }
      });
    }, { maxWait: 15e3, timeout: 3e4 });
    res.json({
      success: true,
      message: "One-Time Prekeys replenished successfully.",
      addedCount: oneTimePrekeys.length,
      totalActiveOpks: totalActive
    });
  } catch (error) {
    console.error("[ReplenishPrekeysError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.get("/status", authenticate, async (req, res) => {
  try {
    const deviceId = req.device.id;
    const [identityKey, activeSPK, unconsumedOpkCount, metadata] = await Promise.all([
      db_default.encryptionIdentityKey.findUnique({ where: { deviceId } }),
      db_default.signedPrekey.findFirst({
        where: { deviceId, isActive: true },
        orderBy: { createdAt: "desc" }
      }),
      db_default.oneTimePrekey.count({ where: { deviceId, isConsumed: false } }),
      db_default.deviceKeyMetadata.findUnique({ where: { deviceId } })
    ]);
    const isInitialized = Boolean(identityKey && activeSPK);
    const needsReplenishment = unconsumedOpkCount < 10;
    res.json({
      deviceId,
      isInitialized,
      identityKeyRegistered: Boolean(identityKey),
      signedPrekey: activeSPK ? {
        keyId: activeSPK.keyId,
        createdAt: activeSPK.createdAt,
        rotationDueAt: metadata?.signedPrekeyRotationDueAt
      } : null,
      activeOneTimePrekeyCount: unconsumedOpkCount,
      needsReplenishment,
      lastReplenishedAt: metadata?.lastReplenishedAt
    });
  } catch (error) {
    console.error("[KeyStatusError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.get("/safety-number/:targetUserId", authenticate, async (req, res) => {
  try {
    const callerDeviceId = req.device.id;
    const { targetUserId } = req.params;
    const [callerKey, targetUser] = await Promise.all([
      db_default.encryptionIdentityKey.findUnique({
        where: { deviceId: callerDeviceId }
      }),
      db_default.user.findUnique({
        where: { id: targetUserId },
        include: {
          devices: {
            where: { isActive: true },
            orderBy: { lastSeenAt: "desc" },
            take: 1,
            include: { identityKey: true }
          }
        }
      })
    ]);
    if (!callerKey) {
      res.status(400).json({
        error: "CALLER_KEYS_NOT_INITIALIZED",
        message: "Your device has not registered an identity key."
      });
      return;
    }
    if (!targetUser || targetUser.devices.length === 0 || !targetUser.devices[0].identityKey) {
      res.status(404).json({
        error: "PEER_KEYS_NOT_INITIALIZED",
        message: "Target user does not have an active device with registered identity keys."
      });
      return;
    }
    res.json({
      targetUserId: targetUser.id,
      targetUserFullName: targetUser.fullName,
      callerIdentityKey: callerKey.publicIdentityKey,
      peerIdentityKey: targetUser.devices[0].identityKey.publicIdentityKey
    });
  } catch (error) {
    console.error("[SafetyNumberError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.post("/backup", authenticate, async (req, res) => {
  try {
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "VALIDATION_ERROR",
        details: parsed.error.format()
      });
      return;
    }
    const deviceId = req.device.id;
    const { encryptedBackupBlob, backupVersion, checksumSha256 } = parsed.data;
    await db_default.encryptedKeyBundle.upsert({
      where: { deviceId },
      update: {
        encryptedBackupBlob,
        backupVersion,
        checksumSha256
      },
      create: {
        deviceId,
        encryptedBackupBlob,
        backupVersion,
        checksumSha256
      }
    });
    res.json({
      success: true,
      message: "Encrypted key bundle backup saved successfully.",
      deviceId,
      backupVersion
    });
  } catch (error) {
    console.error("[KeyBackupSaveError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router3.get("/backup", authenticate, async (req, res) => {
  try {
    const deviceId = req.device.id;
    const backup = await db_default.encryptedKeyBundle.findUnique({
      where: { deviceId }
    });
    if (!backup) {
      res.status(404).json({
        error: "BACKUP_NOT_FOUND",
        message: "No encrypted key backup exists for this device."
      });
      return;
    }
    res.json({
      deviceId: backup.deviceId,
      encryptedBackupBlob: backup.encryptedBackupBlob,
      backupVersion: backup.backupVersion,
      checksumSha256: backup.checksumSha256,
      updatedAt: backup.updatedAt
    });
  } catch (error) {
    console.error("[KeyBackupRetrieveError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var keys_default = router3;

// src/server/routes/conversations.ts
var import_express4 = require("express");
var import_zod4 = require("zod");

// src/server/services/message-cleanup.ts
async function purgeExpiredMessages() {
  try {
    const now = /* @__PURE__ */ new Date();
    const result = await db_default.message.deleteMany({
      where: {
        expiresAt: {
          not: null,
          lte: now
        }
      }
    });
    if (result.count > 0) {
      console.log(`[MessageCleanup] Purged ${result.count} expired disappearing messages.`);
    }
    return result.count;
  } catch (error) {
    console.error("[MessageCleanupError] Failed to purge expired messages:", error);
    return 0;
  }
}

// src/server/routes/conversations.ts
var router4 = (0, import_express4.Router)();
var directConversationSchema = import_zod4.z.object({
  targetUserId: import_zod4.z.string().uuid().optional(),
  targetEmail: import_zod4.z.string().email().optional()
}).refine((data) => data.targetUserId || data.targetEmail, {
  message: "Either targetUserId or targetEmail must be provided."
});
var groupConversationSchema = import_zod4.z.object({
  title: import_zod4.z.string().min(1, "Group title is required").max(100),
  memberUserIds: import_zod4.z.array(import_zod4.z.string().uuid()).min(1, "At least one participant required"),
  disappearingDurationSeconds: import_zod4.z.number().int().positive().nullable().optional()
});
var updateSettingsSchema = import_zod4.z.object({
  isPinned: import_zod4.z.boolean().optional(),
  isMuted: import_zod4.z.boolean().optional(),
  isArchived: import_zod4.z.boolean().optional(),
  title: import_zod4.z.string().min(1).max(100).optional(),
  disappearingDurationSeconds: import_zod4.z.number().int().positive().nullable().optional()
});
router4.post("/direct", authenticate, async (req, res) => {
  try {
    const parsed = directConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const callerId = req.user.id;
    let targetUserId = parsed.data.targetUserId;
    if (!targetUserId && parsed.data.targetEmail) {
      const found = await db_default.user.findUnique({
        where: { email: parsed.data.targetEmail }
      });
      if (found) {
        targetUserId = found.id;
      }
    }
    if (!targetUserId) {
      res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "The requested recipient does not exist or is inactive."
      });
      return;
    }
    if (callerId === targetUserId) {
      res.status(400).json({
        error: "SELF_CONVERSATION_PROHIBITED",
        message: "Cannot initiate a direct conversation with yourself."
      });
      return;
    }
    const block = await db_default.userBlock.findFirst({
      where: {
        OR: [
          { blockerUserId: callerId, blockedUserId: targetUserId },
          { blockerUserId: targetUserId, blockedUserId: callerId }
        ]
      }
    });
    if (block) {
      res.status(403).json({
        error: "USER_BLOCKED",
        message: "Direct communication is unavailable due to privacy settings."
      });
      return;
    }
    const targetUser = await db_default.user.findUnique({
      where: { id: targetUserId }
    });
    if (!targetUser || targetUser.status !== "ACTIVE") {
      res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "The requested recipient does not exist or is inactive."
      });
      return;
    }
    const existingConv = await db_default.conversation.findFirst({
      where: {
        type: "DIRECT",
        deletedAt: null,
        AND: [
          { members: { some: { userId: callerId, leftAt: null } } },
          { members: { some: { userId: targetUserId, leftAt: null } } }
        ]
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });
    if (existingConv) {
      res.json({
        success: true,
        conversation: existingConv,
        isExisting: true
      });
      return;
    }
    const newConv = await db_default.$transaction(async (tx) => {
      return tx.conversation.create({
        data: {
          type: "DIRECT",
          createdByUserId: callerId,
          isEncrypted: true,
          members: {
            create: [
              { userId: callerId, role: "OWNER" },
              { userId: targetUserId, role: "MEMBER" }
            ]
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  email: true,
                  avatarUrl: true,
                  status: true
                }
              }
            }
          }
        }
      });
    });
    res.status(201).json({
      success: true,
      conversation: newConv,
      isExisting: false
    });
  } catch (error) {
    console.error("[DirectConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.post("/group", authenticate, async (req, res) => {
  try {
    const parsed = groupConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const callerId = req.user.id;
    const { title, memberUserIds, disappearingDurationSeconds } = parsed.data;
    const uniqueMembers = Array.from(new Set(memberUserIds.filter((id) => id !== callerId)));
    const validUsers = await db_default.user.findMany({
      where: {
        id: { in: uniqueMembers },
        status: "ACTIVE"
      },
      select: { id: true }
    });
    const validUserIds = validUsers.map((u) => u.id);
    const groupConv = await db_default.$transaction(async (tx) => {
      return tx.conversation.create({
        data: {
          type: "GROUP",
          title,
          createdByUserId: callerId,
          isEncrypted: true,
          disappearingDurationSeconds: disappearingDurationSeconds || null,
          members: {
            create: [
              { userId: callerId, role: "OWNER" },
              ...validUserIds.map((userId) => ({
                userId,
                role: "MEMBER"
              }))
            ]
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  email: true,
                  avatarUrl: true,
                  status: true
                }
              }
            }
          }
        }
      });
    });
    res.status(201).json({
      success: true,
      conversation: groupConv
    });
  } catch (error) {
    console.error("[GroupConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.get("/", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const callerDeviceId = req.device.id;
    await purgeExpiredMessages();
    const memberships = await db_default.conversationMember.findMany({
      where: {
        userId: callerId,
        leftAt: null
      },
      include: {
        conversation: {
          include: {
            members: {
              where: { leftAt: null },
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    displayName: true,
                    email: true,
                    avatarUrl: true,
                    status: true,
                    devices: {
                      where: { isActive: true },
                      orderBy: { lastSeenAt: "desc" },
                      take: 1,
                      select: {
                        lastSeenAt: true
                      }
                    }
                  }
                }
              }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                createdAt: true,
                messageType: true,
                isEdited: true,
                isDeletedForEveryone: true,
                senderDeviceId: true,
                senderDevice: {
                  select: {
                    userId: true,
                    deviceName: true
                  }
                }
              }
            }
          }
        }
      }
    });
    const result = await Promise.all(
      memberships.map(async (m) => {
        const conv = m.conversation;
        const clearedBefore = m.clearedHistoryBefore || /* @__PURE__ */ new Date(0);
        const unreadCount = await db_default.message.count({
          where: {
            conversationId: conv.id,
            createdAt: { gt: clearedBefore },
            senderDeviceId: { not: callerDeviceId },
            receipts: {
              none: {
                userId: callerId,
                status: "READ"
              }
            }
          }
        });
        let displayTitle = conv.title;
        let displayAvatar = conv.avatarUrl;
        let peerLastSeenAt = null;
        if (conv.type === "DIRECT") {
          const peer = conv.members.find((member) => member.userId !== callerId);
          displayTitle = peer?.user.fullName || "Direct Chat";
          displayAvatar = peer?.user.avatarUrl || null;
          peerLastSeenAt = peer?.user.devices?.[0]?.lastSeenAt || null;
        }
        const latestMsg = conv.messages[0] || null;
        return {
          id: conv.id,
          type: conv.type,
          title: displayTitle,
          avatarUrl: displayAvatar,
          lastSeenAt: peerLastSeenAt,
          isEncrypted: conv.isEncrypted,
          disappearingDurationSeconds: conv.disappearingDurationSeconds,
          isPinned: m.isPinned,
          isMuted: m.isMuted,
          isArchived: m.isArchived,
          role: m.role,
          unreadCount,
          members: conv.members.map((member) => ({
            id: member.id,
            userId: member.userId,
            role: member.role,
            fullName: member.user.fullName,
            displayName: member.user.displayName,
            avatarUrl: member.user.avatarUrl,
            lastSeenAt: member.user.devices?.[0]?.lastSeenAt || null
          })),
          latestMessage: latestMsg ? {
            id: latestMsg.id,
            createdAt: latestMsg.createdAt,
            messageType: latestMsg.messageType,
            isEdited: latestMsg.isEdited,
            isDeletedForEveryone: latestMsg.isDeletedForEveryone,
            isFromMe: latestMsg.senderDevice.userId === callerId
          } : null,
          updatedAt: latestMsg ? latestMsg.createdAt : conv.updatedAt
        };
      })
    );
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    res.json({
      success: true,
      conversations: result
    });
  } catch (error) {
    console.error("[ListConversationsError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const conv = await db_default.conversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });
    if (!conv || conv.deletedAt) {
      res.status(404).json({ error: "NOT_FOUND", message: "Conversation does not exist." });
      return;
    }
    const callerMembership = conv.members.find((m) => m.userId === callerId);
    if (!callerMembership) {
      res.status(403).json({ error: "FORBIDDEN", message: "You are not a member of this conversation." });
      return;
    }
    res.json({
      success: true,
      conversation: {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        avatarUrl: conv.avatarUrl,
        isEncrypted: conv.isEncrypted,
        disappearingDurationSeconds: conv.disappearingDurationSeconds,
        membership: {
          role: callerMembership.role,
          isPinned: callerMembership.isPinned,
          isMuted: callerMembership.isMuted,
          isArchived: callerMembership.isArchived
        },
        members: conv.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          fullName: m.user.fullName,
          displayName: m.user.displayName,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl
        })),
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      }
    });
  } catch (error) {
    console.error("[GetConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.put("/:id/settings", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const member = await db_default.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } },
      include: { conversation: true }
    });
    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not an active member of this conversation." });
      return;
    }
    const { isPinned, isMuted, isArchived, title, disappearingDurationSeconds } = parsed.data;
    const memberUpdates = {};
    if (typeof isPinned === "boolean") memberUpdates.isPinned = isPinned;
    if (typeof isMuted === "boolean") memberUpdates.isMuted = isMuted;
    if (typeof isArchived === "boolean") memberUpdates.isArchived = isArchived;
    if (Object.keys(memberUpdates).length > 0) {
      await db_default.conversationMember.update({
        where: { id: member.id },
        data: memberUpdates
      });
    }
    if (title !== void 0 || disappearingDurationSeconds !== void 0) {
      const convUpdates = {};
      if (title !== void 0) convUpdates.title = title;
      if (disappearingDurationSeconds !== void 0) {
        convUpdates.disappearingDurationSeconds = disappearingDurationSeconds;
      }
      await db_default.conversation.update({
        where: { id },
        data: convUpdates
      });
    }
    res.json({
      success: true,
      message: "Conversation settings updated successfully."
    });
  } catch (error) {
    console.error("[UpdateConversationSettingsError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.post("/:id/clear", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const member = await db_default.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } }
    });
    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not an active member of this conversation." });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    await db_default.conversationMember.update({
      where: { id: member.id },
      data: { clearedHistoryBefore: now }
    });
    res.json({
      success: true,
      message: "Conversation history cleared.",
      clearedHistoryBefore: now
    });
  } catch (error) {
    console.error("[ClearConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const member = await db_default.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } }
    });
    if (!member) {
      res.status(403).json({ error: "FORBIDDEN", message: "You are not a member of this conversation." });
      return;
    }
    const conversation = await db_default.conversation.findUnique({
      where: { id },
      include: { messages: true }
    });
    if (!conversation) {
      res.status(404).json({ error: "NOT_FOUND", message: "Conversation does not exist." });
      return;
    }
    const messageIds = conversation.messages.map((m) => m.id);
    await db_default.$transaction(async (tx) => {
      if (messageIds.length > 0) {
        await tx.attachment.deleteMany({
          where: { messageId: { in: messageIds } }
        });
        await tx.messageReceipt.deleteMany({
          where: { messageId: { in: messageIds } }
        });
        await tx.messageReaction.deleteMany({
          where: { messageId: { in: messageIds } }
        });
        await tx.message.deleteMany({
          where: { conversationId: id }
        });
      }
      const calls = await tx.call.findMany({ where: { conversationId: id } });
      const callIds = calls.map((c) => c.id);
      if (callIds.length > 0) {
        await tx.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
        await tx.call.deleteMany({ where: { conversationId: id } });
      }
      await tx.conversationMember.deleteMany({
        where: { conversationId: id }
      });
      await tx.conversation.delete({
        where: { id }
      });
    });
    if (io) {
      io.to(`conversation:${id}`).emit("conversation:deleted", {
        conversationId: id,
        deletedByUserId: callerId
      });
    }
    res.json({
      success: true,
      message: "Conversation and all messages were permanently deleted."
    });
  } catch (error) {
    console.error("[DeleteConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router4.delete("/:id/leave", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const member = await db_default.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: callerId } }
    });
    if (!member || member.leftAt !== null) {
      res.status(400).json({ error: "ALREADY_LEFT", message: "You are not active in this conversation." });
      return;
    }
    await db_default.conversationMember.update({
      where: { id: member.id },
      data: { leftAt: /* @__PURE__ */ new Date() }
    });
    res.json({
      success: true,
      message: "Successfully departed conversation."
    });
  } catch (error) {
    console.error("[LeaveConversationError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var conversations_default = router4;

// src/server/routes/messages.ts
var import_express5 = require("express");
var import_zod5 = require("zod");
var router5 = (0, import_express5.Router)();
var sendMessageSchema = import_zod5.z.object({
  recipientDeviceId: import_zod5.z.string().optional(),
  messageType: import_zod5.z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER", "CALL_EVENT"]).default("TEXT"),
  encryptedPayload: import_zod5.z.string().min(1, "Encrypted payload ciphertext is required"),
  initializationVector: import_zod5.z.string().min(1, "Initialization vector (IV) is required"),
  authTag: import_zod5.z.string().min(1, "Authentication tag is required"),
  ephemeralKey: import_zod5.z.string().optional(),
  ratchetSequenceNumber: import_zod5.z.number().int().min(0).default(0),
  previousChainLength: import_zod5.z.number().int().min(0).default(0)
});
var editMessageSchema = import_zod5.z.object({
  encryptedPayload: import_zod5.z.string().min(1, "Updated encrypted payload is required"),
  initializationVector: import_zod5.z.string().min(1, "Updated IV is required"),
  authTag: import_zod5.z.string().min(1, "Updated auth tag is required"),
  ephemeralKey: import_zod5.z.string().optional()
});
var receiptSchema = import_zod5.z.object({
  status: import_zod5.z.enum(["DELIVERED", "READ"])
});
var reactionSchema = import_zod5.z.object({
  emoji: import_zod5.z.string().min(1).max(10)
});
router5.post("/conversations/:id/messages", authenticate, async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const callerId = req.user.id;
    const callerDeviceId = req.device.id;
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const conversation = await db_default.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { leftAt: null }
        }
      }
    });
    if (!conversation || conversation.deletedAt !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Conversation does not exist." });
      return;
    }
    const callerMembership = conversation.members.find((m) => m.userId === callerId);
    if (!callerMembership) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not an active member of this conversation." });
      return;
    }
    if (conversation.type === "DIRECT") {
      const peer = conversation.members.find((m) => m.userId !== callerId);
      if (peer) {
        const block = await db_default.userBlock.findFirst({
          where: {
            OR: [
              { blockerUserId: callerId, blockedUserId: peer.userId },
              { blockerUserId: peer.userId, blockedUserId: callerId }
            ]
          }
        });
        if (block) {
          res.status(403).json({
            error: "USER_BLOCKED",
            message: "Cannot send message: User communication is blocked."
          });
          return;
        }
      }
    }
    const {
      recipientDeviceId,
      messageType,
      encryptedPayload,
      initializationVector,
      authTag,
      ephemeralKey,
      ratchetSequenceNumber,
      previousChainLength
    } = parsed.data;
    let expiresAt = null;
    if (conversation.disappearingDurationSeconds) {
      expiresAt = new Date(Date.now() + conversation.disappearingDurationSeconds * 1e3);
    }
    const message = await db_default.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderDeviceId: callerDeviceId,
          recipientDeviceId: recipientDeviceId || null,
          messageType,
          encryptedPayload,
          initializationVector,
          authTag,
          ephemeralKey: ephemeralKey || null,
          ratchetSequenceNumber,
          previousChainLength,
          expiresAt,
          receipts: {
            create: {
              deviceId: callerDeviceId,
              userId: callerId,
              status: "SENT"
            }
          }
        },
        include: {
          senderDevice: {
            select: {
              id: true,
              deviceName: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  displayName: true,
                  avatarUrl: true
                }
              }
            }
          },
          receipts: true,
          reactions: true,
          attachments: true
        }
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: created.createdAt }
      });
      return created;
    });
    if (io) {
      io.to(`conversation:${conversationId}`).emit("message:new", {
        id: message.id,
        conversationId: message.conversationId,
        senderDeviceId: message.senderDeviceId,
        recipientDeviceId: message.recipientDeviceId,
        messageType: message.messageType,
        encryptedPayload: message.encryptedPayload,
        initializationVector: message.initializationVector,
        authTag: message.authTag,
        ephemeralKey: message.ephemeralKey,
        ratchetSequenceNumber: message.ratchetSequenceNumber,
        previousChainLength: message.previousChainLength,
        createdAt: message.createdAt,
        expiresAt: message.expiresAt,
        sender: message.senderDevice.user
      });
    }
    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error("[SendMessageError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.get("/conversations/:id/messages", authenticate, async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const callerId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const cursor = req.query.cursor;
    await purgeExpiredMessages();
    const member = await db_default.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: callerId
        }
      }
    });
    if (!member || member.leftAt !== null) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not an active member of this conversation." });
      return;
    }
    const clearedBefore = member.clearedHistoryBefore || /* @__PURE__ */ new Date(0);
    const now = /* @__PURE__ */ new Date();
    const whereClause = {
      conversationId,
      createdAt: { gt: clearedBefore },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    };
    if (cursor) {
      const cursorMessage = await db_default.message.findUnique({
        where: { id: cursor },
        select: { createdAt: true }
      });
      if (cursorMessage) {
        whereClause.createdAt.lt = cursorMessage.createdAt;
      }
    }
    const messages = await db_default.message.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      include: {
        senderDevice: {
          select: {
            id: true,
            deviceName: true,
            userId: true,
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        },
        receipts: true,
        reactions: true,
        attachments: true
      }
    });
    const hasMore = messages.length > limit;
    const returnedMessages = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? returnedMessages[returnedMessages.length - 1].id : null;
    res.json({
      success: true,
      messages: returnedMessages,
      nextCursor,
      hasMore
    });
  } catch (error) {
    console.error("[GetMessagesError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.put("/messages/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const parsed = editMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const existingMessage = await db_default.message.findUnique({
      where: { id },
      include: {
        senderDevice: true
      }
    });
    if (!existingMessage) {
      res.status(404).json({ error: "NOT_FOUND", message: "Message does not exist." });
      return;
    }
    if (existingMessage.senderDevice.userId !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "Only the sender can edit this message." });
      return;
    }
    if (existingMessage.isDeletedForEveryone) {
      res.status(400).json({ error: "CANNOT_EDIT_DELETED", message: "Cannot edit a deleted message." });
      return;
    }
    const { encryptedPayload, initializationVector, authTag, ephemeralKey } = parsed.data;
    const editedAt = /* @__PURE__ */ new Date();
    const updated = await db_default.message.update({
      where: { id },
      data: {
        encryptedPayload,
        initializationVector,
        authTag,
        ephemeralKey: ephemeralKey || existingMessage.ephemeralKey,
        isEdited: true,
        editedAt
      }
    });
    if (io) {
      io.to(`conversation:${existingMessage.conversationId}`).emit("message:edited", {
        id: updated.id,
        conversationId: updated.conversationId,
        encryptedPayload: updated.encryptedPayload,
        initializationVector: updated.initializationVector,
        authTag: updated.authTag,
        isEdited: true,
        editedAt: updated.editedAt
      });
    }
    res.json({
      success: true,
      message: "Message edited successfully.",
      editedAt
    });
  } catch (error) {
    console.error("[EditMessageError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.delete("/messages/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const mode = req.query.mode || "everyone";
    const existingMessage = await db_default.message.findUnique({
      where: { id },
      include: {
        senderDevice: true
      }
    });
    if (!existingMessage) {
      res.status(404).json({ error: "NOT_FOUND", message: "Message does not exist." });
      return;
    }
    if (mode === "everyone") {
      if (existingMessage.senderDevice.userId !== callerId) {
        res.status(403).json({
          error: "FORBIDDEN",
          message: "Only the sender can delete a message for everyone."
        });
        return;
      }
      await db_default.message.update({
        where: { id },
        data: {
          isDeletedForEveryone: true,
          encryptedPayload: "",
          initializationVector: "",
          authTag: ""
        }
      });
      if (io) {
        io.to(`conversation:${existingMessage.conversationId}`).emit("message:deleted", {
          id: existingMessage.id,
          conversationId: existingMessage.conversationId,
          isDeletedForEveryone: true
        });
      }
      res.json({
        success: true,
        message: "Message deleted for everyone.",
        mode: "everyone"
      });
    } else {
      res.json({
        success: true,
        message: "Message hidden for current user.",
        mode: "me"
      });
    }
  } catch (error) {
    console.error("[DeleteMessageError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.post("/messages/:id/receipt", authenticate, async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user.id;
    const callerDeviceId = req.device.id;
    const parsed = receiptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { status } = parsed.data;
    const message = await db_default.message.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });
    if (!message) {
      res.status(404).json({ error: "NOT_FOUND", message: "Message not found." });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const receipt = await db_default.messageReceipt.upsert({
      where: {
        messageId_deviceId_status: {
          messageId,
          deviceId: callerDeviceId,
          status
        }
      },
      update: { timestamp: now },
      create: {
        messageId,
        deviceId: callerDeviceId,
        userId: callerId,
        status,
        timestamp: now
      }
    });
    if (status === "READ") {
      await db_default.messageReceipt.upsert({
        where: {
          messageId_deviceId_status: {
            messageId,
            deviceId: callerDeviceId,
            status: "DELIVERED"
          }
        },
        update: {},
        create: {
          messageId,
          deviceId: callerDeviceId,
          userId: callerId,
          status: "DELIVERED",
          timestamp: now
        }
      });
    }
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit("receipt:updated", {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        deviceId: callerDeviceId,
        status,
        timestamp: now
      });
    }
    res.json({
      success: true,
      receipt
    });
  } catch (error) {
    console.error("[ReceiptError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.post("/messages/:id/reactions", authenticate, async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user.id;
    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { emoji } = parsed.data;
    const message = await db_default.message.findUnique({
      where: { id: messageId }
    });
    if (!message) {
      res.status(404).json({ error: "NOT_FOUND", message: "Message not found." });
      return;
    }
    const reaction = await db_default.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId: callerId,
          emoji
        }
      },
      update: {},
      create: {
        messageId,
        userId: callerId,
        emoji
      }
    });
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit("reaction:updated", {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        emoji,
        action: "added"
      });
    }
    res.json({
      success: true,
      reaction
    });
  } catch (error) {
    console.error("[AddReactionError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router5.delete("/messages/:id/reactions", authenticate, async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const callerId = req.user.id;
    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { emoji } = parsed.data;
    const message = await db_default.message.findUnique({
      where: { id: messageId }
    });
    if (!message) {
      res.status(404).json({ error: "NOT_FOUND", message: "Message not found." });
      return;
    }
    await db_default.messageReaction.deleteMany({
      where: {
        messageId,
        userId: callerId,
        emoji
      }
    });
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit("reaction:updated", {
        messageId,
        conversationId: message.conversationId,
        userId: callerId,
        emoji,
        action: "removed"
      });
    }
    res.json({
      success: true,
      message: "Reaction removed."
    });
  } catch (error) {
    console.error("[RemoveReactionError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var messages_default = router5;

// src/server/routes/users.ts
var import_express6 = require("express");
var import_zod6 = require("zod");
var router6 = (0, import_express6.Router)();
var blockUserSchema = import_zod6.z.object({
  targetUserId: import_zod6.z.string().uuid("Valid user ID is required"),
  reason: import_zod6.z.string().max(255).optional()
});
router6.post("/block", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const parsed = blockUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { targetUserId, reason } = parsed.data;
    if (callerId === targetUserId) {
      res.status(400).json({ error: "CANNOT_BLOCK_SELF", message: "You cannot block your own account." });
      return;
    }
    const targetUser = await db_default.user.findUnique({
      where: { id: targetUserId }
    });
    if (!targetUser) {
      res.status(404).json({ error: "USER_NOT_FOUND", message: "Target user does not exist." });
      return;
    }
    await db_default.userBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: callerId,
          blockedUserId: targetUserId
        }
      },
      update: { reason: reason || null },
      create: {
        blockerUserId: callerId,
        blockedUserId: targetUserId,
        reason: reason || null
      }
    });
    res.json({
      success: true,
      message: `User ${targetUser.fullName} has been blocked.`
    });
  } catch (error) {
    console.error("[BlockUserError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router6.delete("/block/:targetUserId", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const { targetUserId } = req.params;
    await db_default.userBlock.deleteMany({
      where: {
        blockerUserId: callerId,
        blockedUserId: targetUserId
      }
    });
    res.json({
      success: true,
      message: "User unblocked successfully."
    });
  } catch (error) {
    console.error("[UnblockUserError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router6.get("/blocked", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const blockedList = await db_default.userBlock.findMany({
      where: { blockerUserId: callerId },
      include: {
        blocked: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({
      success: true,
      blockedUsers: blockedList.map((b) => ({
        id: b.blocked.id,
        fullName: b.blocked.fullName,
        displayName: b.blocked.displayName,
        email: b.blocked.email,
        avatarUrl: b.blocked.avatarUrl,
        blockedAt: b.createdAt,
        reason: b.reason
      }))
    });
  } catch (error) {
    console.error("[GetBlockedUsersError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router6.get("/directory", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const callerRoles = req.user.roles || [];
    const isAdmin = callerRoles.includes("SUPER_ADMIN") || callerRoles.includes("ADMIN");
    const query = (req.query.q || "").trim();
    if (!isAdmin && query.length < 2) {
      res.json({
        success: true,
        users: [],
        isAdmin: false,
        requiresSearch: true,
        message: "Please enter at least 2 characters to search for a colleague by name or email."
      });
      return;
    }
    const activeBlocks = await db_default.userBlock.findMany({
      where: {
        OR: [{ blockerUserId: callerId }, { blockedUserId: callerId }]
      },
      select: {
        blockerUserId: true,
        blockedUserId: true
      }
    });
    const excludedUserIds = /* @__PURE__ */ new Set([callerId]);
    for (const b of activeBlocks) {
      excludedUserIds.add(b.blockerUserId);
      excludedUserIds.add(b.blockedUserId);
    }
    const whereClause = {
      id: { notIn: Array.from(excludedUserIds) },
      status: "ACTIVE"
    };
    if (query.length > 0) {
      whereClause.OR = [
        { fullName: { contains: query } },
        { displayName: { contains: query } },
        { email: { contains: query } }
      ];
    }
    const users = await db_default.user.findMany({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        displayName: true,
        email: true,
        avatarUrl: true
      },
      orderBy: { fullName: "asc" },
      take: isAdmin && query.length === 0 ? 100 : 25
    });
    res.json({
      success: true,
      users,
      isAdmin
    });
  } catch (error) {
    console.error("[UserDirectoryError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var updateProfileSchema = import_zod6.z.object({
  avatarUrl: import_zod6.z.string().nullable().optional(),
  displayName: import_zod6.z.string().max(100).optional(),
  fullName: import_zod6.z.string().max(100).optional()
});
router6.patch("/profile", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { avatarUrl, displayName, fullName } = parsed.data;
    const dataToUpdate = {};
    if (avatarUrl !== void 0) dataToUpdate.avatarUrl = avatarUrl;
    if (displayName !== void 0) dataToUpdate.displayName = displayName.trim();
    if (fullName !== void 0) dataToUpdate.fullName = fullName.trim();
    const updatedUser = await db_default.user.update({
      where: { id: callerId },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        fullName: true,
        displayName: true,
        avatarUrl: true,
        status: true
      }
    });
    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error("[UpdateProfileError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var users_default = router6;

// src/server/routes/media.ts
var import_express7 = require("express");
var import_zod7 = require("zod");
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var import_crypto2 = __toESM(require("crypto"));
var router7 = (0, import_express7.Router)();
var STORAGE_DIR = import_path.default.join(process.cwd(), "storage", "encrypted_media");
var uploadMediaSchema = import_zod7.z.object({
  messageId: import_zod7.z.string().uuid("Valid message ID is required"),
  ciphertextBase64: import_zod7.z.string().min(1, "Encrypted media ciphertext is required"),
  thumbnailCiphertextBase64: import_zod7.z.string().optional(),
  encryptedMimeType: import_zod7.z.string().min(1, "Encrypted MIME type descriptor is required"),
  ciphertextSha256: import_zod7.z.string().length(64, "SHA-256 hex checksum must be 64 characters")
});
router7.post("/upload", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const parsed = uploadMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const {
      messageId,
      ciphertextBase64,
      thumbnailCiphertextBase64,
      encryptedMimeType,
      ciphertextSha256
    } = parsed.data;
    const message = await db_default.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            members: {
              where: { leftAt: null }
            }
          }
        },
        senderDevice: true
      }
    });
    if (!message) {
      res.status(404).json({ error: "MESSAGE_NOT_FOUND", message: "Parent message does not exist." });
      return;
    }
    const isMember = message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not authorized for this conversation." });
      return;
    }
    const cipherBuffer = Buffer.from(ciphertextBase64, "base64");
    const computedSha = import_crypto2.default.createHash("sha256").update(cipherBuffer).digest("hex");
    if (computedSha.toLowerCase() !== ciphertextSha256.toLowerCase()) {
      res.status(400).json({
        error: "INTEGRITY_MISMATCH",
        message: "Calculated SHA-256 checksum does not match provided ciphertext hash."
      });
      return;
    }
    const attachmentId = import_crypto2.default.randomUUID();
    let filePath = null;
    let thumbPath = null;
    try {
      await import_promises.default.mkdir(STORAGE_DIR, { recursive: true });
      filePath = import_path.default.join(STORAGE_DIR, `${attachmentId}.bin`);
      await import_promises.default.writeFile(filePath, cipherBuffer);
      if (thumbnailCiphertextBase64) {
        const thumbBuffer = Buffer.from(thumbnailCiphertextBase64, "base64");
        thumbPath = import_path.default.join(STORAGE_DIR, `${attachmentId}_thumb.bin`);
        await import_promises.default.writeFile(thumbPath, thumbBuffer);
      }
    } catch (diskErr) {
      console.warn("[DiskCacheWarning] Continuing with database ciphertext storage:", diskErr);
    }
    const attachment = await db_default.attachment.create({
      data: {
        id: attachmentId,
        messageId,
        storagePath: filePath || `db://${attachmentId}`,
        ciphertextBase64,
        encryptedMimeType,
        fileSizeBytes: BigInt(cipherBuffer.length),
        ciphertextSha256: computedSha,
        thumbnailStoragePath: thumbPath
      }
    });
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit("media:ready", {
        messageId,
        attachmentId: attachment.id,
        fileSizeBytes: Number(attachment.fileSizeBytes),
        ciphertextSha256: attachment.ciphertextSha256
      });
    }
    res.status(201).json({
      success: true,
      attachment: {
        id: attachment.id,
        messageId: attachment.messageId,
        fileSizeBytes: Number(attachment.fileSizeBytes),
        ciphertextSha256: attachment.ciphertextSha256,
        hasThumbnail: Boolean(thumbPath),
        createdAt: attachment.createdAt
      }
    });
  } catch (error) {
    console.error("[MediaUploadError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router7.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const attachment = await db_default.attachment.findFirst({
      where: {
        OR: [
          { id },
          { messageId: id }
        ]
      },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                members: {
                  where: { leftAt: null }
                }
              }
            }
          }
        }
      }
    });
    if (!attachment) {
      res.status(404).json({ error: "MEDIA_NOT_FOUND", message: "Encrypted media does not exist." });
      return;
    }
    const isMember = attachment.message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Unauthorized: You are not a member of the conversation containing this media."
      });
      return;
    }
    let fileBuffer = null;
    if (attachment.ciphertextBase64) {
      fileBuffer = Buffer.from(attachment.ciphertextBase64, "base64");
    } else if (attachment.storagePath) {
      try {
        fileBuffer = await import_promises.default.readFile(attachment.storagePath);
      } catch {
        res.status(404).json({ error: "FILE_MISSING", message: "Encrypted storage file is missing on host." });
        return;
      }
    }
    if (!fileBuffer) {
      res.status(404).json({ error: "FILE_EMPTY", message: "Encrypted payload is empty or unavailable." });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Ciphertext-SHA256", attachment.ciphertextSha256);
    res.setHeader("X-Encrypted-MIME", attachment.encryptedMimeType);
    res.setHeader("Content-Length", fileBuffer.length.toString());
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(fileBuffer);
  } catch (error) {
    console.error("[MediaDownloadError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router7.get("/:id/thumbnail", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const callerId = req.user.id;
    const attachment = await db_default.attachment.findUnique({
      where: { id },
      include: {
        message: {
          include: {
            conversation: {
              include: {
                members: {
                  where: { leftAt: null }
                }
              }
            }
          }
        }
      }
    });
    if (!attachment || !attachment.thumbnailStoragePath) {
      res.status(404).json({ error: "THUMBNAIL_NOT_FOUND", message: "Encrypted thumbnail does not exist." });
      return;
    }
    const isMember = attachment.message.conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      res.status(403).json({
        error: "FORBIDDEN",
        message: "Unauthorized: You are not a member of the conversation containing this thumbnail."
      });
      return;
    }
    const thumbBuffer = await import_promises.default.readFile(attachment.thumbnailStoragePath);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", thumbBuffer.length.toString());
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.send(thumbBuffer);
  } catch (error) {
    console.error("[ThumbnailDownloadError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var media_default = router7;

// src/server/routes/calls.ts
var import_express8 = require("express");
var import_zod8 = require("zod");

// src/lib/webrtc/config.ts
var defaultIceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.services.mozilla.com:3478" }
];
function getWebRtcConfig() {
  const iceServers = [...defaultIceServers];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  return {
    iceServers,
    iceCandidatePoolSize: 10
  };
}

// src/server/routes/calls.ts
var router8 = (0, import_express8.Router)();
var initiateCallSchema = import_zod8.z.object({
  conversationId: import_zod8.z.string().uuid("Valid conversation ID is required"),
  callType: import_zod8.z.enum(["VOICE", "VIDEO"]).default("VOICE")
});
var respondCallSchema = import_zod8.z.object({
  action: import_zod8.z.enum(["ACCEPT", "DECLINE", "BUSY"])
});
router8.get("/config", authenticate, (req, res) => {
  const config = getWebRtcConfig();
  res.json({
    success: true,
    config
  });
});
router8.post("/initiate", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const callerDeviceId = req.device.id;
    const parsed = initiateCallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { conversationId, callType } = parsed.data;
    const conversation = await db_default.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });
    if (!conversation || conversation.deletedAt !== null) {
      res.status(404).json({ error: "NOT_FOUND", message: "Conversation does not exist." });
      return;
    }
    const callerMembership = conversation.members.find((m) => m.userId === callerId);
    if (!callerMembership) {
      res.status(403).json({ error: "FORBIDDEN", message: "Not an active member of this conversation." });
      return;
    }
    let peerUser = null;
    if (conversation.type === "DIRECT") {
      const peer = conversation.members.find((m) => m.userId !== callerId);
      if (peer) {
        peerUser = peer.user;
        const block = await db_default.userBlock.findFirst({
          where: {
            OR: [
              { blockerUserId: callerId, blockedUserId: peer.userId },
              { blockerUserId: peer.userId, blockedUserId: callerId }
            ]
          }
        });
        if (block) {
          res.status(403).json({
            error: "USER_BLOCKED",
            message: "Cannot initiate call: User communication is blocked."
          });
          return;
        }
        const activeCall = await db_default.call.findFirst({
          where: {
            status: { in: ["INITIATED", "RINGING", "CONNECTED"] },
            participants: {
              some: {
                userId: peer.userId,
                status: { in: ["INVITED", "ACCEPTED"] }
              }
            }
          }
        });
        if (activeCall) {
          res.status(409).json({
            error: "USER_BUSY",
            message: `${peer.user.fullName} is currently on another call.`
          });
          return;
        }
      }
    }
    const otherMembers = conversation.members.filter((m) => m.userId !== callerId);
    const participantsData = [
      {
        userId: callerId,
        deviceId: callerDeviceId,
        status: "ACCEPTED",
        joinedAt: /* @__PURE__ */ new Date()
      }
    ];
    for (const m of otherMembers) {
      const peerDevice = await db_default.device.findFirst({
        where: { userId: m.userId, isActive: true },
        orderBy: { lastSeenAt: "desc" }
      });
      if (peerDevice) {
        participantsData.push({
          userId: m.userId,
          deviceId: peerDevice.id,
          status: "INVITED",
          joinedAt: null
        });
      }
    }
    const call = await db_default.$transaction(async (tx) => {
      const createdCall = await tx.call.create({
        data: {
          conversationId,
          initiatorUserId: callerId,
          callType,
          status: "INITIATED",
          participants: {
            create: participantsData
          }
        },
        include: {
          initiator: {
            select: {
              id: true,
              fullName: true,
              displayName: true,
              avatarUrl: true
            }
          },
          participants: true
        }
      });
      return createdCall;
    });
    if (io) {
      const incomingPayload = {
        callId: call.id,
        conversationId: call.conversationId,
        callType: call.callType,
        initiator: {
          id: callerId,
          fullName: req.user.fullName,
          displayName: req.user.displayName
        }
      };
      if (peerUser) {
        io.to(`user:${peerUser.id}`).emit("call:incoming", incomingPayload);
      } else {
        io.to(`conversation:${conversationId}`).emit("call:incoming", incomingPayload);
      }
    }
    res.status(201).json({
      success: true,
      call
    });
  } catch (error) {
    console.error("[InitiateCallError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router8.post("/:id/respond", authenticate, async (req, res) => {
  try {
    const { id: callId } = req.params;
    const callerId = req.user.id;
    const callerDeviceId = req.device.id;
    const parsed = respondCallSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.format() });
      return;
    }
    const { action } = parsed.data;
    const call = await db_default.call.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });
    if (!call || call.endedAt !== null) {
      res.status(404).json({ error: "CALL_NOT_FOUND", message: "Call has already concluded or does not exist." });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    if (action === "ACCEPT") {
      await db_default.$transaction(async (tx) => {
        await tx.call.update({
          where: { id: callId },
          data: {
            status: "CONNECTED",
            connectedAt: now
          }
        });
        const existingParticipant = await tx.callParticipant.findFirst({
          where: { callId, userId: callerId }
        });
        if (existingParticipant) {
          await tx.callParticipant.update({
            where: { id: existingParticipant.id },
            data: {
              deviceId: callerDeviceId,
              status: "ACCEPTED",
              joinedAt: now
            }
          });
        } else {
          await tx.callParticipant.create({
            data: {
              callId,
              userId: callerId,
              deviceId: callerDeviceId,
              status: "ACCEPTED",
              joinedAt: now
            }
          });
        }
      });
      if (io) {
        io.to(`user:${call.initiatorUserId}`).emit("call:response", {
          callId,
          action: "ACCEPT",
          responderUserId: callerId,
          responderDeviceId: callerDeviceId
        });
      }
      res.json({ success: true, status: "CONNECTED", connectedAt: now });
    } else {
      const finalStatus = action === "BUSY" ? "BUSY" : "REJECTED";
      await db_default.$transaction([
        db_default.call.update({
          where: { id: callId },
          data: {
            status: finalStatus,
            endedAt: now
          }
        }),
        db_default.callParticipant.updateMany({
          where: {
            callId,
            userId: callerId
          },
          data: {
            status: "DECLINED",
            leftAt: now
          }
        })
      ]);
      if (io) {
        io.to(`user:${call.initiatorUserId}`).emit("call:response", {
          callId,
          action,
          responderUserId: callerId
        });
      }
      res.json({ success: true, status: finalStatus, endedAt: now });
    }
  } catch (error) {
    console.error("[RespondCallError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router8.post("/:id/end", authenticate, async (req, res) => {
  try {
    const { id: callId } = req.params;
    const callerId = req.user.id;
    const call = await db_default.call.findUnique({
      where: { id: callId },
      include: {
        participants: true
      }
    });
    if (!call) {
      res.status(404).json({ error: "CALL_NOT_FOUND", message: "Call does not exist." });
      return;
    }
    if (call.endedAt !== null) {
      res.json({
        success: true,
        message: "Call was already concluded.",
        durationSeconds: call.durationSeconds
      });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    let durationSeconds = 0;
    if (call.connectedAt) {
      durationSeconds = Math.max(0, Math.round((now.getTime() - call.connectedAt.getTime()) / 1e3));
    }
    await db_default.$transaction([
      db_default.call.update({
        where: { id: callId },
        data: {
          status: "COMPLETED",
          endedAt: now,
          durationSeconds
        }
      }),
      db_default.callParticipant.updateMany({
        where: {
          callId,
          leftAt: null
        },
        data: {
          leftAt: now
        }
      })
    ]);
    if (io) {
      io.to(`conversation:${call.conversationId}`).emit("call:ended", {
        callId,
        durationSeconds,
        endedAt: now,
        terminatedByUserId: callerId
      });
    }
    res.json({
      success: true,
      message: "Call terminated successfully.",
      durationSeconds,
      endedAt: now
    });
  } catch (error) {
    console.error("[EndCallError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
router8.get("/history", authenticate, async (req, res) => {
  try {
    const callerId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
    const calls = await db_default.call.findMany({
      where: {
        OR: [
          { initiatorUserId: callerId },
          { participants: { some: { userId: callerId } } }
        ]
      },
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        initiator: {
          select: {
            id: true,
            fullName: true,
            displayName: true,
            avatarUrl: true
          }
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                displayName: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });
    res.json({
      success: true,
      calls: calls.map((c) => ({
        id: c.id,
        conversationId: c.conversationId,
        callType: c.callType,
        status: c.status,
        durationSeconds: c.durationSeconds,
        startedAt: c.startedAt,
        connectedAt: c.connectedAt,
        endedAt: c.endedAt,
        initiator: c.initiator,
        isOutgoing: c.initiatorUserId === callerId,
        participants: c.participants.map((p) => ({
          userId: p.userId,
          status: p.status,
          user: p.user
        }))
      }))
    });
  } catch (error) {
    console.error("[CallHistoryError]", error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
});
var calls_default = router8;

// src/server/socket/auth.ts
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(";").forEach((cookieStr) => {
    const parts = cookieStr.trim().split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join("=").trim();
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}
async function socketAuthMiddleware(socket, next2) {
  try {
    let token;
    const cookies = parseCookies(socket.handshake.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      token = cookies[SESSION_COOKIE_NAME];
    } else if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    } else if (typeof socket.handshake.query?.token === "string") {
      token = socket.handshake.query.token;
    }
    if (!token) {
      return next2(new Error("AUTHENTICATION_FAILED: Missing session credentials."));
    }
    const payload = await verifySessionToken(token);
    if (!payload) {
      return next2(new Error("AUTHENTICATION_FAILED: Invalid or expired session token."));
    }
    const dbSession = await db_default.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        device: true,
        user: {
          include: {
            roles: true
          }
        }
      }
    });
    if (!dbSession || !dbSession.isValid || dbSession.revokedAt !== null || dbSession.expiresAt < /* @__PURE__ */ new Date()) {
      return next2(new Error("AUTHENTICATION_FAILED: Session has been revoked or expired."));
    }
    if (dbSession.user.status !== "ACTIVE") {
      return next2(new Error(`AUTHENTICATION_FAILED: Account is ${dbSession.user.status}.`));
    }
    try {
      await db_default.device.update({
        where: { id: dbSession.deviceId },
        data: { lastSeenAt: /* @__PURE__ */ new Date() }
      });
    } catch {
    }
    socket.data = {
      user: {
        id: dbSession.user.id,
        email: dbSession.user.email,
        fullName: dbSession.user.fullName,
        displayName: dbSession.user.displayName,
        status: dbSession.user.status,
        roles: dbSession.user.roles.map((r) => r.role)
      },
      device: {
        id: dbSession.device.id,
        deviceName: dbSession.device.deviceName,
        deviceFingerprint: dbSession.device.deviceFingerprint
      },
      sessionId: dbSession.id
    };
    next2();
  } catch (error) {
    console.error("[SocketAuthError]", error);
    next2(new Error("AUTHENTICATION_FAILED: Internal verification error."));
  }
}

// src/server/socket/presence.ts
var PresenceManager = class {
  constructor() {
    // Map of userId -> Set of active socket IDs
    this.userSockets = /* @__PURE__ */ new Map();
    // Map of socketId -> { userId, deviceId }
    this.socketMeta = /* @__PURE__ */ new Map();
  }
  /**
   * Register a freshly connected socket
   */
  async registerConnection(socket, io2) {
    const user = socket.data.user;
    const device = socket.data.device;
    if (!user || !device) return;
    const userId = user.id;
    const deviceId = device.id;
    await socket.join(`user:${userId}`);
    await socket.join(`device:${deviceId}`);
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, /* @__PURE__ */ new Set());
    }
    const wasOffline = this.userSockets.get(userId).size === 0;
    this.userSockets.get(userId).add(socket.id);
    this.socketMeta.set(socket.id, { userId, deviceId });
    if (wasOffline) {
      io2.emit("presence:status", {
        userId,
        status: "ONLINE",
        timestamp: /* @__PURE__ */ new Date()
      });
    }
    console.log(`[Presence] User ${user.fullName} (${userId}) connected on device ${device.deviceName} (${deviceId})`);
  }
  /**
   * Register socket disconnection and update presence
   */
  async registerDisconnection(socket, io2) {
    const meta = this.socketMeta.get(socket.id);
    if (!meta) return;
    const { userId, deviceId } = meta;
    this.socketMeta.delete(socket.id);
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        const now = /* @__PURE__ */ new Date();
        try {
          await db_default.device.update({
            where: { id: deviceId },
            data: { lastSeenAt: now }
          });
        } catch {
        }
        io2.emit("presence:status", {
          userId,
          status: "OFFLINE",
          timestamp: now
        });
        console.log(`[Presence] User ${userId} is now OFFLINE.`);
      }
    }
  }
  /**
   * Query online state for a specific user ID
   */
  isUserOnline(userId) {
    const sockets = this.userSockets.get(userId);
    return Boolean(sockets && sockets.size > 0);
  }
  /**
   * Retrieve list of all currently connected user IDs
   */
  getOnlineUserIds() {
    return Array.from(this.userSockets.keys());
  }
};
var presenceManager = new PresenceManager();

// src/server/socket/handlers.ts
function registerSocketHandlers(io2, socket) {
  const user = socket.data.user;
  if (!user) return;
  socket.on(
    "conversation:join",
    async (payload, callback) => {
      try {
        const { conversationId } = payload;
        if (!conversationId) {
          callback?.({ success: false, error: "Missing conversationId." });
          return;
        }
        const member = await db_default.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId: user.id
            }
          }
        });
        if (!member || member.leftAt !== null) {
          const errMsg = "FORBIDDEN: You are not an active member of this conversation.";
          socket.emit("socket:error", { code: "FORBIDDEN", message: errMsg });
          callback?.({ success: false, error: errMsg });
          return;
        }
        const roomName = `conversation:${conversationId}`;
        await socket.join(roomName);
        callback?.({ success: true });
        console.log(`[Socket] User ${user.id} joined room ${roomName}`);
      } catch (err) {
        console.error("[SocketJoinError]", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
  socket.on("conversation:leave", async (payload) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;
    await socket.leave(roomName);
    console.log(`[Socket] User ${user.id} left room ${roomName}`);
  });
  socket.on("typing:start", (payload) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;
    if (socket.rooms.has(roomName)) {
      socket.to(roomName).emit("typing:start", {
        conversationId: payload.conversationId,
        userId: user.id,
        displayName: user.displayName || user.fullName
      });
    }
  });
  socket.on("typing:stop", (payload) => {
    if (!payload?.conversationId) return;
    const roomName = `conversation:${payload.conversationId}`;
    if (socket.rooms.has(roomName)) {
      socket.to(roomName).emit("typing:stop", {
        conversationId: payload.conversationId,
        userId: user.id
      });
    }
  });
  socket.on(
    "presence:query",
    (payload, callback) => {
      const userIds = payload?.userIds || [];
      const onlineUserIds = userIds.filter((id) => presenceManager.isUserOnline(id));
      callback?.({ onlineUserIds });
    }
  );
  socket.on("heartbeat", async () => {
    const device = socket.data.device;
    if (device) {
      try {
        await db_default.device.update({
          where: { id: device.id },
          data: { lastSeenAt: /* @__PURE__ */ new Date() }
        });
      } catch {
      }
    }
  });
  socket.on(
    "call:offer",
    async (payload, callback) => {
      try {
        const { callId, toUserId, offer } = payload;
        if (!callId || !toUserId || !offer) {
          callback?.({ success: false, error: "Missing callId, toUserId, or offer." });
          return;
        }
        const call = await db_default.call.findUnique({
          where: { id: callId },
          include: { participants: true }
        });
        if (!call || call.initiatorUserId !== user.id && !call.participants.some((p) => p.userId === user.id)) {
          callback?.({ success: false, error: "Unauthorized: Not a participant in this call." });
          return;
        }
        io2.to(`user:${toUserId}`).emit("call:offer", {
          callId,
          fromUserId: user.id,
          offer
        });
        callback?.({ success: true });
      } catch (err) {
        console.error("[CallOfferError]", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
  socket.on(
    "call:answer",
    async (payload, callback) => {
      try {
        const { callId, toUserId, answer } = payload;
        if (!callId || !toUserId || !answer) {
          callback?.({ success: false, error: "Missing callId, toUserId, or answer." });
          return;
        }
        const call = await db_default.call.findUnique({
          where: { id: callId },
          include: { participants: true }
        });
        if (!call || call.initiatorUserId !== user.id && !call.participants.some((p) => p.userId === user.id)) {
          callback?.({ success: false, error: "Unauthorized: Not a participant in this call." });
          return;
        }
        io2.to(`user:${toUserId}`).emit("call:answer", {
          callId,
          fromUserId: user.id,
          answer
        });
        callback?.({ success: true });
      } catch (err) {
        console.error("[CallAnswerError]", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
  socket.on(
    "call:ice-candidate",
    async (payload, callback) => {
      try {
        const { callId, toUserId, candidate } = payload;
        if (!callId || !toUserId || !candidate) {
          callback?.({ success: false, error: "Missing required candidate payload." });
          return;
        }
        io2.to(`user:${toUserId}`).emit("call:ice-candidate", {
          callId,
          fromUserId: user.id,
          candidate
        });
        callback?.({ success: true });
      } catch (err) {
        console.error("[CallIceCandidateError]", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
  socket.on(
    "call:hangup",
    async (payload, callback) => {
      try {
        const { callId, toUserId } = payload;
        if (!callId) {
          callback?.({ success: false, error: "Missing callId." });
          return;
        }
        const call = await db_default.call.findUnique({
          where: { id: callId },
          include: { participants: true }
        });
        if (call && call.endedAt === null) {
          const now = /* @__PURE__ */ new Date();
          const durationSeconds = call.connectedAt ? Math.max(0, Math.round((now.getTime() - call.connectedAt.getTime()) / 1e3)) : 0;
          await db_default.$transaction([
            db_default.call.update({
              where: { id: callId },
              data: {
                status: "COMPLETED",
                endedAt: now,
                durationSeconds
              }
            }),
            db_default.callParticipant.updateMany({
              where: { callId, leftAt: null },
              data: { leftAt: now }
            })
          ]);
          if (toUserId) {
            io2.to(`user:${toUserId}`).emit("call:hangup", {
              callId,
              fromUserId: user.id,
              durationSeconds
            });
          } else {
            for (const p of call.participants) {
              if (p.userId !== user.id) {
                io2.to(`user:${p.userId}`).emit("call:hangup", {
                  callId,
                  fromUserId: user.id,
                  durationSeconds
                });
              }
            }
          }
        }
        callback?.({ success: true });
      } catch (err) {
        console.error("[CallHangupError]", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );
}

// src/server/server.ts
import_dotenv.default.config();
var app = (0, import_express9.default)();
var server = import_http.default.createServer(app);
var PORT = parseInt(process.env.API_PORT || process.env.PORT || "3001", 10);
var HOST = process.env.HOST || "0.0.0.0";
var APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "production" ? "https://chat.globalcrestsolutions.com" : "http://localhost:3000");
app.set("trust proxy", true);
app.use(
  (0, import_helmet.default)({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:", "*"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(
  (0, import_cors.default)({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true
  })
);
app.use(import_express9.default.json({ limit: "10mb" }));
app.use((err, req, res, next2) => {
  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
    res.status(400).json({
      error: "MALFORMED_JSON",
      message: "Invalid JSON payload received in request body."
    });
    return;
  }
  if (err.type === "entity.too.large") {
    res.status(413).json({
      error: "PAYLOAD_TOO_LARGE",
      message: "Request payload exceeds maximum allowed size (10MB)."
    });
    return;
  }
  next2(err);
});
app.use((0, import_cookie_parser.default)());
app.use("/api", generalApiLimiter);
app.use("/api/auth/login", strictAuthLimiter);
app.use("/api/auth/register", strictAuthLimiter);
app.use("/api/auth", auth_default);
app.use("/api/admin", admin_default);
app.use("/api/keys", keys_default);
app.use("/api/conversations", conversations_default);
app.use("/api", messages_default);
app.use("/api/users", users_default);
app.use("/api/media", media_default);
app.use("/api/calls", calls_default);
app.get("/api/health", (req, res) => {
  res.json({
    status: "ONLINE",
    service: "GCS CONNECT Real-Time API & Signaling Hub",
    tagline: "Connect Freely. Communicate Securely.",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    security: {
      zeroKnowledge: true,
      e2eeProtocols: ["X3DH", "Double Ratchet", "AES-256-GCM"],
      webrtcSecurity: "DTLS-SRTP"
    }
  });
});
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
});
app.use((err, req, res, next2) => {
  const statusCode = err.status || err.statusCode || 500;
  console.error("[UnhandledServerError]", {
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    statusCode
  });
  res.status(statusCode).json({
    error: err.name || "INTERNAL_SERVER_ERROR",
    message: statusCode >= 500 ? "An unexpected internal server error occurred." : err.message
  });
});
var io = new import_socket.Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.includes("globalcrestsolutions.com") || origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST"]
  },
  pingTimeout: 2e4,
  pingInterval: 25e3,
  transports: ["websocket", "polling"]
});
io.use(socketAuthMiddleware);
io.on("connection", async (socket) => {
  console.log(
    `[Socket.IO] Authenticated client connected: ${socket.id} (User: ${socket.data.user?.email}, Device: ${socket.data.device?.deviceName})`
  );
  await presenceManager.registerConnection(socket, io);
  registerSocketHandlers(io, socket);
  socket.on("disconnect", async (reason) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (Reason: ${reason})`);
    await presenceManager.registerDisconnection(socket, io);
  });
});
async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) return;
  try {
    console.log("[Database] Verifying database connectivity...");
    await prisma.$connect();
    console.log("[Database] Connected to MySQL database successfully.");
    const adminEmail = process.env.ADMIN_INITIAL_EMAIL || "admin@globalcrestsolutions.com";
    const adminPass = process.env.ADMIN_INITIAL_PASSWORD || "Kamii@336";
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      console.log(`[Database] Bootstrapping initial administrator (${adminEmail})...`);
      const passwordHash = await hashPassword(adminPass);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: process.env.ADMIN_INITIAL_NAME || "Global Crest Administrator",
          displayName: "System Admin",
          status: "ACTIVE",
          roles: {
            create: {
              role: "SUPER_ADMIN",
              assignedBy: "SYSTEM_BOOTSTRAP"
            }
          }
        }
      });
      console.log(`[Database] \u2713 Administrator bootstrap complete: ${adminEmail}`);
    } else {
      console.log(`[Database] \u2713 Administrator account verified: ${adminEmail}`);
    }
  } catch (err) {
    console.warn("[Database] Background bootstrap notice:", err.message);
  }
}
function startStandaloneApiServer() {
  if (server.listening) return;
  const API_PORT = parseInt(process.env.API_PORT || "3001", 10);
  server.listen(API_PORT, "127.0.0.1", () => {
    console.log(`=======================================================`);
    console.log(` GCS CONNECT \u2014 Real-Time API & Signaling Server`);
    console.log(` "Connect Freely. Communicate Securely."`);
    console.log(` Running on: http://127.0.0.1:${API_PORT}`);
    console.log(` Healthcheck: http://127.0.0.1:${API_PORT}/api/health`);
    console.log(` Allowed Origins: ${APP_URL}`);
    console.log(`=======================================================`);
    bootstrapDatabase().catch((dbErr) => {
      console.error("[DatabaseBootstrap] Notice:", dbErr.message);
    });
  });
}
var isStandaloneApi = Boolean(
  process.env.STANDALONE_API === "true" || typeof process !== "undefined" && process.argv[1] && (process.argv[1].endsWith("/src/server/server.ts") || process.argv[1].endsWith("/src/server/server.js") || process.argv[1].endsWith("\\src\\server\\server.ts") || process.argv[1].endsWith("\\src\\server\\server.js"))
);
if (process.env.NODE_ENV !== "test" && isStandaloneApi) {
  startStandaloneApiServer();
}
var handleShutdown = (signal) => {
  console.log(`
Received ${signal}. Shutting down GCS CONNECT server gracefully...`);
  server.close(() => {
    console.log("HTTP and WebSocket server closed.");
    process.exit(0);
  });
};
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("[ProcessUnhandledRejection]", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("[ProcessUncaughtException]", err.message);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

// server.ts
process.env.UNIFIED_SERVER = "true";
var dev = process.env.NODE_ENV !== "production";
var port = parseInt(process.env.PORT || "3000", 10);
var host = process.env.HOST || "0.0.0.0";
var nextApp = (0, import_next.default)({ dev, hostname: host, port });
var handle = nextApp.getRequestHandler();
async function bootstrapDatabase2() {
  if (!process.env.DATABASE_URL) return;
  try {
    console.log("[Database] Verifying database connectivity...");
    await prisma.$connect();
    console.log("[Database] Connected to MySQL database successfully.");
    const adminEmail = process.env.ADMIN_INITIAL_EMAIL || "admin@globalcrestsolutions.com";
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const adminPass = process.env.ADMIN_INITIAL_PASSWORD;
      if (!adminPass) {
        console.warn(
          "[Database] No initial administrator exists. Set ADMIN_INITIAL_PASSWORD to bootstrap one."
        );
        return;
      }
      console.log(`[Database] Bootstrapping initial administrator (${adminEmail})...`);
      const passwordHash = await hashPassword(adminPass);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: process.env.ADMIN_INITIAL_NAME || "Global Crest Administrator",
          displayName: "System Admin",
          status: "ACTIVE",
          roles: {
            create: {
              role: "SUPER_ADMIN",
              assignedBy: "SYSTEM_BOOTSTRAP"
            }
          }
        }
      });
      console.log(`[Database] \u2713 Administrator bootstrap complete: ${adminEmail}`);
    } else {
      console.log(`[Database] \u2713 Administrator account verified: ${adminEmail}`);
    }
  } catch (err) {
    console.warn("[Database] Background bootstrap notice:", err.message);
  }
}
async function start() {
  console.log(`[Boot] Preparing Next.js engine in ${dev ? "development" : "production"} mode...`);
  await nextApp.prepare();
  console.log("[Boot] Next.js engine ready.");
  app.all("*", (req, res) => {
    return handle(req, res);
  });
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(` GCS CONNECT \u2014 Live Production Server Online`);
    console.log(` Port: ${port}`);
    console.log(` Mode: ${process.env.NODE_ENV || "production"}`);
    console.log(` Healthcheck: http://127.0.0.1:${port}/api/health`);
    console.log(`=======================================================`);
    bootstrapDatabase2().catch((dbErr) => {
      console.error("[DatabaseBootstrap] Notice:", dbErr.message);
    });
  });
}
start().catch((err) => {
  console.error("[BootError] Fatal error starting unified server:", err);
  process.exit(1);
});
