import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Agency, CreateInviteInput, Invite, Member, Role } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { CONFIG, type Config, DatabaseService, Mailer, ProblemException, recordEvent } from "../../platform";
import { requireRole } from "./roles";
import type { Tenant } from "./tenant.guard";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toInvite = (row: typeof schema.invites.$inferSelect): Invite => ({
  id: row.id,
  email: row.email,
  role: row.role,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class InvitesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(Mailer) private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async listMembers(tenant: Tenant): Promise<Member[]> {
    const rows = await this.database.withContext(tenant, (tx) =>
      tx
        .select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(eq(schema.memberships.agencyId, tenant.agencyId))
        .orderBy(asc(schema.memberships.id)),
    );
    return rows.map((r) => ({ ...r, role: r.role as Role }));
  }

  async list(tenant: Tenant): Promise<Invite[]> {
    requireRole(tenant, "admin");
    const rows = await this.database.withContext(tenant, (tx) =>
      tx
        .select()
        .from(schema.invites)
        .where(and(eq(schema.invites.agencyId, tenant.agencyId), isNull(schema.invites.acceptedAt)))
        .orderBy(asc(schema.invites.id)),
    );
    return rows.map(toInvite);
  }

  /** Invites someone by email. Inviting the same email again replaces the earlier invite and sends a fresh link. */
  async create(tenant: Tenant, input: CreateInviteInput): Promise<Invite> {
    requireRole(tenant, "admin");
    const email = input.email.toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const { invite, agencyName } = await this.database.withContext(tenant, async (tx) => {
      const [member] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(and(eq(schema.memberships.agencyId, tenant.agencyId), eq(schema.users.email, email)));
      if (member) throw new ProblemException(409, "already_member", "That person is already in this agency.");

      await tx
        .delete(schema.invites)
        .where(and(eq(schema.invites.agencyId, tenant.agencyId), eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)));
      const [row] = await tx
        .insert(schema.invites)
        .values({
          id: uuidv7(),
          agencyId: tenant.agencyId,
          email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedBy: tenant.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning();
      if (!row) throw new Error("Invite insert returned no row");
      const [agency] = await tx.select({ name: schema.agencies.name }).from(schema.agencies).where(eq(schema.agencies.id, tenant.agencyId));
      await recordEvent(tx, { agencyId: tenant.agencyId, type: "invite.created", payload: { inviteId: row.id, role: row.role } });
      return { invite: toInvite(row), agencyName: agency?.name ?? this.config.appName };
    });

    await this.mailer.send({
      to: email,
      subject: `You have been invited to join ${agencyName}`,
      text:
        `You have been invited to join ${agencyName} as ${input.role === "admin" ? "an admin" : "a team member"}.\n\n` +
        `Open this link to accept. It works for 7 days:\n${this.config.appUrl}/invites/accept?token=${token}\n`,
    });
    return invite;
  }

  async revoke(tenant: Tenant, inviteId: string): Promise<void> {
    requireRole(tenant, "admin");
    const removed = await this.database.withContext(tenant, (tx) =>
      tx
        .delete(schema.invites)
        .where(and(eq(schema.invites.id, inviteId), eq(schema.invites.agencyId, tenant.agencyId), isNull(schema.invites.acceptedAt)))
        .returning({ id: schema.invites.id }),
    );
    if (removed.length === 0) throw new NotFoundException();
  }

  /**
   * The signed-in user joins the agency their invite is for. The invite must be
   * for their own email; anything else looks exactly like a link that does not exist.
   */
  async accept(user: { userId: string; email: string }, token: string): Promise<Agency> {
    const invite = await this.database.lookup<{ id: string; agency_id: string; email: string; role: "admin" | "member" }>(
      sql`SELECT * FROM auth_invite(${hashToken(token)})`,
    );
    if (!invite || invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ProblemException(404, "invite_not_found", "This invite link is not valid for your account, or it has expired.");
    }
    return this.database.withContext({ userId: user.userId, agencyId: invite.agency_id }, async (tx) => {
      const claimed = await tx
        .update(schema.invites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.acceptedAt)))
        .returning({ id: schema.invites.id });
      if (claimed.length === 0) throw new ProblemException(404, "invite_not_found", "This invite link has already been used.");
      await tx
        .insert(schema.memberships)
        .values({ id: uuidv7(), agencyId: invite.agency_id, userId: user.userId, role: invite.role })
        .onConflictDoNothing();
      const [membership] = await tx
        .select({ role: schema.memberships.role, name: schema.agencies.name })
        .from(schema.memberships)
        .innerJoin(schema.agencies, eq(schema.agencies.id, schema.memberships.agencyId))
        .where(and(eq(schema.memberships.agencyId, invite.agency_id), eq(schema.memberships.userId, user.userId)));
      if (!membership) throw new Error("Membership missing after accepting invite");
      await recordEvent(tx, { agencyId: invite.agency_id, type: "member.joined", payload: { userId: user.userId, role: membership.role } });
      return { id: invite.agency_id, name: membership.name, role: membership.role as Role };
    });
  }
}
