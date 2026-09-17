import { ArgumentsHost } from '@nestjs/common';
import { ListQuerySchema } from '@ayman/contracts/admin/list';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { parseRequest } from './parse-request';

/**
 * These assert the STATUS THE CLIENT ACTUALLY GETS, not that the helper throws
 * something. `parseRequest` is only worth anything in combination with
 * `AllExceptionsFilter`, and the bug it fixes lived exactly in the seam between
 * them — the helper's own exception type proves nothing on its own, so every
 * case here is run through the real filter.
 */
function respond(run: () => unknown): { status: number; body: Record<string, unknown> } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/admin/errors', method: 'GET', headers: {} }),
    }),
  } as unknown as ArgumentsHost;

  try {
    run();
    throw new Error('expected the call to throw');
  } catch (error) {
    new AllExceptionsFilter().catch(error, host);
  }

  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('parseRequest', () => {
  it('returns the parsed value when the input is valid', () => {
    expect(parseRequest(ListQuerySchema, { page: '2', perPage: '50' }, 'list query')).toMatchObject({
      page: 2,
      perPage: 50,
    });
  });

  /**
   * The live defect, in one line. `GET /api/admin/errors?perPage=40` answered
   * `500 Internal server error` on production on 2026-09-04 — `perPage` is one
   * of 10/20/50/100 and 40 is not — which blamed the server for the caller's
   * query string and filed an error-log entry nobody could act on.
   */
  it('answers 400, not 500, for a query value the contract rejects', () => {
    const { status, body } = respond(() =>
      parseRequest(ListQuerySchema, { page: '1', perPage: '40' }, 'list query'),
    );

    expect(status).toBe(400);
    expect(body.message).toContain('list query');
  });

  it('answers 400 for junk that would reach Prisma as NaN', () => {
    const { status } = respond(() =>
      parseRequest(ListQuerySchema, { page: 'drop-table', perPage: '20' }, 'list query'),
    );

    expect(status).toBe(400);
  });

  /**
   * The reason the helper exists rather than a `ZodError → 400` rule inside the
   * filter: a bare `.parse()` is still a 500 there, and it MUST stay one. This
   * API also validates its own stored rows with Zod
   * (`SiteSettingsSchema.parse(row.data)`), and a corrupted row is a server
   * fault — answering 400 for it would tell an admin their request was
   * malformed while the real problem sat in the database.
   */
  it('leaves a raw ZodError as a 500 — the filter still fails closed', () => {
    const { status, body } = respond(() => ListQuerySchema.parse({ perPage: '40' }));

    expect(status).toBe(500);
    expect(body.message).toBe('Internal server error');
  });
});
