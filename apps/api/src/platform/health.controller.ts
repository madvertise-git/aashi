import { Controller, Get, Inject } from "@nestjs/common";
import { DatabaseService } from "./database.service";

@Controller()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** "Is the process alive?" */
  @Get("healthz")
  live() {
    return { status: "ok" };
  }

  /** "Can it serve requests?" Fails if the database is unreachable. */
  @Get("readyz")
  async ready() {
    await this.database.ping();
    return { status: "ok" };
  }
}
