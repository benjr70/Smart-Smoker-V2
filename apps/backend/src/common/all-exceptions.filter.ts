import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface ResolvedError {
  statusCode: number;
  message: string | string[];
}

/**
 * Single global error → HTTP mapping table. Replaces the scattered
 * `throw` / `return null` conventions with one uniform response body:
 * `{ statusCode, error, message, path, timestamp }`.
 *
 * Mapping:
 * - `HttpException`            → its own status (passthrough)
 * - Mongo duplicate key E11000 → 409 Conflict
 * - Mongoose `CastError`       → 400 Bad Request
 * - Mongoose `ValidationError` → 400 Bad Request
 * - anything else              → 500 Internal Server Error
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const { statusCode, message } = this.resolve(exception);

    response.status(statusCode).json({
      statusCode,
      error: HttpStatus[statusCode] ?? 'Error',
      message,
      path: request?.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as Record<string, unknown>)?.message as string | string[]) ??
            exception.message;
      return { statusCode: exception.getStatus(), message };
    }

    const err = exception as { name?: string; code?: number; message?: string };

    if (err?.code === 11000) {
      return {
        statusCode: HttpStatus.CONFLICT,
        message: err.message ?? 'Duplicate key error',
      };
    }

    if (err?.name === 'CastError' || err?.name === 'ValidationError') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: err.message ?? 'Invalid request',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: err?.message ?? 'Internal server error',
    };
  }
}
