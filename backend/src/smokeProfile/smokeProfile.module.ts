import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';
import { SmokeProfile, SmokeProFileSchema } from './smokeProfile.schema';
import { SmokeProfileController } from './smokeProfile.controller';
import { SmokeProfileService } from './smokeProfile.service';


@Module({
  imports: [MongooseModule.forFeature([{name: 'SmokeProfile', schema: SmokeProFileSchema}]), StateModule, SmokeModule],
  controllers: [SmokeProfileController],
  providers: [SmokeProfileService],
})
export class SmokeProfileModule {}
