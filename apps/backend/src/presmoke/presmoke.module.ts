import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PreSmoke, PreSmokeSchema } from './presmoke.schema';
import { PreSmokeController } from './presmoke.controller';
import { PreSmokeService } from './presmoke.service';
import { ActiveCookModule } from 'src/activeCook/active-cook.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PreSmoke.name, schema: PreSmokeSchema },
    ]),
    // Which cook the smoker is attached to, the read of what it is of, and the
    // transition that starts one from this form. Was `StateModule` plus
    // `SmokeModule`, walked and written by hand here.
    ActiveCookModule,
    // The meat and its weight are ingredients of the statistics; writing them
    // marks the stored aggregate stale.
    StatsModule,
  ],
  controllers: [PreSmokeController],
  providers: [PreSmokeService],
  exports: [PreSmokeService],
})
export class PreSmokeModule {}
