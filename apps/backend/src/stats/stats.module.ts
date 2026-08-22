import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PostSmokeSchema } from '../postSmoke/postSmoke.schema';
import { PreSmoke, PreSmokeSchema } from '../presmoke/presmoke.schema';
import { RatingsSchema } from '../ratings/ratings.schema';
import { SmokeSchema } from '../smoke/smoke.schema';
import { SmokeProFileSchema } from '../smokeProfile/smokeProfile.schema';
import { TimelineModule } from '../timeline/timeline.module';
import { StatsController } from './stats.controller';
import { StatsSnapshot, StatsSnapshotSchema } from './stats.schema';
import { StatsService } from './stats.service';

/**
 * The statistics of the whole archive.
 *
 * Owns the five collections of a session directly rather than importing the
 * feature modules that wrap them: every one of those services reads a single
 * document by id, and this module reads all of them at once. Importing them
 * would also pull their controllers' dependency chains in behind the read for
 * no gain — `TimelineModule` is imported because how long a cook ran is derived
 * there and nowhere else.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Smoke', schema: SmokeSchema },
      { name: PreSmoke.name, schema: PreSmokeSchema },
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
      { name: 'PostSmoke', schema: PostSmokeSchema },
      { name: 'Ratings', schema: RatingsSchema },
      // The statistics themselves, stored: the read serves this document and
      // recomputes the archive only when it says it has gone stale.
      { name: StatsSnapshot.name, schema: StatsSnapshotSchema },
    ]),
    TimelineModule,
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
