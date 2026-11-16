import { Inject, Injectable } from "@nestjs/common";
import type { CreateDealInput, CreatePipelineInput, Deal, Pipeline, Stage, UpdateDealInput } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { requireRole, type Tenant } from "../tenancy";
import { DatabaseService, ProblemException, recordEvent, type Tx } from "../../platform";

type AccountTenant = Tenant & { accountId: string };

/** The stages a new pipeline starts with. */
const STANDARD_STAGES: [name: string, kind: Stage["kind"]][] = [
  ["New lead", "open"],
  ["Contacted", "open"],
  ["Qualified", "open"],
  ["Proposal sent", "open"],
  ["Won", "won"],
  ["Lost", "lost"],
];

const notFound = () => new ProblemException(404, "not_found", "Not Found");

/** The constraint a PostgreSQL error names, if any. */
function constraintOf(error: unknown): string | undefined {
  for (let e = error as { constraint?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (typeof e.constraint === "string") return e.constraint;
  }
  return undefined;
}

const dealColumns = {
  id: schema.deals.id,
  pipelineId: schema.deals.pipelineId,
  stageId: schema.deals.stageId,
  title: schema.deals.title,
  valueMinor: schema.deals.valueMinor,
  currency: schema.deals.currency,
  position: schema.deals.position,
  contactId: schema.deals.contactId,
  contactName: sql<string | null>`nullif(concat_ws(' ', ${schema.contacts.firstName}, ${schema.contacts.lastName}), '')`,
  closedAt: schema.deals.closedAt,
  createdAt: schema.deals.createdAt,
};

interface DealRow extends Omit<Deal, "closedAt" | "createdAt"> {
  closedAt: Date | null;
  createdAt: Date;
}
const toDeal = (row: DealRow): Deal => ({ ...row, closedAt: row.closedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() });

@Injectable()
export class PipelinesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(tenant: AccountTenant): Promise<Pipeline[]> {
    return this.database.withContext(tenant, async (tx) => {
      const pipelines = await tx
        .select({ id: schema.pipelines.id, name: schema.pipelines.name })
        .from(schema.pipelines)
        .where(eq(schema.pipelines.accountId, tenant.accountId))
        .orderBy(asc(schema.pipelines.id));
      const stages = await tx
        .select()
        .from(schema.pipelineStages)
        .where(eq(schema.pipelineStages.accountId, tenant.accountId))
        .orderBy(asc(schema.pipelineStages.position));
      return pipelines.map((p) => ({
        ...p,
        stages: stages.filter((s) => s.pipelineId === p.id).map((s) => ({ id: s.id, name: s.name, position: s.position, kind: s.kind })),
      }));
    });
  }

  async create(tenant: AccountTenant, input: CreatePipelineInput): Promise<Pipeline> {
    requireRole(tenant, "admin");
    return this.database.withContext(tenant, async (tx) => {
      const stamp = { agencyId: tenant.agencyId, accountId: tenant.accountId };
      const pipelineId = uuidv7();
      await tx.insert(schema.pipelines).values({ id: pipelineId, ...stamp, name: input.name });
      const stages = STANDARD_STAGES.map(([name, kind], position) => ({ id: uuidv7(), name, position, kind }));
      await tx.insert(schema.pipelineStages).values(stages.map((s) => ({ ...s, ...stamp, pipelineId })));
      await recordEvent(tx, { ...stamp, type: "pipeline.created", payload: { pipelineId } });
      return { id: pipelineId, name: input.name, stages };
    });
  }

  async listDeals(tenant: AccountTenant, pipelineId: string): Promise<Deal[]> {
    return this.database.withContext(tenant, async (tx) => {
      const [pipeline] = await tx
        .select({ id: schema.pipelines.id })
        .from(schema.pipelines)
        .where(and(eq(schema.pipelines.id, pipelineId), eq(schema.pipelines.accountId, tenant.accountId)));
      if (!pipeline) throw notFound();
      const rows = await this.selectDeals(tx)
        .where(and(eq(schema.deals.accountId, tenant.accountId), eq(schema.deals.pipelineId, pipelineId)))
        .orderBy(asc(schema.deals.position), asc(schema.deals.id))
        .limit(1000);
      return rows.map(toDeal);
    });
  }

  async createDeal(tenant: AccountTenant, input: CreateDealInput): Promise<Deal> {
    return this.write(() =>
      this.database.withContext(tenant, async (tx) => {
        const stage = await this.stage(tx, tenant, input.pipelineId, input.stageId);
        const id = uuidv7();
        await tx.insert(schema.deals).values({
          id,
          agencyId: tenant.agencyId,
          accountId: tenant.accountId,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          contactId: input.contactId ?? null,
          title: input.title,
          valueMinor: input.valueMinor,
          // The time now sorts a new deal below everything already there.
          position: Date.now(),
          closedAt: stage.kind === "open" ? null : new Date(),
        });
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "deal.created", payload: { dealId: id, stageId: input.stageId } });
        return this.one(tx, tenant, id);
      }),
    );
  }

  async updateDeal(tenant: AccountTenant, dealId: string, input: UpdateDealInput): Promise<Deal> {
    return this.write(() =>
      this.database.withContext(tenant, async (tx) => {
        const mine = and(eq(schema.deals.id, dealId), eq(schema.deals.accountId, tenant.accountId));
        const [current] = await tx.select().from(schema.deals).where(mine);
        if (!current) throw notFound();
        const moved = input.stageId !== undefined && input.stageId !== current.stageId;
        const stage = moved ? await this.stage(tx, tenant, current.pipelineId, input.stageId!) : undefined;
        await tx
          .update(schema.deals)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.valueMinor !== undefined ? { valueMinor: input.valueMinor } : {}),
            ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
            ...(stage ? { stageId: stage.id, closedAt: stage.kind === "open" ? null : new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(mine);
        const stamp = { agencyId: tenant.agencyId, accountId: tenant.accountId };
        if (stage) {
          await recordEvent(tx, { ...stamp, type: "deal.moved", payload: { dealId, fromStageId: current.stageId, toStageId: stage.id } });
          // Won and lost are what automations and the conversions socket will listen for.
          if (stage.kind !== "open") await recordEvent(tx, { ...stamp, type: `deal.${stage.kind}`, payload: { dealId, valueMinor: input.valueMinor ?? current.valueMinor } });
        } else if (Object.keys(input).some((key) => key !== "position" && key !== "stageId")) {
          await recordEvent(tx, { ...stamp, type: "deal.updated", payload: { dealId, fields: Object.keys(input) } });
        }
        return this.one(tx, tenant, dealId);
      }),
    );
  }

  async removeDeal(tenant: AccountTenant, dealId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const removed = await tx
        .delete(schema.deals)
        .where(and(eq(schema.deals.id, dealId), eq(schema.deals.accountId, tenant.accountId)))
        .returning({ id: schema.deals.id });
      if (removed.length === 0) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "deal.deleted", payload: { dealId } });
    });
  }

  private selectDeals(tx: Tx) {
    return tx
      .select(dealColumns)
      .from(schema.deals)
      .leftJoin(schema.contacts, and(eq(schema.contacts.id, schema.deals.contactId), eq(schema.contacts.accountId, schema.deals.accountId)));
  }

  private async one(tx: Tx, tenant: AccountTenant, dealId: string): Promise<Deal> {
    const [row] = await this.selectDeals(tx).where(and(eq(schema.deals.id, dealId), eq(schema.deals.accountId, tenant.accountId)));
    if (!row) throw notFound();
    return toDeal(row);
  }

  /** The stage, if it is in this account and this pipeline. Otherwise the same refusal as a made-up ID. */
  private async stage(tx: Tx, tenant: AccountTenant, pipelineId: string, stageId: string) {
    const [stage] = await tx
      .select({ id: schema.pipelineStages.id, kind: schema.pipelineStages.kind })
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.id, stageId),
          eq(schema.pipelineStages.pipelineId, pipelineId),
          eq(schema.pipelineStages.accountId, tenant.accountId),
        ),
      );
    if (!stage) throw new ProblemException(422, "stage_not_found", "That stage does not exist in this pipeline.");
    return stage;
  }

  private async write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      // The contact is in another account, or does not exist: the same answer either way.
      if (constraintOf(error)?.includes("contact_id")) {
        throw new ProblemException(422, "contact_not_found", "That contact does not exist in this account.");
      }
      throw error;
    }
  }
}
