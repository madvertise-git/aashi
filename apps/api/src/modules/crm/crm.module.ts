import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { TenancyModule } from "../tenancy";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [IdentityModule, TenancyModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class CrmModule {}
