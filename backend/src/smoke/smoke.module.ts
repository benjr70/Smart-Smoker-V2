import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SmokeController } from "./smoke.controller";
import { SmokeSchema } from "./smoke.schema";
import { SmokeService } from "./smoke.service";



@Module({
    imports:[MongooseModule.forFeature([{name: 'Smoke', schema: SmokeSchema}])],
    controllers: [SmokeController],
    providers: [SmokeService],
})

export class SmokeModule {}