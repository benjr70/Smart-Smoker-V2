import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    Logger.log(`${JSON.stringify(req.method)} Request: ${JSON.stringify(req.body)}`, req.url);
    next();
  }
}
