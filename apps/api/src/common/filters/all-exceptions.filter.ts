import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { isPrismaDataValidationError, isPrismaRecordNotFound } from '../prisma/prisma-errors';

interface ErrorBody {
  statusCode: number;
  message: string;
  /**
   * The machine-readable reason, when the thrower supplied one.
   *
   * ⚠️ This existed nowhere until 2026-09-08, and its absence was silent. The
   * services throw `new BadRequestException({ code: 'exam_has_attempts', … })`,
   * `{ code: 'quiz_not_open_yet', … }`, `{ code: 'quiz_has_no_slots' }` and
   * about forty more — a whole convention, documented in
   * `quiz-builder.service.ts` as "every failure carries a machine-readable code
   * so the UI can point at the offending row". None of them ever reached a
   * browser: an exception built from an object with no `message` key falls to
   * `exception.message`, which Nest fills with the literal string "Bad Request
   * Exception", and this body dropped everything else on the floor.
   *
   * So every screen that tried to branch on a code has been rendering a generic
   * failure instead. `admin/students/actions.ts:344` reads `payload.blockers`
   * off a `ConflictException({ message, blockers })` and has never once seen
   * it; the monthly-exams screens were about to inherit the same dead branch.
   *
   * Only whitelisted scalars cross: `code` and the small set of scalar hints
   * beside it. The whole payload is NOT spread — this filter's job is that
   * internal detail (connection strings, query fragments) never leaves the
   * process, and a blanket spread would undo exactly that.
   */
  code?: string;
  /** Scalar hints a caller can render, e.g. `attempts` on `exam_has_attempts`.
   *  Scalars only. */
  details?: Record<string, string | number | boolean>;
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
    let code: string | undefined;
    let details: Record<string, string | number | boolean> | undefined;

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

      // Whitelisted, never spread — see `ErrorBody.code`. A thrower opts a
      // value in by naming it `code`, or by putting scalars under `details`;
      // anything else stays inside the process.
      if (payload && typeof payload === 'object') {
        const bag = payload as Record<string, unknown>;
        if (typeof bag.code === 'string') code = bag.code;
        const scalars = Object.entries(bag).filter(
          ([key, value]) =>
            key !== 'code' &&
            key !== 'message' &&
            key !== 'statusCode' &&
            key !== 'error' &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
        );
        if (scalars.length > 0) {
          details = Object.fromEntries(scalars) as Record<string, string | number | boolean>;
        }
      }
    } else if (isPrismaDataValidationError(exception) || isPrismaRecordNotFound(exception)) {
      // A malformed id and an id that simply matches nothing are the same
      // answer to the client — see both predicates in `prisma-errors.ts`.
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
      // Omitted rather than sent as null when absent: a key whose value is null
      // is itself information, and every existing client reads this body with a
      // schema that must keep parsing unchanged.
      ...(code === undefined ? {} : { code }),
      ...(details === undefined ? {} : { details }),
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
