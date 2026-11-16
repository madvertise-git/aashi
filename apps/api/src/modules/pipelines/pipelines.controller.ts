import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createDealInput,
  type CreateDealInput,
  createPipelineInput,
  type CreatePipelineInput,
  type Deal,
  type Pipeline,
  updateDealInput,
  type UpdateDealInput,
} from "@aashi/contracts";
import { SessionGuard } from "../identity";
import { AccountGuard, CurrentTenant, type Tenant } from "../tenancy";
import { UuidPipe, ZodPipe } from "../../platform";
import { PipelinesService } from "./pipelines.service";

type AccountTenant = Tenant & { accountId: string };

@Controller("v1/accounts/:accountId")
@UseGuards(SessionGuard, AccountGuard)
export class PipelinesController {
  constructor(@Inject(PipelinesService) private readonly pipelines: PipelinesService) {}

  @Get("pipelines")
  list(@CurrentTenant() tenant: AccountTenant): Promise<Pipeline[]> {
    return this.pipelines.list(tenant);
  }

  @Post("pipelines")
  create(@CurrentTenant() tenant: AccountTenant, @Body(new ZodPipe(createPipelineInput)) body: CreatePipelineInput): Promise<Pipeline> {
    return this.pipelines.create(tenant, body);
  }

  @Get("pipelines/:pipelineId/deals")
  listDeals(@CurrentTenant() tenant: AccountTenant, @Param("pipelineId", UuidPipe) pipelineId: string): Promise<Deal[]> {
    return this.pipelines.listDeals(tenant, pipelineId);
  }

  @Post("deals")
  createDeal(@CurrentTenant() tenant: AccountTenant, @Body(new ZodPipe(createDealInput)) body: CreateDealInput): Promise<Deal> {
    return this.pipelines.createDeal(tenant, body);
  }

  @Patch("deals/:dealId")
  updateDeal(
    @CurrentTenant() tenant: AccountTenant,
    @Param("dealId", UuidPipe) dealId: string,
    @Body(new ZodPipe(updateDealInput)) body: UpdateDealInput,
  ): Promise<Deal> {
    return this.pipelines.updateDeal(tenant, dealId, body);
  }

  @Delete("deals/:dealId")
  @HttpCode(204)
  deleteDeal(@CurrentTenant() tenant: AccountTenant, @Param("dealId", UuidPipe) dealId: string): Promise<void> {
    return this.pipelines.removeDeal(tenant, dealId);
  }
}
