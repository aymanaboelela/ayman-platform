import { z } from '@ayman/contracts/zod';

/**
 * What broke, in the three ways this product can break.
 *
 * `timeout` is split out of `server` deliberately. It is the one failure with a
 * different cause and a different fix — the API did not answer inside
 * `SERVER_TIMEOUT_MS` — and lumping it in with "a page threw" would hide the
 * single most common outage behind the vaguest label. `apps/web/lib/api.ts`
 * stamps a known digest on exactly that path so the browser can tell them apart.
 */
export const ERROR_REPORT_KINDS = ['server', 'client', 'timeout'] as const;
export type ErrorReportKind = (typeof ERROR_REPORT_KINDS)[number];

/**
 * Bounds on what a browser may post.
 *
 * This endpoint is PUBLIC and unauthenticated — it has to be, because the
 * failures worth knowing about include the ones a signed-out visitor hits on a
 * course page — so every field is capped. A stack is the only long one and is
 * still cut at 4KB: past that it is minified frames from the same three chunks,
 * and the row has to stay something an instructor can read on a phone.
 */
export const ErrorReportInputSchema = z.object({
  kind: z.enum(ERROR_REPORT_KINDS),
  /**
   * The PATHNAME, never the full URL.
   *
   * A query string on this platform can carry a password-reset token or an
   * `?assistant=1` deep link, and an error log is exactly the wrong place for
   * either to end up. The client sends `location.pathname` and this refuses
   * anything that does not look like one.
   */
  route: z.string().min(1).max(512).startsWith('/'),
  message: z.string().min(1).max(1000),
  digest: z.string().max(200).optional(),
  stack: z.string().max(4000).optional(),
});
export type ErrorReportInput = z.infer<typeof ErrorReportInputSchema>;

/** One DISTINCT failure, with how often and how recently it has happened. */
export const ErrorReportRowSchema = z.object({
  id: z.string(),
  kind: z.enum(ERROR_REPORT_KINDS),
  route: z.string(),
  message: z.string(),
  digest: z.string().nullable(),
  stack: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** Present only when the report arrived with a session. */
  userId: z.string().nullable(),
  occurrences: z.number().int().positive(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type ErrorReportRow = z.infer<typeof ErrorReportRowSchema>;

/**
 * The counts the admin page leads with.
 *
 * Computed server-side rather than derived from the returned page: the whole
 * point of the number is that it covers everything, and the list is paginated.
 */
export const ErrorReportSummarySchema = z.object({
  /** Distinct unresolved failures. */
  open: z.number().int().nonnegative(),
  /** Occurrences across unresolved failures in the last 24 hours. */
  last24h: z.number().int().nonnegative(),
});
export type ErrorReportSummary = z.infer<typeof ErrorReportSummarySchema>;

export const ErrorReportListSchema = z.object({
  rows: z.array(ErrorReportRowSchema),
  total: z.number().int().nonnegative(),
  summary: ErrorReportSummarySchema,
});
export type ErrorReportList = z.infer<typeof ErrorReportListSchema>;

/** Which slice of the log the instructor is looking at. */
export const ERROR_REPORT_FILTERS = ['open', 'resolved', 'all'] as const;
export type ErrorReportFilter = (typeof ERROR_REPORT_FILTERS)[number];
export const ErrorReportFilterSchema = z.enum(ERROR_REPORT_FILTERS).default('open');
