import { Inject, Injectable } from "@nestjs/common";
import type { CreateNoteInput, ListQuery, Note, Page } from "@aashi/contracts";
import { schema } from "@aashi/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { requireRole } from "../tenancy";
import { DatabaseService, recordEvent } from "../../platform";
import { ContactsService } from "./contacts.service";
import { type AccountTenant, notFound, toPage } from "./shared";

interface Row {
  id: string;
  contactId: string;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
}

const toNote = (row: Row): Note => ({ ...row, createdAt: row.createdAt.toISOString() });

@Injectable()
export class NotesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {}

  async list(tenant: AccountTenant, contactId: string, query: ListQuery): Promise<Page<Note>> {
    return this.database.withContext(tenant, async (tx) => {
      await this.contacts.find(tx, tenant, contactId);
      const rows = await tx
        .select({
          id: schema.notes.id,
          contactId: schema.notes.contactId,
          body: schema.notes.body,
          authorId: schema.notes.authorId,
          authorName: schema.users.name,
          createdAt: schema.notes.createdAt,
        })
        .from(schema.notes)
        .leftJoin(schema.users, eq(schema.users.id, schema.notes.authorId))
        .where(
          and(
            eq(schema.notes.accountId, tenant.accountId),
            eq(schema.notes.contactId, contactId),
            query.cursor ? lt(schema.notes.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(schema.notes.id))
        .limit(query.limit + 1);
      return toPage(rows, query.limit, toNote);
    });
  }

  async create(tenant: AccountTenant, contactId: string, input: CreateNoteInput): Promise<Note> {
    return this.database.withContext(tenant, async (tx) => {
      await this.contacts.find(tx, tenant, contactId);
      const [row] = await tx
        .insert(schema.notes)
        .values({ id: uuidv7(), agencyId: tenant.agencyId, accountId: tenant.accountId, contactId, body: input.body, authorId: tenant.userId })
        .returning();
      if (!row) throw new Error("Note insert returned no row");
      const [author] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, tenant.userId));
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "note.created", payload: { noteId: row.id, contactId } });
      return toNote({ id: row.id, contactId, body: row.body, authorId: row.authorId, authorName: author?.name ?? null, createdAt: row.createdAt });
    });
  }

  /** The person who wrote a note may delete it; so may an admin or owner. */
  async remove(tenant: AccountTenant, noteId: string): Promise<void> {
    await this.database.withContext(tenant, async (tx) => {
      const mine = and(eq(schema.notes.id, noteId), eq(schema.notes.accountId, tenant.accountId));
      const [note] = await tx.select({ authorId: schema.notes.authorId, contactId: schema.notes.contactId }).from(schema.notes).where(mine);
      if (!note) throw notFound();
      if (note.authorId !== tenant.userId) requireRole(tenant, "admin");
      await tx.delete(schema.notes).where(mine);
      await recordEvent(tx, { agencyId: tenant.agencyId, accountId: tenant.accountId, type: "note.deleted", payload: { noteId, contactId: note.contactId } });
    });
  }
}
