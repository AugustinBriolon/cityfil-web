import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// ":" separates the parts because Next.js expands "$" in .env files.
const SEPARATOR = ":";
const SCHEME = "scrypt";

/** Hashes the admin password as `scrypt:<salt>:<key>` (base64url), the format stored in ADMIN_PASSWORD_HASH. */
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return [SCHEME, salt.toString("base64url"), key.toString("base64url")].join(SEPARATOR);
}

export function isAdminPasswordHash(value: string): boolean {
  const [scheme, salt, key, ...rest] = value.split(SEPARATOR);
  return scheme === SCHEME && Boolean(salt) && Boolean(key) && rest.length === 0;
}

/** Constant-time comparison so response timing leaks nothing about the stored key. */
export async function verifyAdminPassword(password: string, storedHash: string): Promise<boolean> {
  if (!isAdminPasswordHash(storedHash)) return false;
  const [, salt, key] = storedHash.split(SEPARATOR) as [string, string, string];
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}
