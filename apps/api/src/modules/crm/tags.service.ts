import { Inject, Injectable } from "@nestjs/common";
import type { CreateTagInput, Tag } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { DatabaseService, ProblemException, recordEvent } from "../../platform";
import { ContactsService } from "./contacts.service";
import { type AccountTenant, isUniqueViolation, notFound } from "./shared";

@Injectable()
export class TagsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {}

  list(tenant: AccountTenant): Promise<Tag[]> {
    return this.database.withContext(tenant, (tx) =>
      tx
        .select({ id: schema.tags.id, name: schema.tags.name })
        .from(schema.tags)
        .where(eq(schema.tags.accountId, tenant.accountId))
        .orderBy(asc(schema.tags.name)),
    );
  }

  async create(tenant: AccountTenant, input: CreateTagInput): Promise<Tag> {
    try {
      return await this.database.withContext(tenant, async (tx) => {
        const [row] = await tx
          .insert(schema.tags)
          .values({ id: uuidv7(), agencyId: tenant.agencyId, accountId: tenant.accountId, name: input.name })
          .returning({ id: schema.tags.id, name: schema.tags.name });
        if (!row) throw new Error("Tag insert returned no row");
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "tag.created", payload: { tagId: row.id } });
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ProblemException(409, "tag_exists", "A tag with this name already exists.");
      throw error;
    }
  }

  /** Deleting a tag takes it off every contact (the database does that). */
  async remove(tenant: AccountTenant, tagId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const removed = await tx
        .delete(schema.tags)
        .where(and(eq(schema.tags.id, tagId), eq(schema.tags.accountId, tenant.accountId)))
        .returning({ id: schema.tags.id });
      if (removed.length === 0) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "tag.deleted", payload: { tagId } });
    });
  }

  async attach(tenant: AccountTenant, contactId: string, tagId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      await this.contacts.find(tx, tenant, contactId);
      const [tag] = await tx.select({ id: schema.tags.id }).from(schema.tags).where(and(eq(schema.tags.id, tagId), eq(schema.tags.accountId, tenant.accountId)));
      if (!tag) throw notFound();
      const added = await tx
        .insert(schema.contactTags)
        .values({ agencyId: tenant.agencyId, accountId: tenant.accountId, contactId, tagId })
        .onConflictDoNothing()
        .returning({ tagId: schema.contactTags.tagId });
      // Only a real change is an event: automations must not fire twice for the same tag.
      if (added.length > 0) {
        await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "contact.tagged", payload: { contactId, tagId } });
      }
    });
  }

  async detach(tenant: AccountTenant, contactId: string, tagId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const removed = await tx
        .delete(schema.contactTags)
        .where(and(eq(schema.contactTags.accountId, tenant.accountId), eq(schema.contactTags.contactId, contactId), eq(schema.contactTags.tagId, tagId)))
        .returning({ tagId: schema.contactTags.tagId });
      if (removed.length === 0) throw notFound();
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "contact.untagged", payload: { contactId, tagId } });
    });
  }
}
