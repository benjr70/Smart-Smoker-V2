import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RatingsSchema } from "./ratings.schema";
import { StateModule } from "src/State/state.module";
import { SmokeModule } from "src/smoke/smoke.module";
import { RatingsController } from "./ratings.controller";
import { RatingsService } from "./ratings.service";




@Module({
    imports: [MongooseModule.forFeature([{name: 'Ratings', schema: RatingsSchema}]), SmokeModule],
    controllers: [RatingsController],
    providers: [RatingsService],
    exports: [RatingsService],
})
export class RatingsModel {}