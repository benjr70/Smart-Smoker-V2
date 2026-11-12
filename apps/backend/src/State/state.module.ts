import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StateController } from './state.controller';
import { stateSchema } from '../activeCook/state.schema';
import { StateService } from './state.service';
import { ActiveCookModule } from '../activeCook/active-cook.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'state', schema: stateSchema }]),
    // The toggle and clear routes are cook transitions, so they go through the
    // module that owns them. It imports no feature module itself, so this edge
    // sits in no loop — and with the clear moved there, this module no longer
    // needs the gateway at all, which is one `forwardRef` fewer.
    ActiveCookModule,
  ],
  controllers: [StateController],
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
