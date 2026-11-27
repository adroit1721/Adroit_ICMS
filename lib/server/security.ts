import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/store';

export const SESSION_COOKIE_NAME = 'erp_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPortalRole = UserRole | 'Student';

export interface VerifiedSession {
  portal: 'admin' | 'teacher' | 'student';
  userId: string;
  username: string;
  role: SessionPortalRole;
  exp: number;
}

declare global {
  var __erpSessionFallbackSecret: string | undefined;
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (envSecret) return envSecret;
  if (!globalThis.__erpSessionFallbackSecret) {
    globalThis.__erpSessionFallbackSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__erpSessionFallbackSecret;
}

export function hashPassword(plainPassword: string): string {
  return bcrypt.hashSync(plainPassword, 10);
}

function getPinVaultKey(): Buffer {
  const seed =
    process.env.PIN_VAULT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.MONGODB_URI?.trim() ||
    'institutional-erp-default-pin-vault-key';
  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptAdminPin(plainPin: string): string {
  const clean = (plainPin || '').trim();
  if (!clean) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getPinVaultKey(), iv);
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  } catch {
    return '';
  }
}

export function decryptAdminPin(stored?: string | null): string {
  if (!stored || typeof stored !== 'string') return '';
  if (!stored.startsWith('v1:')) return '';
  const parts = stored.split(':');
  if (parts.length !== 4) return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getPinVaultKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function verifyPassword(plainPassword: string, storedHash?: string | null): boolean {
  if (!storedHash || typeof plainPassword !== 'string') return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(plainPassword, storedHash);
    } catch {
      return false;
    }
  }
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hexHash] = parts;
    if (!salt || !hexHash) return false;
    try {
      const derived = crypto.scryptSync(plainPassword, salt, 64);
      const expected = Buffer.from(hexHash, 'hex');
      if (derived.length !== expected.length) return false;
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  // Constant-time compare if an unhashed legacy record is migrated on first login
  const a = Buffer.from(plainPassword, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signSessionToken(payload: Omit<VerifiedSession, 'exp'>): string {
  const session: VerifiedSession = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token?: string | null): VerifiedSession | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as VerifiedSession;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!parsed.portal || !parsed.userId || !parsed.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest): VerifiedSession | null {
  const bearer = req.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    const fromBearer = verifySessionToken(bearer.slice(7).trim());
    if (fromBearer) return fromBearer;
  }
  const cookieVal = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(cookieVal);
}

export function attachSessionCookie(res: NextResponse, token: string): void {
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

export function clearSessionCookie(res: NextResponse): void {
  res.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

export function assertTrustedOrigin(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const customHeader = req.headers.get('x-requested-with');
  if (customHeader === 'erp-client') return true;

  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const origin = req.headers.get('origin');
  if (origin && host) {
    try {
      if (new URL(origin).host.toLowerCase() === host) return true;
    } catch {
      return false;
    }
  }
  const referer = req.headers.get('referer');
  if (referer && host) {
    try {
      if (new URL(referer).host.toLowerCase() === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function sanitizeMongoInput<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMongoInput(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        k.startsWith('$') ||
        k === '_id' ||
        k === '__proto__' ||
        k === 'constructor' ||
        k === 'prototype' ||
        k === 'passwordHash' ||
        k === 'systemPinEnc' ||
        k === 'systemPin'
      ) {
        continue;
      }
      out[k] = sanitizeMongoInput(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeSafeUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
    return '';
  } catch {
    return '';
  }
}

export function isAdminSession(session: VerifiedSession | null): boolean {
  return Boolean(
    session &&
      session.portal === 'admin' &&
      (session.role === 'Admin' || session.role === 'Institute Manager' || session.role === 'Accountant')
  );
}
