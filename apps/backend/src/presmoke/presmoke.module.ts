import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PreSmoke, PreSmokeSchema } from './presmoke.schema';
import { PreSmokeController } from './presmoke.controller';
import { PreSmokeService } from './presmoke.service';
import { StateModule } from 'src/State/state.module';
import { SmokeModule } from 'src/smoke/smoke.module';


@Module({
  imports: [MongooseModule.forFeature([{name: PreSmoke.name, schema: PreSmokeSchema}]),
    StateModule,
    forwardRef(() => SmokeModule)
  ],
  controllers: [PreSmokeController],
  providers: [PreSmokeService],
  exports: [PreSmokeService]
})
export class PreSmokeModule {}
