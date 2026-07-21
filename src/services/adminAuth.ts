import { randomBytes, scrypt, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { requireEnv } from "../config/env";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/** Format stocké dans ADMIN_PASSWORD_HASH : "<sel-hex>:<hash-hex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Jeton de session signé (HMAC), sans état stocké côté serveur — reste
 * valable même si le serveur redémarre (Render peut redéployer/relancer le
 * process à tout moment). Format : "<email-b64url>.<expiration-ms>.<signature-hex>".
 */
export function createSessionToken(email: string): string {
  const secret = requireEnv("ADMIN_SESSION_SECRET");
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${Buffer.from(email).toString("base64url")}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): { email: string } | null {
  const secret = requireEnv("ADMIN_SESSION_SECRET");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expiresAtStr, signature] = parts;
  const payload = `${emailB64}.${expiresAtStr}`;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  return { email: Buffer.from(emailB64, "base64url").toString() };
}
