import { Module } from '@nestjs/common';
import { SerialService } from './serial.serivce';

@Module({
  providers: [SerialService],
  exports: [SerialService],
})
export class SerialModule {}
