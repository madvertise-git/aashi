import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ProblemFilter } from "./platform";

/** Builds the application. Shared by the server and the tests. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  return app;
}
