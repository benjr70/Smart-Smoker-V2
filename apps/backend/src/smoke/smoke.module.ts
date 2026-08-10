import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmokeController } from './smoke.controller';
import { SmokeSchema } from './smoke.schema';
import { SmokeService } from './smoke.service';
import { PreSmokeModule } from 'src/presmoke/presmoke.module';
import { SmokeProfileModule } from 'src/smokeProfile/smokeProfile.module';
import { StateModule } from 'src/State/state.module';
import { TimelineModule } from 'src/timeline/timeline.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Smoke', schema: SmokeSchema }]),
    StateModule,
    // The cook's finish, and the target it was taken to, are stamped here.
    TimelineModule,
  ],
  controllers: [SmokeController],
  providers: [SmokeService],
  exports: [SmokeService],
})
export class SmokeModule {}
