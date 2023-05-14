import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SerialModule } from './serial/serial.module';

@Module({
  imports: [SerialModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
