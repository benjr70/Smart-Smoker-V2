import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Response } from 'express';
import { Connection } from 'mongoose';

@Controller('api')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get('health')
  check() {
    const dbStatus =
      this.connection.readyState === 1 ? 'connected' : 'disconnected';

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        name: this.connection.name,
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'production',
    };
  }

  @Get('ready')
  ready(@Res() res: Response) {
    const dbConnected = this.connection.readyState === 1;
    const httpStatus = dbConnected
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({
      status: dbConnected ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbConnected ? 'up' : 'down',
      },
    });
  }
}
