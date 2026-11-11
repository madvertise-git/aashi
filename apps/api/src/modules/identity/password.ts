import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt with OWASP-recommended cost. Stored as scrypt$N$r$p$salt$hash.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, length, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Used when the email is unknown, so a wrong email takes as long as a wrong password. */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));
