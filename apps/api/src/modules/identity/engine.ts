import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import type pg from "pg";
import { v7 as uuidv7 } from "uuid";
import type { Config, KeyValueStore } from "../../platform";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The sign-in engine: Better Auth, configured to use our table names, our
 * UUIDv7 IDs and our password format. It is never mounted as a web handler;
 * AuthService calls it, so every address and error format stays ours.
 * Sessions are kept in Redis through `store`.
 */
export function createEngine(config: Config, store: KeyValueStore, pool: pg.Pool) {
  const key = (k: string) => `auth:${k}`;
  return betterAuth({
    appName: config.appName,
    baseURL: config.appUrl,
    basePath: "/api/v1/auth",
    secret: config.authSecret,
    database: pool,
    secondaryStorage: {
      get: (k) => store.get(key(k)),
      set: (k, value, ttl) => store.set(key(k), value, ttl),
      delete: (k) => store.delete(key(k)),
      getAndDelete: (k) => store.getAndDelete(key(k)),
      increment: (k, ttl) => store.increment(key(k), ttl),
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 200,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(password, hash) },
    },
    user: {
      modelName: "users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
    },
    session: {
      modelName: "sessions",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      expiresIn: SESSION_TTL_SECONDS,
    },
    account: {
      modelName: "auth_credentials",
      fields: {
        userId: "user_id",
        providerId: "provider_id",
        accountId: "account_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    plugins: [
      twoFactor({
        issuer: config.appName,
        schema: {
          user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
          twoFactor: {
            modelName: "auth_two_factors",
            fields: {
              userId: "user_id",
              backupCodes: "backup_codes",
              failedVerificationCount: "failed_verification_count",
              lockedUntil: "locked_until",
            },
          },
        },
      }),
    ],
    advanced: {
      cookiePrefix: "aashi",
      useSecureCookies: config.production,
      database: { generateId: () => uuidv7() },
    },
    // Our own limiter (RateLimitGuard) covers these routes and reports in our error format.
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
  });
}

export type Engine = ReturnType<typeof createEngine>;
