import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  type Company,
  createCompanyInput,
  type CreateCompanyInput,
  createCustomFieldInput,
  type CreateCustomFieldInput,
  createTagInput,
  type CreateTagInput,
  type CustomField,
  listQuery,
  type ListQuery,
  type Page,
  type Tag,
  updateCompanyInput,
  type UpdateCompanyInput,
} from "@aashi/contracts";
import { SessionGuard } from "../identity";
import { AccountGuard, CurrentTenant } from "../tenancy";
import { UuidPipe, ZodPipe } from "../../platform";
import { CompaniesService } from "./companies.service";
import { CustomFieldsService } from "./custom-fields.service";
import { NotesService } from "./notes.service";
import type { AccountTenant } from "./shared";
import { TagsService } from "./tags.service";

/** Companies, tags, custom field definitions, and deleting a note by its own ID. */
@Controller("v1/accounts/:accountId")
@UseGuards(SessionGuard, AccountGuard)
export class RecordsController {
  constructor(
    @Inject(CompaniesService) private readonly companies: CompaniesService,
    @Inject(TagsService) private readonly tags: TagsService,
    @Inject(NotesService) private readonly notes: NotesService,
    @Inject(CustomFieldsService) private readonly customFields: CustomFieldsService,
  ) {}

  @Get("companies")
  listCompanies(@CurrentTenant() tenant: AccountTenant, @Query(new ZodPipe(listQuery)) query: ListQuery): Promise<Page<Company>> {
    return this.companies.list(tenant, query);
  }

  @Post("companies")
  createCompany(@CurrentTenant() tenant: AccountTenant, @Body(new ZodPipe(createCompanyInput)) body: CreateCompanyInput): Promise<Company> {
    return this.companies.create(tenant, body);
  }

  @Get("companies/:companyId")
  getCompany(@CurrentTenant() tenant: AccountTenant, @Param("companyId", UuidPipe) companyId: string): Promise<Company> {
    return this.companies.get(tenant, companyId);
  }

  @Patch("companies/:companyId")
  updateCompany(
    @CurrentTenant() tenant: AccountTenant,
    @Param("companyId", UuidPipe) companyId: string,
    @Body(new ZodPipe(updateCompanyInput)) body: UpdateCompanyInput,
  ): Promise<Company> {
    return this.companies.update(tenant, companyId, body);
  }

  @Delete("companies/:companyId")
  @HttpCode(204)
  deleteCompany(@CurrentTenant() tenant: AccountTenant, @Param("companyId", UuidPipe) companyId: string): Promise<void> {
    return this.companies.remove(tenant, companyId);
  }

  @Get("tags")
  listTags(@CurrentTenant() tenant: AccountTenant): Promise<Tag[]> {
    return this.tags.list(tenant);
  }

  @Post("tags")
  createTag(@CurrentTenant() tenant: AccountTenant, @Body(new ZodPipe(createTagInput)) body: CreateTagInput): Promise<Tag> {
    return this.tags.create(tenant, body);
  }

  @Delete("tags/:tagId")
  @HttpCode(204)
  deleteTag(@CurrentTenant() tenant: AccountTenant, @Param("tagId", UuidPipe) tagId: string): Promise<void> {
    return this.tags.remove(tenant, tagId);
  }

  @Delete("notes/:noteId")
  @HttpCode(204)
  deleteNote(@CurrentTenant() tenant: AccountTenant, @Param("noteId", UuidPipe) noteId: string): Promise<void> {
    return this.notes.remove(tenant, noteId);
  }

  @Get("custom-fields")
  listCustomFields(@CurrentTenant() tenant: AccountTenant): Promise<CustomField[]> {
    return this.customFields.list(tenant);
  }

  @Post("custom-fields")
  createCustomField(
    @CurrentTenant() tenant: AccountTenant,
    @Body(new ZodPipe(createCustomFieldInput)) body: CreateCustomFieldInput,
  ): Promise<CustomField> {
    return this.customFields.create(tenant, body);
  }

  @Delete("custom-fields/:fieldId")
  @HttpCode(204)
  deleteCustomField(@CurrentTenant() tenant: AccountTenant, @Param("fieldId", UuidPipe) fieldId: string): Promise<void> {
    return this.customFields.remove(tenant, fieldId);
  }
}
