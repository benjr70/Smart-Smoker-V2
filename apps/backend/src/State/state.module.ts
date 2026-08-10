import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateController } from './state.controller';
import { stateSchema } from './state.schema';
import { StateService } from './state.service';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'state', schema: stateSchema }]),
    // The cook's start is stamped when smoking is switched on.
    TimelineModule,
  ],
  controllers: [StateController],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
