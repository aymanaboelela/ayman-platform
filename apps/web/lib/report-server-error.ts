import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ErrorReportInput } from '@ayman/contracts/diagnostics';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';
import { CLIENT_IP_HEADER } from './client-ip';

/**
 * A Server Component that throws, filed on `/admin/errors` WITH its message.
 *
 * ## What the log could not say before
 *
 * Every server row on `/admin/errors` read the same: Next's production sentence
 * «An error occurred in the Server Components render. The specific message is
 * omitted…», a digest, and nothing else. That was all the BROWSER was ever
 * given, and the browser was the only thing filing. The digest was meant to be
 * looked up in the container log — and by the time anyone looked (an exam's
 * worth of failures on `/quizzes/<id>`, a welcome screen, a lesson) those logs
 * had rotated away. A row nobody can explain is a row nobody can fix.
 *
 * Next hands every server-side failure to `instrumentation.ts`'s
 * `onRequestError` while the real error object still exists — message, stack,
 * cause — together with the route it came from. That is the whole fix: file it
 * from there.
 *
 * ## The same row as the browser's
 *
 * The API groups on `kind + route + digest` (`DiagnosticsService`), and this
 * sends exactly what `report-error.ts` used to send for the same failure: kind
 * `server` (`timeout` for the digest `lib/api.ts` stamps on an API that did not
 * answer), the PATHNAME, and Next's digest — the one the error screen shows the
 * student as «كود العطل». So a row that already exists from an older tab's
 * report, and the row this creates, are one row, and a student who reads the
 * code out to المساعد is reading the key it is filed under. The browser no
 * longer files digest errors at all; see `report-error.ts` for why that avoids
 * counting every failure twice.
 *
 * ## Nothing here may throw, slow the response, or recurse
 *
 * `onRequestError` is awaited by Next inside the failing request, so the post
 * is fire-and-forget: started, never awaited, every failure swallowed, and cut
 * off after `REPORT_TIMEOUT_MS`. It goes through `node:http` rather than
 * `fetch` on purpose — inside a render `fetch` is Next's patched one, with its
 * own opinions about caching and dynamic scopes, and a reporter is the last
 * thing that should acquire either. It talks to the API directly, never to this
 * app, so a broken page cannot report itself into another broken page.
 */

/** Same origin `lib/api.ts` uses on the server. */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';

const REPORT_TIMEOUT_MS = 3_000;

/**
 * At most this many reports per minute per process. A real outage — the API
 * down, every render failing — would otherwise fire one POST per page view at
 * the API that is already not coping. The API folds repeats into one row
 * anyway; the counter on that row just stops climbing for the rest of the
 * minute, which is a fair price for not adding load to an incident.
 */
export const REPORTS_PER_MINUTE = 120;

/** What Next hands `onRequestError` — the subset this reads. */
export interface ServerErrorRequest {
  path: string;
  method: string;
  headers: NodeJS.Dict<string | string[]>;
}

export interface ServerErrorContext {
  routePath: string;
  routeType: string;
  renderSource?: string;
}

/**
 * Next's control-flow throws — `redirect()`, `notFound()`, a bailout — carry
 * these digest prefixes. Next does not pass them to `onRequestError` from a
 * render (`getDigestForWellKnownError`), but a route handler is a different
 * path, and a redirect filed as a fault would be noise forever.
 */
const CONTROL_FLOW_DIGESTS = [
  'NEXT_REDIRECT',
  'NEXT_HTTP_ERROR_FALLBACK',
  'NEXT_NOT_FOUND',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  'DYNAMIC_SERVER_USAGE',
  'NEXT_PRERENDER_INTERRUPTED',
];

function header(headers: NodeJS.Dict<string | string[]>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** The pathname only — never the query, which can carry a reset token. */
function pathnameOf(path: string): string | null {
  try {
    const pathname = new URL(path, 'http://internal.invalid').pathname;
    return pathname.startsWith('/') ? pathname.slice(0, 512) : null;
  } catch {
    return null;
  }
}

/**
 * The report for one failure, or `null` when it is not one to file. Pure, so
 * every rule above is a unit test rather than a production observation.
 */
export function buildServerErrorReport(
  thrown: unknown,
  request: ServerErrorRequest,
  context: ServerErrorContext,
): ErrorReportInput | null {
  const error =
    thrown instanceof Error
      ? (thrown as Error & { digest?: unknown; cause?: unknown })
      : new Error(typeof thrown === 'string' ? thrown : 'A non-Error value was thrown');

  const digest = typeof (error as { digest?: unknown }).digest === 'string'
    ? ((error as { digest?: string }).digest as string)
    : undefined;
  if (digest && CONTROL_FLOW_DIGESTS.some((prefix) => digest.startsWith(prefix))) return null;
  // The visitor closed the tab mid-render. Next already treats this as
  // nothing (`isAbortError`); so does the log.
  if (error.name === 'AbortError' || error.name === 'ResponseAborted') return null;

  const route = pathnameOf(request.path);
  if (!route) return null;

  /*
   * The stack leads with WHERE in Next it happened — `render /quizzes/[lessonId]
   * · react-server-components · GET` — because the pathname says which page
   * and this says which file, which is the first thing anyone opening the row
   * needs. Then the cause chain: undici puts the useful half of «fetch failed»
   * (ECONNREFUSED, a socket reset) on `cause`, never on the message.
   */
  const where = [context.routeType, context.routePath, context.renderSource, request.method]
    .filter(Boolean)
    .join(' · ');
  const cause = (error as { cause?: unknown }).cause;
  const causeLine =
    cause instanceof Error
      ? `\nCaused by: ${[(cause as { code?: unknown }).code, cause.message].filter(Boolean).join(' ')}`
      : '';

  return {
    kind: digest === UPSTREAM_TIMEOUT_DIGEST ? 'timeout' : 'server',
    route,
    message: (error.message || error.name || 'Error').slice(0, 1000),
    digest: digest?.slice(0, 200),
    stack: `[${where}]\n${error.stack ?? ''}${causeLine}`.slice(0, 4000),
  };
}

let windowStartedAt = 0;
let sentInWindow = 0;

function underTheCeiling(now: number): boolean {
  if (now - windowStartedAt >= 60_000) {
    windowStartedAt = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= REPORTS_PER_MINUTE) return false;
  sentInWindow += 1;
  return true;
}

/** For tests. */
export function resetServerReportCeiling(): void {
  windowStartedAt = 0;
  sentInWindow = 0;
}

export interface Transport {
  (url: URL, headers: Record<string, string>, body: string): void;
}

/**
 * The real transport: one POST, unawaited, bounded, every failure swallowed.
 */
const postOverHttp: Transport = (url, headers, body) => {
  try {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const outgoing = send(url, {
      method: 'POST',
      headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
      timeout: REPORT_TIMEOUT_MS,
    });
    outgoing.on('timeout', () => outgoing.destroy());
    outgoing.on('error', () => {
      // The API is unreachable — often the very fault being reported.
    });
    outgoing.on('response', (response) => response.resume());
    outgoing.end(body);
  } catch {
    // A malformed API_ORIGIN, or a socket that could not even be opened.
  }
};

/**
 * Files one server-side failure. Returns as soon as the request has been
 * STARTED — see the header for why nothing here is awaited.
 */
export function reportServerError(
  thrown: unknown,
  request: ServerErrorRequest,
  context: ServerErrorContext,
  transport: Transport = postOverHttp,
): void {
  // `next build` prerenders with no API reachable; there is nobody to tell.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const report = buildServerErrorReport(thrown, request, context);
  if (!report || !underTheCeiling(Date.now())) return;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  /*
   * The visitor's own headers, the three the API reads off a report: the
   * session cookie (WHO hit it — `OptionalSessionService`), the user agent
   * (which device), and Cloudflare's client address, so this report draws on
   * that visitor's throttle bucket and not on one shared by every page this
   * server renders (`lib/client-ip.ts` has that story).
   */
  const cookie = header(request.headers, 'cookie');
  if (cookie) headers.cookie = cookie;
  const userAgent = header(request.headers, 'user-agent');
  if (userAgent) headers['user-agent'] = userAgent.slice(0, 400);
  const clientIp = header(request.headers, CLIENT_IP_HEADER)?.trim();
  if (clientIp) headers[CLIENT_IP_HEADER] = clientIp;

  let url: URL;
  try {
    url = new URL('/api/errors', API_ORIGIN);
  } catch {
    return;
  }
  transport(url, headers, JSON.stringify(report));
}
