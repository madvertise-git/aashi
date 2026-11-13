import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { CONFIG, type Config, ProblemFilter } from "./platform";

/** Builds the application. Shared by the server and the tests. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new ProblemFilter());
  const hops = app.get<Config>(CONFIG).trustedProxyHops;
  if (hops > 0) (app.getHttpAdapter().getInstance() as { set(key: string, value: number): void }).set("trust proxy", hops);
  app.enableShutdownHooks();
  return app;
}
