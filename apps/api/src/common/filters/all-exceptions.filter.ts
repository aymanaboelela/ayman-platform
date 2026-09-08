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
   * ⚠️ Absent until 2026-09-08, and its absence was a real defect rather than
   * a design choice. Around thirty services throw
   * `new ForbiddenException({ code: 'quiz_not_open_yet', openFrom })`,
   * `new ConflictException({ code: 'attempt_stale' })` and so on — and because
   * those payload objects carry no `message` key, the branch below fell
   * through to `exception.message`, which for an object payload is Nest's
   * DERIVED name. The client received `"Forbidden Exception"` and every
   * distinct refusal became the same unexplainable wall.
   *
   * The web could paper over some of it (the quiz overview endpoint reports
   * `blocked.code` inside a 200 body, which is why `/quizzes/[lessonId]` can
   * say «لسه ما فتحش»), but nothing could tell a student mid-attempt whether
   * their submit failed because the paper closed, because someone else's
   * device already submitted it, or because the server fell over.
   *
   * Only `code`, and only when it is a string. The rest of the payload stays
   * discarded on purpose — those objects also carry ids, timestamps and
   * occasionally row fragments, and this filter's whole contract is that
   * internals do not cross the wire.
   */
  code?: string;
  requestId: string;
  timestamp: string;
}

/**
 * The `code` from an HttpException payload, if it has a usable one.
 *
 * Deliberately strict: a non-string `code` is dropped rather than coerced. The
 * value is a client-side branch key, and `String(someObject)` would hand the
 * app `"[object Object]"` to switch on.
 */
function codeFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('code' in payload)) return undefined;
  const raw = (payload as { code: unknown }).code;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
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

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      code = codeFromPayload(payload);
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object' && 'message' in payload) {
        const raw = (payload as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join('، ') : String(raw);
      } else {
        message = exception.message;
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
      // Spread rather than `code: undefined`: the key stays ABSENT when there
      // is no code, so an existing consumer never starts seeing a null it did
      // not have before.
      ...(code ? { code } : {}),
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
