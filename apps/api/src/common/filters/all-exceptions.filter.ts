import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { isPrismaDataValidationError } from '../prisma/prisma-errors';

interface ErrorBody {
  statusCode: number;
  message: string;
  requestId: string;
  timestamp: string;
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Fails closed: anything that is not an HttpException becomes a generic 500 with
 * no detail. Internal messages routinely contain connection strings and query
 * fragments, so the raw message is logged server-side and never serialised.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status: (code: number) => { json: (b: ErrorBody) => void } }>();
    const request = http.getRequest<{ url?: string; method?: string; headers?: Record<string, unknown> }>();

    const requestId =
      (typeof request?.headers?.['x-request-id'] === 'string'
        ? (request.headers['x-request-id'] as string)
        : undefined) ?? randomUUID();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object' && 'message' in payload) {
        const raw = (payload as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join('، ') : String(raw);
      } else {
        message = exception.message;
      }
    } else if (isPrismaDataValidationError(exception)) {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Not Found';
    } else {
      this.logger.error(
        `Unhandled ${request?.method ?? '?'} ${request?.url ?? '?'} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
