import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import {
  type Account,
  type Agency,
  createAccountInput,
  type CreateAccountInput,
  createAgencyInput,
  type CreateAgencyInput,
} from "@aashi/contracts";
import { CurrentSession, type Session, SessionGuard } from "../identity";
import { ZodPipe } from "../../platform";
import { AccountGuard, AgencyGuard, CurrentTenant, type Tenant } from "./tenant.guard";
import { TenancyService } from "./tenancy.service";

@Controller("v1")
@UseGuards(SessionGuard)
export class TenancyController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Post("agencies")
  createAgency(
    @CurrentSession() session: Session,
    @Body(new ZodPipe(createAgencyInput)) body: CreateAgencyInput,
  ): Promise<Agency> {
    return this.tenancy.createAgency(session.userId, body);
  }

  @Get("agencies/:agencyId/accounts")
  @UseGuards(AgencyGuard)
  listAccounts(@CurrentTenant() tenant: Tenant): Promise<Account[]> {
    return this.tenancy.listAccounts(tenant);
  }

  @Post("agencies/:agencyId/accounts")
  @UseGuards(AgencyGuard)
  createAccount(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(createAccountInput)) body: CreateAccountInput,
  ): Promise<Account> {
    return this.tenancy.createAccount(tenant, body);
  }

  @Get("accounts/:accountId")
  @UseGuards(AccountGuard)
  getAccount(@CurrentTenant() tenant: Tenant): Promise<Account> {
    return this.tenancy.getAccount(tenant, tenant.accountId!);
  }
}
