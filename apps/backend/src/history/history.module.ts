import { Module } from '@nestjs/common';
import { PreSmokeModule } from 'src/presmoke/presmoke.module';
import { RatingsModel } from 'src/ratings/ratings.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { SmokeProfileModule } from 'src/smokeProfile/smokeProfile.module';

@Module({
  imports: [SmokeModule, PreSmokeModule, SmokeProfileModule, RatingsModel],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
