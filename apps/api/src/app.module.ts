import { Module } from "@nestjs/common";
import { CrmModule } from "./modules/crm";
import { IdentityModule } from "./modules/identity";
import { TenancyModule } from "./modules/tenancy";
import { PlatformModule } from "./platform";

@Module({ imports: [PlatformModule, IdentityModule, TenancyModule, CrmModule] })
export class AppModule {}
