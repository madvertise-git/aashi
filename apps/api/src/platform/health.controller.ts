import { Controller, Get, Inject } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { KEY_VALUE, type KeyValueStore } from "./key-value";

@Controller()
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(KEY_VALUE) private readonly store: KeyValueStore,
  ) {}

  /** "Is the process alive?" */
  @Get("healthz")
  live() {
    return { status: "ok" };
  }

  /** "Can it serve requests?" Fails if the database or Redis is unreachable. */
  @Get("readyz")
  async ready() {
    await Promise.all([this.database.ping(), this.store.ping()]);
    return { status: "ok" };
  }
}
