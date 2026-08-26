import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateController } from './state.controller';
import { stateSchema } from './state.schema';
import { StateService } from './state.service';
import { TimelineModule } from '../timeline/timeline.module';
import { CookEventSchema } from '../cookEvents/cook-events.schema';
import { SmokeSchema } from '../smoke/smoke.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'state', schema: stateSchema },
      // The cook log of a session that is thrown away goes with it; see
      // `StateService`'s constructor for why it is the model rather than the
      // service.
      { name: 'CookEvent', schema: CookEventSchema },
      // The session's cook, read to tell a cook being put away after it was
      // finished from one being thrown out unfinished; see `StateService`.
      { name: 'Smoke', schema: SmokeSchema },
    ]),
    // The cook's start is stamped when smoking is switched on.
    TimelineModule,
  ],
  controllers: [StateController],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
