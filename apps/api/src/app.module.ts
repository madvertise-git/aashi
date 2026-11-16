import { Module } from "@nestjs/common";
import { CrmModule } from "./modules/crm";
import { IdentityModule } from "./modules/identity";
import { PipelinesModule } from "./modules/pipelines";
import { ReportsModule } from "./modules/reports";
import { TenancyModule } from "./modules/tenancy";
import { PlatformModule } from "./platform";
import { SocketsModule } from "./sockets";

@Module({ imports: [PlatformModule, SocketsModule, IdentityModule, TenancyModule, CrmModule, PipelinesModule, ReportsModule] })
export class AppModule {}
