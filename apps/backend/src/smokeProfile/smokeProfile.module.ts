import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { SmokeProFileSchema } from './smokeProfile.schema';
import { SmokeProfileController } from './smokeProfile.controller';
import { SmokeProfileService } from './smokeProfile.service';
import { RatingsModel } from 'src/ratings/ratings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
    ]),
    CommonModule,
    RatingsModel,
  ],
  controllers: [SmokeProfileController],
  providers: [SmokeProfileService],
  exports: [SmokeProfileService],
})
export class SmokeProfileModule {}
