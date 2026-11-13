import { Inject, Injectable } from "@nestjs/common";
import type { Company, CreateCompanyInput, ListQuery, Page, UpdateCompanyInput } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, recordEvent } from "../../platform";
import { CustomFieldsService } from "./custom-fields.service";
import { type AccountTenant, notFound, toPage } from "./shared";

const toCompany = (row: typeof schema.companies.$inferSelect): Company => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
  website: row.website,
  phone: row.phone,
  custom: row.custom,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
  ) {}

  async create(tenant: AccountTenant, input: CreateCompanyInput): Promise<Company> {
    return this.database.withContext(tenant, async (tx) => {
      const custom = await this.customFields.merge(tx, tenant, "company", {}, input.custom);
      const [row] = await tx
        .insert(schema.companies)
        .values({
          id: uuidv7(),
          agencyId: tenant.agencyId,
          accountId: tenant.accountId,
          name: input.name,
          website: input.website ?? null,
          phone: input.phone ?? null,
          custom,
        })
        .returning();
      if (!row) throw new Error("Company insert returned no row");
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "company.created", payload: { companyId: row.id } });
      return toCompany(row);
    });
  }

  async list(tenant: AccountTenant, query: ListQuery): Promise<Page<Company>> {
    const rows = await this.database.withContext(tenant, (tx) =>
      tx
        .select()
        .from(schema.companies)
        .where(and(eq(schema.companies.accountId, tenant.accountId), query.cursor ? lt(schema.companies.id, query.cursor) : undefined))
        .orderBy(desc(schema.companies.id))
        .limit(query.limit + 1),
    );
    return toPage(rows, query.limit, toCompany);
  }

  async get(tenant: AccountTenant, companyId: string): Promise<Company> {
    const [row] = await this.database.withContext(tenant, (tx) =>
      tx.select().from(schema.companies).where(and(eq(schema.companies.id, companyId), eq(schema.companies.accountId, tenant.accountId))),
    );
    if (!row) throw notFound();
    return toCompany(row);
  }

  async update(tenant: AccountTenant, companyId: string, input: UpdateCompanyInput): Promise<Company> {
    return this.database.withContext(tenant, async (tx) => {
      const mine = and(eq(schema.companies.id, companyId), eq(schema.companies.accountId, tenant.accountId));
      const [current] = await tx.select().from(schema.companies).where(mine);
      if (!current) throw notFound();
      const custom = await this.customFields.merge(tx, tenant, "company", current.custom, input.custom);
      const [row] = await tx
        .update(schema.companies)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          custom,
          updatedAt: new Date(),
        })
        .where(mine)
        .returning();
      if (!row) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "company.updated", payload: { companyId, fields: Object.keys(input) } });
      return toCompany(row);
    });
  }

  /** The company's contacts stay; the database clears their company. */
  async remove(tenant: AccountTenant, companyId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const removed = await tx
        .delete(schema.companies)
        .where(and(eq(schema.companies.id, companyId), eq(schema.companies.accountId, tenant.accountId)))
        .returning({ id: schema.companies.id });
      if (removed.length === 0) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "company.deleted", payload: { companyId } });
    });
  }
}
