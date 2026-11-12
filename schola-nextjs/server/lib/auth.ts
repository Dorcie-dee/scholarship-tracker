import { randomBytes, randomInt, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getConfig } from './config';
import { UserRole } from './enums';
import { UnauthorizedError } from './http-errors';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().auth.jwtAccessSecret);
}

/** jsonwebtoken-style "15m"/"7d" -> seconds, matching JWT_ACCESS_EXPIRES_IN's format. */
function parseExpiresIn(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return 900;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 60;
  return amount * multiplier;
}

export async function signAccessToken(claims: {
  userId: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
}): Promise<{ token: string; expiresAt: Date }> {
  const { jwtAccessExpiresIn } = getConfig().auth;
  const ttlSeconds = parseExpiresIn(jwtAccessExpiresIn);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const token = await new SignJWT({
    email: claims.email,
    role: claims.role,
    isVerified: claims.isVerified,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey());

  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as AccessTokenClaims;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, getConfig().auth.bcryptSaltRounds);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Opaque, unguessable credential (refresh token / OTP seed / reset token). Only the hash is ever persisted. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 6-digit email verification code. */
/**
 * `crypto.randomInt()`, not `Math.random()` — an OTP gates email
 * verification, and this codebase's standing rule (ported from the original
 * `EmailVerificationService.issueOtp()`) is that nothing security-adjacent
 * uses non-cryptographic randomness, even where the stakes are lower than a
 * password/token.
 */
export function generateOtp(): string {
  return String(randomInt(100_000, 1_000_000));
}
