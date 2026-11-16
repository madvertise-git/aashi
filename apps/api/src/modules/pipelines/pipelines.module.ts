import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { TenancyModule } from "../tenancy";
import { PipelinesController } from "./pipelines.controller";
import { PipelinesService } from "./pipelines.service";

@Module({ imports: [IdentityModule, TenancyModule], controllers: [PipelinesController], providers: [PipelinesService] })
export class PipelinesModule {}
