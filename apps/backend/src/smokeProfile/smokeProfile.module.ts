import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { SmokeProFileSchema } from './smokeProfile.schema';
import { SmokeProfileController } from './smokeProfile.controller';
import { SmokeProfileService } from './smokeProfile.service';


@Module({
  imports: [MongooseModule.forFeature([{name: 'SmokeProfile', schema: SmokeProFileSchema}]),
    StateModule,
    SmokeModule
  ],
  controllers: [SmokeProfileController],
  providers: [SmokeProfileService],
  exports: [SmokeProfileService]
})
export class SmokeProfileModule {}
