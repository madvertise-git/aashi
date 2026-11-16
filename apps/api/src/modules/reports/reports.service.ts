import { Inject, Injectable } from "@nestjs/common";
import type { AccountSummary, AgencySummary } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Tenant } from "../tenancy";
import { DatabaseService, type Tx } from "../../platform";

type AccountTenant = Tenant & { accountId: string };

/** Dashboards show days as people in India see them. */
const ZONE = "Asia/Kolkata";
const DAYS = 14;

/**
 * Read-only numbers for dashboards, straight from PostgreSQL. Fine at today's
 * size; the plan moves reporting to ClickHouse in Release 3.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  account(tenant: AccountTenant): Promise<AccountSummary> {
    return this.database.withContext(tenant, async (tx) => {
      const { accountId } = tenant;
      const [contacts] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          last7Days: sql<number>`count(*) filter (where ${schema.contacts.createdAt} > now() - interval '7 days')::int`,
          previous7Days: sql<number>`count(*) filter (where ${schema.contacts.createdAt} <= now() - interval '7 days' and ${schema.contacts.createdAt} > now() - interval '14 days')::int`,
        })
        .from(schema.contacts)
        .where(eq(schema.contacts.accountId, accountId));
      const [companies] = await tx.select({ total: sql<number>`count(*)::int` }).from(schema.companies).where(eq(schema.companies.accountId, accountId));

      const stages = await this.stages(tx, accountId);
      const total = (kind: string) => {
        const of = stages.filter((s) => s.kind === kind);
        return { count: of.reduce((n, s) => n + s.count, 0), valueMinor: of.reduce((n, s) => n + s.valueMinor, 0) };
      };
      const [first] = await tx.select({ id: schema.pipelines.id }).from(schema.pipelines).where(eq(schema.pipelines.accountId, accountId)).orderBy(asc(schema.pipelines.id)).limit(1);

      // Every one of the last 14 days, with zero where nobody was added.
      const byDay = await tx.execute<{ date: string; count: number }>(sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(c.id)::int AS count
        FROM generate_series(
          (now() AT TIME ZONE ${ZONE})::date - ${DAYS - 1}::int, (now() AT TIME ZONE ${ZONE})::date, interval '1 day'
        ) AS d(day)
        LEFT JOIN contacts c
          ON c.account_id = ${accountId} AND (c.created_at AT TIME ZONE ${ZONE})::date = d.day::date
        GROUP BY d.day ORDER BY d.day`);

      const recentContacts = await tx
        .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName, createdAt: schema.contacts.createdAt })
        .from(schema.contacts)
        .where(eq(schema.contacts.accountId, accountId))
        .orderBy(desc(schema.contacts.id))
        .limit(5);
      const recentDeals = await tx
        .select({ id: schema.deals.id, title: schema.deals.title, valueMinor: schema.deals.valueMinor, stageName: schema.pipelineStages.name, updatedAt: schema.deals.updatedAt })
        .from(schema.deals)
        .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
        .where(eq(schema.deals.accountId, accountId))
        .orderBy(desc(schema.deals.updatedAt))
        .limit(5);

      return {
        contacts: contacts ?? { total: 0, last7Days: 0, previous7Days: 0 },
        companies: companies?.total ?? 0,
        deals: { open: total("open"), won: total("won"), lost: total("lost") },
        stages: stages.filter((s) => s.pipelineId === first?.id).map(({ id, name, kind, count, valueMinor }) => ({ id, name, kind, count, valueMinor })),
        contactsByDay: byDay.rows,
        recentContacts: recentContacts.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" "), createdAt: c.createdAt.toISOString() })),
        recentDeals: recentDeals.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() })),
      };
    });
  }

  /**
   * One row per client account. Client data is only visible with its account
   * named, so each account is read in its own context rather than in one
   * agency-wide query; that keeps the database's wall intact.
   */
  async agency(tenant: Tenant): Promise<AgencySummary> {
    const { accounts, members } = await this.database.withContext(tenant, async (tx) => ({
      accounts: await tx
        .select({ id: schema.accounts.id, name: schema.accounts.name, createdAt: schema.accounts.createdAt })
        .from(schema.accounts)
        .where(eq(schema.accounts.agencyId, tenant.agencyId))
        .orderBy(asc(schema.accounts.id))
        .limit(100),
      members: (await tx.select({ n: sql<number>`count(*)::int` }).from(schema.memberships).where(eq(schema.memberships.agencyId, tenant.agencyId)))[0]?.n ?? 0,
    }));

    const rows: AgencySummary["accounts"] = [];
    // A few at a time, so one page load cannot take every database connection.
    for (let i = 0; i < accounts.length; i += 5) {
      const batch = accounts.slice(i, i + 5).map((account) =>
        this.database.withContext({ ...tenant, accountId: account.id }, async (tx) => {
          const [contacts] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.contacts).where(eq(schema.contacts.accountId, account.id));
          const stages = await this.stages(tx, account.id);
          const sum = (kind: string, field: "count" | "valueMinor") => stages.filter((s) => s.kind === kind).reduce((n, s) => n + s[field], 0);
          return {
            id: account.id,
            name: account.name,
            createdAt: account.createdAt.toISOString(),
            contacts: contacts?.n ?? 0,
            openDeals: sum("open", "count"),
            openValueMinor: sum("open", "valueMinor"),
            wonValueMinor: sum("won", "valueMinor"),
          };
        }),
      );
      rows.push(...(await Promise.all(batch)));
    }
    return { members, accounts: rows };
  }

  /** Every stage in the account with how many deals it holds and what they are worth. */
  private stages(tx: Tx, accountId: string) {
    return tx
      .select({
        id: schema.pipelineStages.id,
        pipelineId: schema.pipelineStages.pipelineId,
        name: schema.pipelineStages.name,
        kind: schema.pipelineStages.kind,
        count: sql<number>`count(${schema.deals.id})::int`,
        valueMinor: sql<number>`coalesce(sum(${schema.deals.valueMinor}), 0)::float8`,
      })
      .from(schema.pipelineStages)
      .leftJoin(schema.deals, eq(schema.deals.stageId, schema.pipelineStages.id))
      .where(eq(schema.pipelineStages.accountId, accountId))
      .groupBy(schema.pipelineStages.id)
      .orderBy(asc(schema.pipelineStages.position));
  }
}
