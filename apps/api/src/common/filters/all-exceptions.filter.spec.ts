import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/thing', method: 'GET', headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  it('passes through the status and message of an HttpException', () => {
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(new HttpException('مش موجود', HttpStatus.NOT_FOUND), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: 'مش موجود' });
  });

  it('never leaks an internal error message or stack to the client', () => {
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(new Error('connection string postgres://user:hunter2@db'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body).not.toHaveProperty('stack');
  });

  it('maps a Prisma P2007 (malformed uuid path param) to a 404, not a raw 500', () => {
    const { host, json, status } = makeHost();
    const prismaError = Object.assign(new Error('invalid input syntax for type uuid: "not-a-lesson"'), {
      code: 'P2007',
    });
    new AllExceptionsFilter().catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Not Found');
    expect(JSON.stringify(body)).not.toContain('not-a-lesson');
  });

  it('maps a Prisma P2025 (well-formed id, no such row) to a 404, not a raw 500', () => {
    // The other half of the P2007 case above: "doesn't parse as an id" and
    // "parses fine but doesn't exist" are the same answer to the client, and
    // only the first was mapped. Seventeen services reach for `findUniqueOrThrow`
    // and none catch it, so an admin opening a quiz that had been deleted read
    // «حصل خطأ» — indistinguishable from the API being down. Measured on the
    // deployed API 2026-08-16: GET /api/admin/quizzes/:id answered 500 for a
    // well-formed UUID with no row.
    const { host, json, status } = makeHost();
    const prismaError = Object.assign(
      new Error('An operation failed because it depends on one or more records that were required but not found'),
      { code: 'P2025' },
    );
    new AllExceptionsFilter().catch(prismaError, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0].message).toBe('Not Found');
  });

  it('still fails closed on a Prisma code it does not recognise', () => {
    // The mapping above is an allowlist of two codes, not "any Prisma error is
    // a 404" — a unique-constraint violation is a fault and must stay a 500.
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(
      Object.assign(new Error('Unique constraint failed on the fields: (`slug`)'), { code: 'P2002' }),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).toBe('Internal server error');
  });

  /**
   * Around thirty services throw `{ code: '…' }` payloads. Until 2026-09-08 the
   * filter discarded them and answered `"Forbidden Exception"`, so every
   * distinct refusal reached the client as the same unexplainable wall.
   */
  describe('the machine-readable code', () => {
    it('surfaces a code the thrower supplied', () => {
      const { host, json, status } = makeHost();
      new AllExceptionsFilter().catch(
        new HttpException({ code: 'quiz_not_open_yet' }, HttpStatus.FORBIDDEN),
        host,
      );

      expect(status).toHaveBeenCalledWith(403);
      expect(json.mock.calls[0][0].code).toBe('quiz_not_open_yet');
    });

    it('keeps the message when the payload carries both', () => {
      // `attempt.service.ts` throws `{ code: 'attempt_overdue', message: … }`.
      // The two fields answer different questions and neither replaces the other.
      const { host, json } = makeHost();
      new AllExceptionsFilter().catch(
        new HttpException(
          { code: 'attempt_overdue', message: 'attempt is overdue' },
          HttpStatus.CONFLICT,
        ),
        host,
      );

      expect(json.mock.calls[0][0]).toMatchObject({
        statusCode: 409,
        code: 'attempt_overdue',
        message: 'attempt is overdue',
      });
    });

    it('OMITS the key entirely when there is no code', () => {
      // Absent, not null: an existing consumer must not start seeing a field it
      // never had.
      const { host, json } = makeHost();
      new AllExceptionsFilter().catch(new HttpException('مش موجود', HttpStatus.NOT_FOUND), host);

      expect('code' in json.mock.calls[0][0]).toBe(false);
    });

    it('drops a non-string code rather than coercing it', () => {
      // The value is a client-side branch key. `String({})` would hand the app
      // `"[object Object]"` to switch on.
      const { host, json } = makeHost();
      new AllExceptionsFilter().catch(
        new HttpException({ code: { nested: true } }, HttpStatus.BAD_REQUEST),
        host,
      );

      expect('code' in json.mock.calls[0][0]).toBe(false);
    });

    it('does not leak the rest of the payload alongside it', () => {
      // `quiz-access.service.ts` throws `{ code, openFrom }` and
      // `quiz-builder.service.ts` throws `{ code, slotId }`. Only the code is
      // contracted; everything else stays internal.
      const { host, json } = makeHost();
      new AllExceptionsFilter().catch(
        new HttpException(
          { code: 'slot_has_no_ready_version', slotId: 'internal-uuid' },
          HttpStatus.BAD_REQUEST,
        ),
        host,
      );

      const body = json.mock.calls[0][0];
      expect(body.code).toBe('slot_has_no_ready_version');
      expect(JSON.stringify(body)).not.toContain('internal-uuid');
    });

    it('never invents a code for an unhandled error', () => {
      const { host, json } = makeHost();
      new AllExceptionsFilter().catch(new Error('connection string leaked here'), host);

      expect('code' in json.mock.calls[0][0]).toBe(false);
    });
  });

  it('always includes a request id and timestamp', () => {
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(new Error('boom'), host);

    const body = json.mock.calls[0][0];
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});
