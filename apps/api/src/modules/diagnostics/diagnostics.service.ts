import { createHash } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  ErrorReportFilter,
  ErrorReportInput,
  ErrorReportList,
  ErrorReportRow,
} from '@ayman/contracts/diagnostics';
import {
  CONNECTIVITY_ERROR_MESSAGES,
  UNEXPECTED_SERVER_RESPONSE_MESSAGE,
  isConnectivityErrorMessage,
  isOmittedServerErrorMessage,
  isUnexpectedServerResponseMessage,
} from '@ayman/contracts/error-classify';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * How long a run of the same failure counts as one incident on the summary.
 */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The stable identity of a failure.
 *
 * The DIGEST when Next supplied one: it already hashes the message and the
 * stack of a Server Component throw, so two reports carrying the same digest
 * are the same fault by construction, and it is also the string that appears in
 * the container log — which is what makes a row here answerable.
 *
 * ⚠️ The route is folded in ANYWAY, and deliberately. `apps/web/lib/api.ts`
 * stamps one fixed digest on every upstream timeout, so grouping on the digest
 * alone would collapse "the dashboard timed out" and "the player timed out"
 * into a single row — which is precisely the distinction the instructor needs
 * in order to know what to look at.
 *
 * Without a digest — every client-side render error — route and message are the
 * best grouping available. Not the stack: it is minified, and its frame offsets
 * shift between builds, so including it would make every deploy look like a new
 * fault.
 */
function fingerprintOf(input: ErrorReportInput): string {
  const basis = input.digest
    ? `${input.kind} ${input.route} ${input.digest}`
    : `${input.kind} ${input.route} ${input.message}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function toRow(record: {
  id: bigint;
  kind: string;
  route: string;
  message: string;
  digest: string | null;
  stack: string | null;
  userAgent: string | null;
  userId: string | null;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}): ErrorReportRow {
  return {
    // `BigInt` does not survive `JSON.stringify` — it throws rather than
    // serialising — so the id crosses as a string, exactly as the audit reader
    // does it.
    id: record.id.toString(),
    kind: record.kind as ErrorReportRow['kind'],
    route: record.route,
    message: record.message,
    digest: record.digest,
    stack: record.stack,
    userAgent: record.userAgent,
    userId: record.userId,
    occurrences: record.occurrences,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class DiagnosticsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * On startup, automatically mark all legacy stale-deploy chunk errors, missing
   * Server Actions, and client network drops as resolved so that historical
   * deploy noise does not clutter `/admin/errors`.
   */
  async onModuleInit(): Promise<void> {
    await this.prisma.errorReport.updateMany({
      where: {
        resolvedAt: null,
        OR: [
          { message: { contains: 'Failed to load chunk' } },
          { message: { contains: 'Loading chunk' } },
          { message: { contains: 'ChunkLoadError' } },
          { message: { contains: 'Server Action' } },
          { message: { contains: 'Failed to fetch' } },
          { message: { contains: 'Load failed' } },
          { stack: { contains: 'at module evaluation' } },
          // The rest of the connectivity sentences, matched EXACTLY — see
          // `@ayman/contracts/error-classify` for why a substring would also
          // close somebody's real message — and a Server Action answered by
          // the edge rather than by the app (the deploy window).
          { message: { in: [...CONNECTIVITY_ERROR_MESSAGES] } },
          { message: UNEXPECTED_SERVER_RESPONSE_MESSAGE },
        ],
      },
      data: {
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Record one failure, collapsing it into an existing row when it is the same
   * fault.
   *
   * ## ⚠️ A REPEAT RE-OPENS A RESOLVED ROW
   *
   * `resolvedAt` is cleared on every fresh occurrence. A fault the instructor
   * marked handled and which then happened again is not handled, and leaving it
   * ticked while its counter climbed would be the one way this table could lie.
   * The `firstSeenAt` is left alone, so the row still says when it started
   * rather than when it came back — that difference is usually the diagnosis.
   *
   * `upsert` on the unique fingerprint rather than find-then-write: two students
   * hitting the same outage in the same second is the NORMAL case here, not a
   * race worth losing a report to.
   */
  async record(
    input: ErrorReportInput,
    context: { userId: string | null; userAgent: string | null },
  ): Promise<void> {
    const message = input.message || '';

    // Guard: ignore stale deployment artifacts (stale chunks, missing actions,
    // an action answered by the edge mid-deploy) and the student's own
    // connection dropping. The browser stops filing these itself, but a tab
    // from an older build still posts them, and this is the check it meets.
    if (
      message.includes('Failed to load chunk') ||
      message.includes('could not find the module with ID') ||
      message.includes('at module evaluation') ||
      (message.includes('Server Action') && message.includes('was not found')) ||
      isUnexpectedServerResponseMessage(message) ||
      isConnectivityErrorMessage(message)
    ) {
      return;
    }

    const fingerprint = fingerprintOf(input);
    const now = new Date();

    /*
     * ⚠️ A report that only knows Next's production sentence must not
     * overwrite one that knows the real message.
     *
     * The server files a Server Component failure itself now
     * (`apps/web/instrumentation.ts`) with the message and stack Next keeps on
     * the server, under the same fingerprint the browser used. The browser's
     * copy of that failure — still sent by any tab older than this change —
     * carries only «…The specific message is omitted in production builds…»
     * and a stack that points at nothing. "Most recent wins" below would let
     * that copy erase the one line on the row that says what broke.
     *
     * So the generic sentence never replaces anything; any real one does,
     * which also upgrades a row an older browser created first.
     */
    const omitted = isOmittedServerErrorMessage(input.message);

    await this.prisma.errorReport.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        kind: input.kind,
        route: input.route,
        message: input.message,
        digest: input.digest ?? null,
        stack: input.stack ?? null,
        userAgent: context.userAgent,
        userId: context.userId,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        occurrences: { increment: 1 },
        lastSeenAt: now,
        resolvedAt: null,
        // The MOST RECENT stack and agent win. An older one is not more
        // truthful, and the newest is the one that matches whatever the
        // instructor is about to go and look at — except from a report that
        // knows nothing (see `omitted` above).
        message: omitted ? undefined : input.message,
        stack: omitted ? undefined : (input.stack ?? undefined),
        userAgent: context.userAgent ?? undefined,
      },
    });
  }

  async list(
    filter: ErrorReportFilter,
    page: number,
    perPage: number,
  ): Promise<ErrorReportList> {
    const where =
      filter === 'open'
        ? { resolvedAt: null }
        : filter === 'resolved'
          ? { resolvedAt: { not: null } }
          : {};

    const [rows, total, open, recent] = await this.prisma.$transaction([
      this.prisma.errorReport.findMany({
        where,
        // Most recently SEEN first, not most occurrences: the question this
        // page answers is "is anything broken right now".
        /* `id` after the timestamp: during an outage the same fault is re-seen
           many times a second, so ties here are the normal case exactly when
           the screen matters most. */
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.errorReport.count({ where }),
      this.prisma.errorReport.count({ where: { resolvedAt: null } }),
      /*
       * ⚠️ COUNT of faults, not a SUM of their occurrences.
       *
       * This was `_sum: { occurrences: true }`, which reads as "how many times
       * did something break today" and is not that number. `occurrences` is the
       * ALL-TIME counter on the row — it starts at 1 and only ever increments,
       * and `record()` never resets it — so a fault that happened 400 times last
       * month and once yesterday contributed 400 to a figure labelled «مرة في
       * آخر ٢٤ ساعة». The `lastSeenAt` filter is right and was never the
       * problem: it selects the correct ROWS, and then the wrong number was
       * taken off each one.
       *
       * There is no per-window count to sum instead — the table stores one row
       * per distinct fault with a running total, which is exactly the shape that
       * makes this page survive an outage (see the page's own doc). So the
       * honest figure it CAN answer is how many distinct faults have been seen
       * in the window, which is also the one that matches what the pair of
       * stats is for: «open» is the backlog, this is what is live right now.
       * The label moves with it.
       */
      this.prisma.errorReport.count({
        where: { resolvedAt: null, lastSeenAt: { gte: new Date(Date.now() - RECENT_WINDOW_MS) } },
      }),
    ]);

    return {
      rows: rows.map(toRow),
      total,
      summary: { open, last24h: recent },
    };
  }

  /** Mark handled, or put it back. */
  async setResolved(id: string, resolved: boolean): Promise<void> {
    await this.prisma.errorReport.update({
      where: { id: BigInt(id) },
      data: { resolvedAt: resolved ? new Date() : null },
    });
  }

  /** Mark all currently open faults handled. */
  async resolveAll(): Promise<void> {
    await this.prisma.errorReport.updateMany({
      where: { resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }
}
