import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { SmokeProFileSchema } from './smokeProfile.schema';
import { SmokeProfileController } from './smokeProfile.controller';
import { SmokeProfileService } from './smokeProfile.service';
import { RatingsModel } from 'src/ratings/ratings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'SmokeProfile', schema: SmokeProFileSchema },
    ]),
    StateModule,
    SmokeModule,
    RatingsModel,
  ],
  controllers: [SmokeProfileController],
  providers: [SmokeProfileService],
  exports: [SmokeProfileService],
})
export class SmokeProfileModule {}
