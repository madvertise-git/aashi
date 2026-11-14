import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  type Contact,
  contactListQuery,
  type ContactListQuery,
  createContactInput,
  type CreateContactInput,
  createNoteInput,
  type CreateNoteInput,
  listQuery,
  type ListQuery,
  type Note,
  type Page,
  updateContactInput,
  type UpdateContactInput,
} from "@aashi/contracts";
import { SessionGuard } from "../identity";
import { AccountGuard, CurrentTenant } from "../tenancy";
import { UuidPipe, ZodPipe } from "../../platform";
import { ContactsService } from "./contacts.service";
import { NotesService } from "./notes.service";
import type { AccountTenant } from "./shared";
import { TagsService } from "./tags.service";

@Controller("v1/accounts/:accountId/contacts")
@UseGuards(SessionGuard, AccountGuard)
export class ContactsController {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(NotesService) private readonly notes: NotesService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: AccountTenant, @Query(new ZodPipe(contactListQuery)) query: ContactListQuery): Promise<Page<Contact>> {
    return this.contacts.list(tenant, query);
  }

  @Post()
  create(@CurrentTenant() tenant: AccountTenant, @Body(new ZodPipe(createContactInput)) body: CreateContactInput): Promise<Contact> {
    return this.contacts.create(tenant, body);
  }

  @Get(":contactId")
  get(@CurrentTenant() tenant: AccountTenant, @Param("contactId", UuidPipe) contactId: string): Promise<Contact> {
    return this.contacts.get(tenant, contactId);
  }

  @Patch(":contactId")
  update(
    @CurrentTenant() tenant: AccountTenant,
    @Param("contactId", UuidPipe) contactId: string,
    @Body(new ZodPipe(updateContactInput)) body: UpdateContactInput,
  ): Promise<Contact> {
    return this.contacts.update(tenant, contactId, body);
  }

  @Delete(":contactId")
  @HttpCode(204)
  remove(@CurrentTenant() tenant: AccountTenant, @Param("contactId", UuidPipe) contactId: string): Promise<void> {
    return this.contacts.remove(tenant, contactId);
  }

  @Put(":contactId/tags/:tagId")
  @HttpCode(204)
  tag(
    @CurrentTenant() tenant: AccountTenant,
    @Param("contactId", UuidPipe) contactId: string,
    @Param("tagId", UuidPipe) tagId: string,
  ): Promise<void> {
    return this.tags.attach(tenant, contactId, tagId);
  }

  @Delete(":contactId/tags/:tagId")
  @HttpCode(204)
  untag(
    @CurrentTenant() tenant: AccountTenant,
    @Param("contactId", UuidPipe) contactId: string,
    @Param("tagId", UuidPipe) tagId: string,
  ): Promise<void> {
    return this.tags.detach(tenant, contactId, tagId);
  }

  @Get(":contactId/notes")
  listNotes(
    @CurrentTenant() tenant: AccountTenant,
    @Param("contactId", UuidPipe) contactId: string,
    @Query(new ZodPipe(listQuery)) query: ListQuery,
  ): Promise<Page<Note>> {
    return this.notes.list(tenant, contactId, query);
  }

  @Post(":contactId/notes")
  createNote(
    @CurrentTenant() tenant: AccountTenant,
    @Param("contactId", UuidPipe) contactId: string,
    @Body(new ZodPipe(createNoteInput)) body: CreateNoteInput,
  ): Promise<Note> {
    return this.notes.create(tenant, contactId, body);
  }
}
