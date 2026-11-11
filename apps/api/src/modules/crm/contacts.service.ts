import { Inject, Injectable } from "@nestjs/common";
import type { Contact, CreateContactInput, ListQuery, Page } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, ProblemException, recordEvent } from "../../platform";
import type { Tenant } from "../tenancy";

type AccountTenant = Tenant & { accountId: string };

const toContact = (row: typeof schema.contacts.$inferSelect): Contact => ({
  id: row.id,
  accountId: row.accountId,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class ContactsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(tenant: AccountTenant, input: CreateContactInput): Promise<Contact> {
    try {
      return await this.database.withContext(tenant, async (tx) => {
        const [row] = await tx
          .insert(schema.contacts)
          .values({
            id: uuidv7(),
            agencyId: tenant.agencyId,
            accountId: tenant.accountId,
            firstName: input.firstName,
            lastName: input.lastName ?? null,
            email: input.email?.toLowerCase() ?? null,
            phone: input.phone ?? null,
          })
          .returning();
        if (!row) throw new Error("Contact insert returned no row");
        await recordEvent(tx, {
          agencyId: tenant.agencyId,
          accountId: tenant.accountId,
          type: "contact.created",
          payload: { contactId: row.id },
        });
        return toContact(row);
      });
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
        throw new ProblemException(409, "phone_taken", "A contact with this phone number already exists in this account.");
      }
      throw error;
    }
  }

  /** Newest first. IDs are time-ordered, so "after this ID" is a stable cursor. */
  async list(tenant: AccountTenant, query: ListQuery): Promise<Page<Contact>> {
    const rows = await this.database.withContext(tenant, (tx) =>
      tx
        .select()
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.accountId, tenant.accountId),
            query.cursor ? lt(schema.contacts.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(schema.contacts.id))
        .limit(query.limit + 1),
    );
    const items = rows.slice(0, query.limit).map(toContact);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }
}
