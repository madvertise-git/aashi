export interface Config {
  port: number;
  /** Everyday connection (platform_app). */
  databaseUrl: string;
  /** The sign-in engine's connection (platform_auth). */
  authDatabaseUrl: string;
  /** Redis or Valkey. Unset outside production means an in-process stand-in. */
  redisUrl: string | undefined;
  /** Signs cookies and encrypts two-factor secrets. */
  authSecret: string;
  /** Product name shown in emails and authenticator apps until per-agency branding exists. */
  appName: string;
  /** Where the web app is served; used in links we email. */
  appUrl: string;
  /** Put in front of every Redis key, so environments sharing a server stay apart. */
  keyPrefix: string;
  /** How many proxies sit in front of the API (Cloudflare, load balancer, web app), so the caller's real address is used for rate limits. */
  trustedProxyHops: number;
  production: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  /** Local development has safe defaults; production must be told everything. */
  const need = (name: string, devDefault: string): string => {
    const value = env[name] ?? (production ? undefined : devDefault);
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  if (production && !env.REDIS_URL) throw new Error("REDIS_URL is required");
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: need("DATABASE_URL", "postgres://platform_app:app_dev_password@localhost:5432/aashi"),
    authDatabaseUrl: need("AUTH_DATABASE_URL", "postgres://platform_auth:auth_dev_password@localhost:5432/aashi"),
    redisUrl: env.REDIS_URL || undefined,
    authSecret: need("AUTH_SECRET", "dev-only-secret-not-for-production-0123456789"),
    appName: env.APP_NAME ?? "Aashi",
    appUrl: need("APP_URL", "http://localhost:3000"),
    keyPrefix: env.KEY_PREFIX ?? "aashi",
    trustedProxyHops: Number(env.TRUSTED_PROXY_HOPS ?? 0),
    production,
  };
}

export const CONFIG = Symbol("CONFIG");
