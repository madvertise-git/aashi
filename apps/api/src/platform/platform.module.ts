import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { CONFIG, type Config, loadConfig } from "./config";
import { DatabaseService } from "./database.service";
import { HealthController } from "./health.controller";
import { createKeyValueStore, KEY_VALUE, type KeyValueStore } from "./key-value";
import { Mailer } from "./mailer";
import { RateLimitGuard } from "./rate-limit.guard";

@Global()
@Module({
  controllers: [HealthController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: KEY_VALUE, useFactory: (config: Config) => createKeyValueStore(config), inject: [CONFIG] },
    DatabaseService,
    Mailer,
    RateLimitGuard,
  ],
  exports: [CONFIG, KEY_VALUE, DatabaseService, Mailer, RateLimitGuard],
})
export class PlatformModule implements OnModuleDestroy {
  constructor(@Inject(KEY_VALUE) private readonly store: KeyValueStore) {}

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }
}
