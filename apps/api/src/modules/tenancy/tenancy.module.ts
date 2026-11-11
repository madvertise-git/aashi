import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";
import { AccountGuard, AgencyGuard } from "./tenant.guard";

@Module({
  imports: [IdentityModule],
  controllers: [TenancyController],
  providers: [TenancyService, AgencyGuard, AccountGuard],
  exports: [AgencyGuard, AccountGuard],
})
export class TenancyModule {}
