import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { TenancyModule } from "../tenancy";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [IdentityModule, TenancyModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
