import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
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

  it('always includes a request id and timestamp', () => {
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(new Error('boom'), host);

    const body = json.mock.calls[0][0];
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });

  /**
   * The services throw `new BadRequestException({ code: 'quiz_has_no_slots' })`
   * and about forty more like it, and `quiz-builder.service.ts` documents the
   * convention as "every failure carries a machine-readable code so the UI can
   * point at the offending row". Until 2026-09-08 not one of them reached a
   * browser: with no `message` key the body fell to `exception.message`, which
   * Nest fills with the literal "Bad Request Exception", and every other key was
   * dropped. Screens that branched on a code — `admin/students/actions.ts:344`
   * reading `payload.blockers` — had been dead since they were written.
   */
  it('passes a machine-readable code through to the client', () => {
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(
      new BadRequestException({ code: 'exam_has_attempts', attempts: 12 }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe('exam_has_attempts');
    // Scalar hints ride along so the copy can say HOW MANY, not just that there
    // were some.
    expect(body.details).toEqual({ attempts: 12 });
  });

  it('omits code entirely when the thrower did not supply one', () => {
    // Absent, not null. A key whose value is null is itself information, and
    // every existing client parses this body with a schema that must keep
    // working unchanged.
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(new BadRequestException('حصل خطأ'), host);

    const body = json.mock.calls[0][0];
    expect('code' in body).toBe(false);
    expect('details' in body).toBe(false);
    expect(body.message).toBe('حصل خطأ');
  });

  it('never lets a non-scalar out of the payload', () => {
    // The whole payload is deliberately NOT spread. This filter's job is that
    // internal detail never leaves the process, and a nested object is exactly
    // where a query fragment or a row would hide.
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(
      new BadRequestException({
        code: 'exam_window_inverted',
        opensAt: '2026-09-11T17:00:00.000Z',
        internal: { query: 'SELECT * FROM app.quizzes', row: { id: 'x' } },
      }),
      host,
    );

    const body = json.mock.calls[0][0];
    expect(body.code).toBe('exam_window_inverted');
    expect(body.details).toEqual({ opensAt: '2026-09-11T17:00:00.000Z' });
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });
});
