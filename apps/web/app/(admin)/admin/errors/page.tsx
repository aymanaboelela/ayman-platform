import { AlertTriangle, Clock, MonitorSmartphone, ServerCrash, UserRound } from 'lucide-react';
import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import {
  ERROR_REPORT_FILTERS,
  ErrorReportFilterSchema,
  ErrorReportListSchema,
  type ErrorReportFilter,
  type ErrorReportKind,
  type ErrorReportRow,
} from '@ayman/contracts/diagnostics';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { ResolveButton } from './resolve-button';

const c = copy.admin.errors;

export const metadata = { title: c.title };

const FILTER_LABELS: Record<ErrorReportFilter, string> = {
  open: c.filterOpen,
  resolved: c.filterResolved,
  all: c.filterAll,
};

/**
 * What each kind means IN THE INSTRUCTOR'S TERMS.
 *
 * «server» and «client» are not words he should have to learn. What the label
 * has to answer is "whose problem is this and where do I look" — the server,
 * the page itself, or an upstream that simply did not answer in time.
 */
const KIND_LABELS: Record<ErrorReportKind, string> = {
  server: c.kindServer,
  client: c.kindClient,
  timeout: c.kindTimeout,
};

const KIND_ICONS: Record<ErrorReportKind, typeof ServerCrash> = {
  server: ServerCrash,
  client: MonitorSmartphone,
  timeout: Clock,
};

const stamp = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/errors` — «إيه اللي بايظ، وإيه سببه».
 *
 * ## The screen that did not exist
 *
 * Until this, a failure a student saw left one of two traces: a line in a
 * container log nobody reads until something is already known to be wrong, or —
 * for an error thrown while React was rendering in the browser — nothing at
 * all. `lib/report-error.ts` documented the gap rather than working around it,
 * and the consequence was that the instructor's only signal was a student
 * telling him, days late and without a route, a device or a count.
 *
 * ## One row per DISTINCT failure
 *
 * The grouping happens in the database, on a fingerprint, and it is what makes
 * this page openable during an incident: an API outage takes out every page
 * view in its window, so a row-per-occurrence log would answer "is anything
 * broken" by being unreadable. Each row here is a problem, and `occurrences` is
 * how many students met it.
 *
 * ## `open` by default
 *
 * Same reasoning as the assistant's inbox: the screen exists to surface what
 * still needs attention, and an everything-ever list buries that under
 * everything already dealt with.
 *
 * `adminGet` (uncached), like every other admin list — a cached admin read is
 * indistinguishable from a lost write, and this is the screen where being shown
 * a stale "nothing is wrong" would be worst.
 */
export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  // Through the schema, not `as ErrorReportFilter`: this lands in a query
  // string the API re-validates, and junk should read as the default rather
  // than as an error page — on the error page.
  const filter = ErrorReportFilterSchema.parse(raw ?? undefined);

  const { rows, summary } = await adminGet(
    `/api/admin/errors?filter=${filter}`,
    ErrorReportListSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      {/*
        Two numbers, above the list and above the filter.

        They are the answer to the only question worth asking on arrival — "is
        anything wrong right now" — and both are computed server-side across the
        WHOLE table rather than derived from this page of rows, which is the
        difference between a fact and a coincidence of pagination.
      */}
      <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:max-w-md">
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <dd className="mono tabular text-[length:var(--fs-title-2)] font-semibold text-fg">
            {summary.open}
          </dd>
          <dt className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.statOpen}</dt>
        </div>
        <div
          className={cn(
            'rounded-xl border px-4 py-3',
            summary.last24h > 0 ? 'border-accent/40 bg-accent/8' : 'border-line bg-surface-2',
          )}
        >
          <dd className="mono tabular text-[length:var(--fs-title-2)] font-semibold text-fg">
            {summary.last24h}
          </dd>
          <dt className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.statLast24h}</dt>
        </div>
      </dl>

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {ERROR_REPORT_FILTERS.map((option) => (
          <Link
            key={option}
            href={`/admin/errors?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
              'transition-colors duration-[160ms] ease-out',
              option === filter
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {FILTER_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {filter === 'resolved' ? c.emptyResolved : c.empty}
          </p>
          {filter === 'resolved' ? null : (
            <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.emptyHint}
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <ErrorRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}

function ErrorRow({ row }: { row: ErrorReportRow }) {
  const Icon = KIND_ICONS[row.kind];
  const resolved = row.resolvedAt !== null;

  return (
    <li
      className={cn(
        'rounded-xl border bg-surface-2 p-4',
        resolved ? 'border-line opacity-70' : 'border-accent/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            resolved ? 'bg-surface-3 text-fg-muted' : 'bg-accent/12 text-accent-text',
          )}
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[length:var(--fs-text-sm)] font-semibold text-fg">
              {KIND_LABELS[row.kind]}
            </span>
            {/* The count is the point of the grouping, so it is set as a
                number and not buried in a sentence. */}
            <span className="mono tabular rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              {row.occurrences} {c.occurrences}
            </span>
            {resolved ? (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.resolvedAt}
              </span>
            ) : null}
          </div>

          {/* The route, in the mono face and `dir="ltr"`: it is a path, and the
              bidi algorithm reorders one that sits in an RTL paragraph. */}
          <p
            dir="ltr"
            className="mono mt-1.5 truncate text-start text-[length:var(--fs-text-sm)] text-fg"
          >
            {row.route}
          </p>

          <p className="mt-1 line-clamp-2 text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">
            {row.message}
          </p>

          {row.kind === 'timeout' ? (
            <p className="mt-1.5 text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted">
              {c.kindTimeoutHint}
            </p>
          ) : null}

          <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            <div className="flex items-center gap-1.5">
              <dt>{c.lastSeen}:</dt>
              <dd className="tabular">{stamp.format(new Date(row.lastSeenAt))}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>{c.firstSeen}:</dt>
              <dd className="tabular">{stamp.format(new Date(row.firstSeenAt))}</dd>
            </div>
            {row.digest ? (
              <div className="flex items-center gap-1.5">
                <dt>{c.digest}:</dt>
                {/* `dir="ltr"` so nobody reads a reordered hex run down a phone
                    line to whoever is grepping the container log. */}
                <dd dir="ltr" className="mono">
                  {row.digest}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <UserRound className="size-3.5" aria-hidden="true" />
              <dt className="sr-only">{c.student}</dt>
              <dd dir={row.userId ? 'ltr' : undefined} className={row.userId ? 'mono' : undefined}>
                {row.userId ?? c.signedOut}
              </dd>
            </div>
          </dl>

          {row.userAgent ? (
            <p
              dir="ltr"
              className="mono mt-1 truncate text-start text-[length:var(--fs-text-xs)] text-fg-subtle"
            >
              {row.userAgent}
            </p>
          ) : null}

          {/*
            The stack, collapsed.

            Open by default it would make every row a screenful and the list
            unusable during exactly the incident it exists for. `<details>`
            rather than a dialog: it is read once, in place, and a modal for
            static text is furniture.
          */}
          {row.stack ? (
            <details className="mt-2.5">
              <summary className="cursor-pointer text-[length:var(--fs-text-xs)] text-accent-text">
                <AlertTriangle className="me-1 inline size-3.5" aria-hidden="true" />
                stack
              </summary>
              <pre
                dir="ltr"
                className="mono mt-1.5 max-h-64 overflow-auto rounded-lg bg-surface-3 p-3 text-start text-[length:var(--fs-text-xs)] leading-relaxed text-fg-muted"
              >
                {row.stack}
              </pre>
            </details>
          ) : null}
        </div>

        <ResolveButton id={row.id} resolved={resolved} />
      </div>
    </li>
  );
}
