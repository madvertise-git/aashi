import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Account, Agency, CreateAccountInput, CreateAgencyInput } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, recordEvent } from "../../platform";
import { requireRole } from "./roles";
import type { Tenant } from "./tenant.guard";

const toAccount = (row: typeof schema.accounts.$inferSelect): Account => ({
  id: row.id,
  agencyId: row.agencyId,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class TenancyService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Creates an agency and makes the signed-in user its owner. */
  async createAgency(userId: string, input: CreateAgencyInput): Promise<Agency> {
    const agencyId = uuidv7();
    await this.database.withContext({ userId, agencyId }, async (tx) => {
      await tx.insert(schema.agencies).values({ id: agencyId, name: input.name });
      await tx.insert(schema.memberships).values({ id: uuidv7(), agencyId, userId, role: "owner" });
      await recordEvent(tx, { agencyId, type: "agency.created", payload: { agencyId, createdBy: userId } });
    });
    return { id: agencyId, name: input.name, role: "owner" };
  }

  async createAccount(tenant: Tenant, input: CreateAccountInput): Promise<Account> {
    requireRole(tenant, "admin");
    return this.database.withContext(tenant, async (tx) => {
      const [row] = await tx
        .insert(schema.accounts)
        .values({ id: uuidv7(), agencyId: tenant.agencyId, name: input.name })
        .returning();
      if (!row) throw new Error("Account insert returned no row");
      await recordEvent(tx, {
        agencyId: tenant.agencyId,
        accountId: row.id,
        type: "account.created",
        payload: { accountId: row.id },
      });
      return toAccount(row);
    });
  }

  async listAccounts(tenant: Tenant): Promise<Account[]> {
    const rows = await this.database.withContext(tenant, (tx) =>
      tx.select().from(schema.accounts).where(eq(schema.accounts.agencyId, tenant.agencyId)).orderBy(asc(schema.accounts.id)),
    );
    return rows.map(toAccount);
  }

  async getAccount(tenant: Tenant, accountId: string): Promise<Account> {
    const [row] = await this.database.withContext(tenant, (tx) =>
      tx.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)),
    );
    if (!row) throw new NotFoundException();
    return toAccount(row);
  }
}
