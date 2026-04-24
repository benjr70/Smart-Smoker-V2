import { Module } from '@nestjs/common';
import { SerialModule } from '../serial/serial.module';
import { HealthController } from './health.controller';

@Module({
  imports: [SerialModule],
  controllers: [HealthController],
})
export class HealthModule {}
