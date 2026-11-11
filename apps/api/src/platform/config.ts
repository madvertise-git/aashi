export interface Config {
  port: number;
  databaseUrl: string;
  production: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const databaseUrl =
    env.DATABASE_URL ?? (production ? undefined : "postgres://platform_app:app_dev_password@localhost:5432/aashi");
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return { port: Number(env.PORT ?? 4000), databaseUrl, production };
}

export const CONFIG = Symbol("CONFIG");
