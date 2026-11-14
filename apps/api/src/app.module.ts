import { Module } from "@nestjs/common";
import { CrmModule } from "./modules/crm";
import { IdentityModule } from "./modules/identity";
import { TenancyModule } from "./modules/tenancy";
import { PlatformModule } from "./platform";
import { SocketsModule } from "./sockets";

@Module({ imports: [PlatformModule, SocketsModule, IdentityModule, TenancyModule, CrmModule] })
export class AppModule {}
