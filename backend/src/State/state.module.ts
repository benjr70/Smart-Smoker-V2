import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PreSmokeSchema } from "src/presmoke/presmoke.schema";
import { PreSmokeService } from "src/presmoke/presmoke.service";
import { StateController } from "./state.controller";
import { stateSchema } from "./state.schema";
import { StateService } from "./state.service";



@Module({
    imports: [MongooseModule.forFeature([{name: 'state', schema: stateSchema}])],
    controllers: [StateController],
    providers: [StateService],
    exports: [StateService],
})
export class StateModule {}