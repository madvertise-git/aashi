import { Inject, Injectable } from "@nestjs/common";
import type { Contact, ContactListQuery, CreateContactInput, Page, Tag, UpdateContactInput } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, asc, desc, eq, exists, inArray, lt } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, ProblemException, recordEvent, type Tx } from "../../platform";
import { CustomFieldsService } from "./custom-fields.service";
import { type AccountTenant, constraintOf, isUniqueViolation, notFound, toPage } from "./shared";

type Row = typeof schema.contacts.$inferSelect;

const toContact = (row: Row, tags: Tag[]): Contact => ({
  id: row.id,
  accountId: row.accountId,
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  phone: row.phone,
  companyId: row.companyId,
  tags,
  custom: row.custom,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
  ) {}

  async create(tenant: AccountTenant, input: CreateContactInput): Promise<Contact> {
    return this.write(() =>
      this.database.withContext(tenant, async (tx) => {
        const custom = await this.customFields.merge(tx, tenant, "contact", {}, input.custom);
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
            companyId: input.companyId ?? null,
            custom,
          })
          .returning();
        if (!row) throw new Error("Contact insert returned no row");
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "contact.created", payload: { contactId: row.id } });
        return toContact(row, []);
      }),
    );
  }

  /** Newest first. IDs are time-ordered, so "after this ID" is a stable cursor. */
  async list(tenant: AccountTenant, query: ContactListQuery): Promise<Page<Contact>> {
    return this.database.withContext(tenant, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.contacts)
        .where(
          and(
            eq(schema.contacts.accountId, tenant.accountId),
            query.cursor ? lt(schema.contacts.id, query.cursor) : undefined,
            query.companyId ? eq(schema.contacts.companyId, query.companyId) : undefined,
            query.tagId
              ? exists(
                  tx
                    .select({ one: schema.contactTags.tagId })
                    .from(schema.contactTags)
                    .where(
                      and(
                        eq(schema.contactTags.accountId, tenant.accountId),
                        eq(schema.contactTags.contactId, schema.contacts.id),
                        eq(schema.contactTags.tagId, query.tagId),
                      ),
                    ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.contacts.id))
        .limit(query.limit + 1);
      const tags = await this.tagsFor(tx, tenant, rows.slice(0, query.limit).map((r) => r.id));
      return toPage(rows, query.limit, (row) => toContact(row, tags.get(row.id) ?? []));
    });
  }

  async get(tenant: AccountTenant, contactId: string): Promise<Contact> {
    return this.database.withContext(tenant, async (tx) => {
      const row = await this.find(tx, tenant, contactId);
      return toContact(row, (await this.tagsFor(tx, tenant, [row.id])).get(row.id) ?? []);
    });
  }

  async update(tenant: AccountTenant, contactId: string, input: UpdateContactInput): Promise<Contact> {
    return this.write(() =>
      this.database.withContext(tenant, async (tx) => {
        const current = await this.find(tx, tenant, contactId);
        const custom = await this.customFields.merge(tx, tenant, "contact", current.custom, input.custom);
        const [row] = await tx
          .update(schema.contacts)
          .set({
            ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
            ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
            ...(input.email !== undefined ? { email: input.email?.toLowerCase() ?? null } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
            ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
            custom,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.accountId, tenant.accountId)))
          .returning();
        if (!row) throw notFound();
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "contact.updated", payload: { contactId, fields: Object.keys(input) } });
        return toContact(row, (await this.tagsFor(tx, tenant, [row.id])).get(row.id) ?? []);
      }),
    );
  }

  async remove(tenant: AccountTenant, contactId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const removed = await tx
        .delete(schema.contacts)
        .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.accountId, tenant.accountId)))
        .returning({ id: schema.contacts.id });
      if (removed.length === 0) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "contact.deleted", payload: { contactId } });
    });
  }

  /** The contact, or "not found". Other modules' services use this to check a contact belongs to the account. */
  async find(tx: Tx, tenant: AccountTenant, contactId: string): Promise<Row> {
    const [row] = await tx
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.accountId, tenant.accountId)));
    if (!row) throw notFound();
    return row;
  }

  /** Tags for a set of contacts in one query, by contact ID, each list in name order. */
  private async tagsFor(tx: Tx, tenant: AccountTenant, contactIds: string[]): Promise<Map<string, Tag[]>> {
    const byContact = new Map<string, Tag[]>();
    if (contactIds.length === 0) return byContact;
    const rows = await tx
      .select({ contactId: schema.contactTags.contactId, id: schema.tags.id, name: schema.tags.name })
      .from(schema.contactTags)
      .innerJoin(schema.tags, and(eq(schema.tags.id, schema.contactTags.tagId), eq(schema.tags.accountId, schema.contactTags.accountId)))
      .where(and(eq(schema.contactTags.accountId, tenant.accountId), inArray(schema.contactTags.contactId, contactIds)))
      .orderBy(asc(schema.tags.name));
    for (const { contactId, id, name } of rows) {
      const list = byContact.get(contactId) ?? [];
      list.push({ id, name });
      byContact.set(contactId, list);
    }
    return byContact;
  }

  /** Turns the database's refusals into answers a screen can act on. */
  private async write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProblemException(409, "phone_taken", "A contact with this phone number already exists in this account.");
      }
      // The company is in another account, or does not exist: the same answer either way.
      if (constraintOf(error) === "contacts_company_fkey") {
        throw new ProblemException(422, "company_not_found", "That company does not exist in this account.");
      }
      throw error;
    }
  }
}
