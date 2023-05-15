import { Module } from '@nestjs/common';
import { SerialService } from './serial.serivce';


@Module({
    providers: [SerialService],
})
export class SerialModule {}