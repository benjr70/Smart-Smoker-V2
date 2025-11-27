import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  async check() {
    // Check MongoDB connection status
    // readyState values: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const dbStatus =
      this.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Return health status with database connection info
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
}
