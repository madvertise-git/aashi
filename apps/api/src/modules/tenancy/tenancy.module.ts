import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { InvitesController } from "./invites.controller";
import { InvitesService } from "./invites.service";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";
import { AccountGuard, AgencyGuard } from "./tenant.guard";

@Module({
  imports: [IdentityModule],
  controllers: [TenancyController, InvitesController],
  providers: [TenancyService, InvitesService, AgencyGuard, AccountGuard],
  exports: [AgencyGuard, AccountGuard],
})
export class TenancyModule {}
