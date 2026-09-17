import { BadRequestException } from '@nestjs/common';
import type { z } from '@ayman/contracts/zod';

/**
 * Validates REQUEST input — a query string, a param, a body — and answers a
 * 400 when it is wrong.
 *
 * ## Why this exists rather than a bare `Schema.parse(...)`
 *
 * `AllExceptionsFilter` fails closed on purpose: anything that is not an
 * `HttpException` becomes a generic 500 with no detail, because internal
 * messages routinely carry connection strings and query fragments. A `ZodError`
 * is not an `HttpException`, so a controller calling `.parse()` on something
 * the CLIENT sent turns a typo in a query string into a server error.
 *
 * That is not theoretical. `GET /api/admin/errors?perPage=40` answered
 * `500 Internal server error` — `ListQuerySchema` allows 10/20/50/100 and
 * nothing else — which is the wrong story told twice: it blames the server for
 * the caller's input, and it files an entry in the error log for something no
 * operator can fix. Nine call sites across five admin controllers had the same
 * shape.
 *
 * ⚠️ NOT a global `ZodError → 400` rule in the filter, which is the tempting
 * one-line version. Zod is also how this API reads its OWN stored data —
 * `SiteSettingsSchema.parse(row.data)` in `settings.service.ts`,
 * `HomeBlockPropsSchema.parse(row.props)` in `home-blocks.service.ts`. A row
 * that no longer matches its schema is a server-side fault, and answering 400
 * for it would tell an admin their request was malformed while the real problem
 * sat in the database. The distinction the filter cannot make — is this the
 * client's data or ours? — is exactly what the call site knows, so the call
 * site is where it belongs.
 *
 * `issues` carries the field path and the reason, matching the shape
 * `settings.service.ts` established when it hit this same wall and solved it
 * inline. Zod issue messages describe the CONTRACT (`Invalid enum value`,
 * `Number must be greater than or equal to 1`) and never echo internal state,
 * so they are safe to return; the value the client sent is deliberately not
 * included.
 */
export function parseRequest<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw new BadRequestException({
    message: `invalid ${what}`,
    issues: result.error.issues.map((issue: z.core.$ZodIssue) => ({
      path: issue.path,
      message: issue.message,
    })),
  });
}
