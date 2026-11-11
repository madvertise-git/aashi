import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Role } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, eq, sql } from "drizzle-orm";
import type { Request } from "express";
import type { Session } from "../identity";
import { DatabaseService, isUuid, type TenantContext } from "../../platform";

/** The checked tenant for this request: safe to hand to DatabaseService.withContext. */
export interface Tenant extends Required<Pick<TenantContext, "userId" | "agencyId">> {
  accountId?: string;
  role: Role;
}

type TenantRequest = Request & { session?: Session; tenant?: Tenant };

/**
 * Step two of the request pipeline, for /v1/agencies/:agencyId/... routes:
 * is this user a member of that agency? If not, the agency "does not exist"
 * (never "forbidden", which would confirm that it does).
 * Must run after SessionGuard.
 */
@Injectable()
export class AgencyGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const userId = req.session?.userId;
    const agencyId = req.params.agencyId;
    if (!userId || !isUuid(agencyId)) throw new NotFoundException();
    const [membership] = await this.database.withContext({ userId }, (tx) =>
      tx
        .select({ role: schema.memberships.role })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.agencyId, agencyId))),
    );
    if (!membership) throw new NotFoundException();
    req.tenant = { userId, agencyId, role: membership.role };
    return true;
  }
}

/**
 * The same check for /v1/accounts/:accountId/... routes. Finds the agency the
 * client account belongs to and confirms the user is a member of it.
 * Must run after SessionGuard.
 */
@Injectable()
export class AccountGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const userId = req.session?.userId;
    const accountId = req.params.accountId;
    if (!userId || !isUuid(accountId)) throw new NotFoundException();
    const access = await this.database.lookup<{ agency_id: string; role: Role }>(
      sql`SELECT * FROM auth_account_access(${userId}, ${accountId})`,
    );
    if (!access) throw new NotFoundException();
    req.tenant = { userId, agencyId: access.agency_id, accountId, role: access.role };
    return true;
  }
}

/** The checked tenant. Only valid on routes behind AgencyGuard or AccountGuard. */
export const CurrentTenant = createParamDecorator((_: unknown, context: ExecutionContext): Tenant => {
  const tenant = context.switchToHttp().getRequest<TenantRequest>().tenant;
  if (!tenant) throw new NotFoundException();
  return tenant;
});
