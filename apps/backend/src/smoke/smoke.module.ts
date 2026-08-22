import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmokeController } from './smoke.controller';
import { SmokeSchema } from './smoke.schema';
import { SmokeService } from './smoke.service';
import { PreSmoke, PreSmokeSchema } from 'src/presmoke/presmoke.schema';
import { SmokeProFileSchema } from 'src/smokeProfile/smokeProfile.schema';
import { TempSchema } from 'src/temps/temps.schema';
import { PostSmokeSchema } from 'src/postSmoke/postSmoke.schema';
import { RatingsSchema } from 'src/ratings/ratings.schema';
import { StateModule } from 'src/State/state.module';
import { TimelineModule } from 'src/timeline/timeline.module';
import { StatsModule } from 'src/stats/stats.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Smoke', schema: SmokeSchema },
      // The children of a cook, registered here so the deep delete can remove
      // them with the smoke. Their models, not their services: every one of
      // those services depends on this module, so importing them back would
      // close a DI cycle.
      { name: PreSmoke.name, schema: PreSmokeSchema },
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
      { name: 'Temp', schema: TempSchema },
      { name: 'PostSmoke', schema: PostSmokeSchema },
      { name: 'Ratings', schema: RatingsSchema },
    ]),
    StateModule,
    // The cook's finish, and the target it was taken to, are stamped here.
    TimelineModule,
    // Finishing and deleting a cook are the two things that change what the
    // archive holds, so both recompute the stored statistics. `StatsModule`
    // owns its collections directly and imports no feature module of its own,
    // which is what lets this depend on it without closing a cycle.
    StatsModule,
  ],
  controllers: [SmokeController],
  providers: [SmokeService],
  exports: [SmokeService],
})
export class SmokeModule {}
