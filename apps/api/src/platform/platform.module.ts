import { Global, Module } from "@nestjs/common";
import { CONFIG, loadConfig } from "./config";
import { DatabaseService } from "./database.service";
import { HealthController } from "./health.controller";

@Global()
@Module({
  controllers: [HealthController],
  providers: [{ provide: CONFIG, useFactory: () => loadConfig() }, DatabaseService],
  exports: [CONFIG, DatabaseService],
})
export class PlatformModule {}
