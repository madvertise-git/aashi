import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import {
  type Contact,
  createContactInput,
  type CreateContactInput,
  listQuery,
  type ListQuery,
  type Page,
} from "@aashi/contracts";
import { SessionGuard } from "../identity";
import { AccountGuard, CurrentTenant, type Tenant } from "../tenancy";
import { ZodPipe } from "../../platform";
import { ContactsService } from "./contacts.service";

type AccountTenant = Tenant & { accountId: string };

@Controller("v1/accounts/:accountId/contacts")
@UseGuards(SessionGuard, AccountGuard)
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  @Get()
  list(@CurrentTenant() tenant: Tenant, @Query(new ZodPipe(listQuery)) query: ListQuery): Promise<Page<Contact>> {
    return this.contacts.list(tenant as AccountTenant, query);
  }

  @Post()
  create(
    @CurrentTenant() tenant: Tenant,
    @Body(new ZodPipe(createContactInput)) body: CreateContactInput,
  ): Promise<Contact> {
    return this.contacts.create(tenant as AccountTenant, body);
  }
}
