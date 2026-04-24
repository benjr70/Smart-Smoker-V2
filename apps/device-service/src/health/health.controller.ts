import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { SerialService } from '../serial/serial.serivce';

@Controller('api')
export class HealthController {
  constructor(private readonly serialService: SerialService) {}

  @Get('health')
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'production',
    };
  }

  @Get('ready')
  ready(@Res() res: Response) {
    const env = process.env.NODE_ENV ? process.env.NODE_ENV.trim() : '';
    const emulatorMode = env === 'local';
    const serialOpen = emulatorMode
      ? true
      : Boolean(this.serialService?.port?.isOpen);

    const httpStatus = serialOpen
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({
      status: serialOpen ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        serial: emulatorMode ? 'emulator' : serialOpen ? 'up' : 'down',
      },
    });
  }
}
