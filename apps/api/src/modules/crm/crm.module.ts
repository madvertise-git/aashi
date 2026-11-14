import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { TenancyModule } from "../tenancy";
import { CompaniesService } from "./companies.service";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { CustomFieldsService } from "./custom-fields.service";
import { NotesService } from "./notes.service";
import { RecordsController } from "./records.controller";
import { TagsService } from "./tags.service";

@Module({
  imports: [IdentityModule, TenancyModule],
  controllers: [ContactsController, RecordsController],
  providers: [ContactsService, CompaniesService, TagsService, NotesService, CustomFieldsService],
})
export class CrmModule {}
