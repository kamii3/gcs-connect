import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET_STRING = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!JWT_SECRET_STRING || JWT_SECRET_STRING.length < 32)) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
}
const SECRET_KEY = new TextEncoder().encode(
  JWT_SECRET_STRING || 'gcs_connect_super_secure_jwt_secret_dev_key_2026_min32chars'
);

export interface SessionTokenPayload {
  userId: string;
  sessionId: string;
  deviceId: string;
  email: string;
  role?: string;
  roles?: string[];
}

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || 'gcs_session';

/**
 * Sign an encrypted/signed JWT session token
 */
export async function signSessionToken(
  payload: SessionTokenPayload,
  expiresInDays = 7
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInDays}d`)
    .sign(SECRET_KEY);
}

/**
 * Verify and decode an incoming JWT session token
 */
export async function verifySessionToken(
  token: string
): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionTokenPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Cookie configuration options conforming to OWASP ASVS guidelines
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: (process.env.SESSION_COOKIE_SAMESITE as 'strict' | 'lax') || 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};
