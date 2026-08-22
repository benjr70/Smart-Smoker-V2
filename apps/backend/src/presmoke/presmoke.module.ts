import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PreSmoke, PreSmokeSchema } from './presmoke.schema';
import { PreSmokeController } from './presmoke.controller';
import { PreSmokeService } from './presmoke.service';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PreSmoke.name, schema: PreSmokeSchema },
    ]),
    StateModule,
    SmokeModule,
    // The meat and its weight are ingredients of the statistics; writing them
    // marks the stored aggregate stale.
    StatsModule,
  ],
  controllers: [PreSmokeController],
  providers: [PreSmokeService],
  exports: [PreSmokeService],
})
export class PreSmokeModule {}
