import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { AccountSummary, AgencySummary } from "@aashi/contracts";
import { SessionGuard } from "../identity";
import { AccountGuard, AgencyGuard, CurrentTenant, type Tenant } from "../tenancy";
import { ReportsService } from "./reports.service";

@Controller("v1")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get("accounts/:accountId/summary")
  @UseGuards(AccountGuard)
  account(@CurrentTenant() tenant: Tenant & { accountId: string }): Promise<AccountSummary> {
    return this.reports.account(tenant);
  }

  @Get("agencies/:agencyId/summary")
  @UseGuards(AgencyGuard)
  agency(@CurrentTenant() tenant: Tenant): Promise<AgencySummary> {
    return this.reports.agency(tenant);
  }
}
