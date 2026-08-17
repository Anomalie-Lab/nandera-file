import { randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Lazy dummy hash so unknown emails still pay a bcrypt compare. */
let dummyHashCache: string | null = null;
function dummyHash(): string {
  if (!dummyHashCache) dummyHashCache = hashPassword("timing-dummy");
  return dummyHashCache;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPasswordHash(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function generatePassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

/** Turn a client/company name into a plain login (no @domain). */
export function usernameFromName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const skip = new Set([
    "ltda",
    "ltd",
    "inc",
    "sa",
    "s",
    "a",
    "the",
    "de",
    "da",
    "do",
    "e",
    "llc",
    "gmbh",
  ]);
  const parts = slug.split(".").filter((p) => p.length > 1 && !skip.has(p));
  return (parts.slice(0, 2).join(".") || "client").slice(0, 40);
}

export function allocateClientUsername(name: string, used: Set<string>): string {
  return uniqueLogin(usernameFromName(name), used);
}

/** Strip a leftover email domain so client logins stay as a plain user id. */
export function uniqueLogin(raw: string, used: Set<string>): string {
  const local = (raw.trim().toLowerCase().split("@")[0] || "client").slice(0, 40);
  let login = local;
  let n = 2;
  while (used.has(login)) {
    login = `${local}${n}`.slice(0, 40);
    n += 1;
  }
  used.add(login);
  return login;
}

/** Constant-time length padding then bcrypt compare. */
export function safeVerifyPassword(plain: string, hash: string | null): boolean {
  const target = hash && hash.startsWith("$2") ? hash : dummyHash();
  const ok = verifyPasswordHash(plain, target);
  if (!hash) {
    // Force a dummy compare result of false even if dummy happened to match.
    timingSafeEqual(Buffer.from("0"), Buffer.from("1"));
    return false;
  }
  return ok;
}
