import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RatingsSchema } from './ratings.schema';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { StatsModule } from 'src/stats/stats.module';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Ratings', schema: RatingsSchema }]),
    SmokeModule,
    // A score changes the averages, so every write here marks the stored
    // statistics stale.
    StatsModule,
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModel {}
