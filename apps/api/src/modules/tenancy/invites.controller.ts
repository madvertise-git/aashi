import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  acceptInviteInput,
  type AcceptInviteInput,
  type Agency,
  createInviteInput,
  type CreateInviteInput,
  type Invite,
  type Member,
} from "@aashi/contracts";
import { CurrentSession, type Session, SessionGuard } from "../identity";
import { RateLimit, RateLimitGuard, UuidPipe, ZodPipe } from "../../platform";
import { InvitesService } from "./invites.service";
import { AgencyGuard, CurrentTenant, type Tenant } from "./tenant.guard";

@Controller("v1")
@UseGuards(SessionGuard)
export class InvitesController {
  constructor(@Inject(InvitesService) private readonly invites: InvitesService) {}

  @Get("agencies/:agencyId/members")
  @UseGuards(AgencyGuard)
  listMembers(@CurrentTenant() tenant: Tenant): Promise<Member[]> {
    return this.invites.listMembers(tenant);
  }

  @Get("agencies/:agencyId/invites")
  @UseGuards(AgencyGuard)
  list(@CurrentTenant() tenant: Tenant): Promise<Invite[]> {
    return this.invites.list(tenant);
  }

  @Post("agencies/:agencyId/invites")
  @UseGuards(AgencyGuard, RateLimitGuard)
  @RateLimit({ name: "invite", max: 60, windowSeconds: 3600 })
  create(@CurrentTenant() tenant: Tenant, @Body(new ZodPipe(createInviteInput)) body: CreateInviteInput): Promise<Invite> {
    return this.invites.create(tenant, body);
  }

  @Delete("agencies/:agencyId/invites/:inviteId")
  @HttpCode(204)
  @UseGuards(AgencyGuard)
  revoke(@CurrentTenant() tenant: Tenant, @Param("inviteId", UuidPipe) inviteId: string): Promise<void> {
    return this.invites.revoke(tenant, inviteId);
  }

  @Post("invites/accept")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "invite-accept", max: 20, windowSeconds: 600 })
  accept(@CurrentSession() session: Session, @Body(new ZodPipe(acceptInviteInput)) body: AcceptInviteInput): Promise<Agency> {
    return this.invites.accept(session, body.token);
  }
}
