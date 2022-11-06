import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
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