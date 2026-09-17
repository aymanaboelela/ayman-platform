import Link from 'next/link';
import { BookOpen, CircleHelp, GraduationCap, Clock, UserRound } from 'lucide-react';
import { z } from 'zod';
import { listResponse } from '@ayman/contracts/admin/list';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  FOLLOW_UP_WINDOW_DEFAULT,
  FOLLOW_UP_WINDOW_MAX,
  OUTREACH_SEND_ALL_MAX,
  FollowUpRowSchema,
  IdleRowSchema,
  IdleReasonSchema,
  type FollowUpRow,
  type IdleRow,
} from '@ayman/contracts/outreach/follow-up';
import { Badge } from '@ayman/ui/components/badge';
import { cn } from '@ayman/ui/lib/cn';
import { ListControl, ListPager } from '@/components/admin/list-controls';
import { adminGet } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { SendAllButton, SendRowButton } from './send-buttons';

const c = copy.admin.followUp;
const StalledSchema = listResponse(FollowUpRowSchema);
const IdleSchema = listResponse(IdleRowSchema);
/** Only what the course filter renders — a narrow schema, same rule as
 *  `/admin/homework`'s picker. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

/** One of `PAGE_SIZES` — `ListQuerySchema` refuses anything else with a 400,
 *  and a page that asks for 25 renders «حصل خطأ» rather than a list. */
const PER_PAGE = 20;

export const metadata = { title: c.title };

/**
 * `/admin/follow-up` — «مين وقف، ومين دخل ومشترَكش».
 *
 * ## Two tabs and not two routes
 *
 * See `@ayman/contracts/outreach/follow-up`'s header for the argument. The
 * short version: it is the same morning's work — read a row, open the record,
 * send one message — at two points in a student's life, and splitting it means
 * two places to look before that work is done.
 *
 * ## The URL is the whole state
 *
 * Tab, filters and page all live in the query string, so the back button walks
 * them and a filtered list can be pasted to somebody else. Nothing here is
 * client state: the selection is expressed in SQL (`FollowUpService`) because
 * filtering an already-fetched page in the browser gives page one of the wrong
 * answer.
 *
 * `adminGet`, never a `'use cache'` loader — a cached row here would show a
 * student as still behind minutes after they caught up, on the one screen
 * whose output is a message in the instructor's name.
 */
export default async function AdminFollowUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = one(params.tab) === 'idle' ? 'idle' : 'stalled';
  const page = Math.max(1, Number.parseInt(one(params.page) ?? '1', 10) || 1);
  const courseId = one(params.courseId) ?? '';
  const year = one(params.year) ?? '';
  const reason = IdleReasonSchema.safeParse(one(params.reason)).data ?? '';
  // Through the schema, not `Number(...)`: this lands in a `row_number() <= n`
  // and an unbounded value from the URL bar is a free full-outline scan.
  const window =
    z.coerce
      .number()
      .int()
      .min(1)
      .max(FOLLOW_UP_WINDOW_MAX)
      .safeParse(one(params.window)).data ?? FOLLOW_UP_WINDOW_DEFAULT;

  const maySend = can(await getSession(), 'conversation:reply');

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('perPage', String(PER_PAGE));
  if (year) query.set('year', year);

  const stalledQuery = { courseId: courseId || undefined, year: year ? Number(year) : undefined, window };
  const idleQuery = { year: year ? Number(year) : undefined, reason: reason || undefined };

  if (tab === 'stalled') {
    query.set('window', String(window));
    if (courseId) query.set('courseId', courseId);
  } else if (reason) {
    query.set('reason', reason);
  }

  /*
   * The course list feeds the filter only, and it is fetched on both tabs so
   * that switching to «وقفوا» does not pay for a second round trip. It is the
   * same `/api/admin/courses` eight other admin screens already read.
   */
  const [list, courses] = await Promise.all([
    tab === 'stalled'
      ? adminGet(`/api/admin/follow-up?${query}`, StalledSchema)
      : adminGet(`/api/admin/follow-up/idle?${query}`, IdleSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
          {c.eyebrow}
        </p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5">
        <Tab href="/admin/follow-up" current={tab === 'stalled'} label={c.tabStalled} />
        <Tab href="/admin/follow-up?tab=idle" current={tab === 'idle'} label={c.tabIdle} />
      </nav>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        {tab === 'stalled' ? (
          <>
            <ListControl
              name="courseId"
              label={c.filterCourse}
              value={courseId}
              options={[
                { value: '', label: c.filterCourseAll },
                ...courses.map((course) => ({ value: course.id, label: course.title })),
              ]}
            />
            <ListControl
              name="window"
              label={c.filterWindow}
              value={String(window)}
              options={Array.from({ length: FOLLOW_UP_WINDOW_MAX }, (_, index) => ({
                value: String(index + 1),
                // The map, with the numeral as the fallback — see
                // `filterWindowOptions` for why Arabic cannot template this.
                label: c.filterWindowOptions[index + 1] ?? String(index + 1),
              }))}
            />
          </>
        ) : (
          <ListControl
            name="reason"
            label={c.filterReason}
            value={reason}
            options={[
              { value: '', label: c.filterReasonAll },
              { value: 'never', label: c.reasonNever },
              { value: 'elsewhere', label: c.reasonElsewhere },
            ]}
          />
        )}

        <ListControl
          name="year"
          label={c.filterYear}
          value={year}
          options={[
            { value: '', label: c.filterYearAll },
            { value: '1', label: '١' },
            { value: '2', label: '٢' },
            { value: '3', label: '٣' },
          ]}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(tab === 'stalled' ? c.countStalled : c.countIdle, { n: list.rowCount })}
        </p>
        {/* Rendered only for a session that may actually write in his name —
            the API re-checks `conversation:reply` regardless, and a button that
            always 403s is worse than no button. */}
        {maySend ? (
          <SendAllButton
            count={list.rowCount}
            max={OUTREACH_SEND_ALL_MAX}
            query={
              tab === 'stalled'
                ? { kind: 'follow-up', value: stalledQuery }
                : { kind: 'subscribe', value: idleQuery }
            }
          />
        ) : null}
      </div>

      {list.rowCount === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {tab === 'stalled' ? c.emptyStalled : c.emptyIdle}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tab === 'stalled'
            ? (list.rows as FollowUpRow[]).map((row) => (
                <StalledCard
                  key={`${row.userId}:${row.courseId}`}
                  row={row}
                  window={window}
                  maySend={maySend}
                />
              ))
            : (list.rows as IdleRow[]).map((row) => (
                <IdleCard key={row.userId} row={row} maySend={maySend} />
              ))}
        </ul>
      )}

      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={list.rowCount}
        labels={{
          previous: copy.admin.books.pagerPrevious,
          next: copy.admin.books.pagerNext,
          of: copy.admin.books.pagerOf,
        }}
      />
    </>
  );
}

function Tab({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
        'transition-colors duration-[160ms] ease-out',
        current
          ? 'border-accent bg-accent text-[#1A1206]'
          : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}

/**
 * One student who stopped, in one card.
 *
 * ## Why the titles are printed and not only the counts
 *
 * Because the message is going to name them, and he is the one whose name is
 * on it. A row that says «فاته ٢ محاضرات» and a send button asks him to
 * approve a sentence he has not read. The chips carry the counts for scanning;
 * the line under them carries what the student will actually be told.
 */
function StalledCard({
  row,
  window,
  maySend,
}: {
  row: FollowUpRow;
  window: number;
  maySend: boolean;
}) {
  const titles = [...row.missedLessons, ...row.missedQuizzes].map((item) => item.title);

  return (
    <li className="rounded-[var(--r-lg)] border border-line bg-surface-2 p-4">
      {/* The coloured rail is the row's own object boundary — a page of
          bordered rectangles reads as a document, not a queue. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/students/${row.userId}`}
              className="text-[length:var(--fs-title-4)] font-semibold text-fg underline-offset-4 hover:underline"
            >
              {row.studentName}
            </Link>
            {row.lastMessagedAt ? <Badge tone="neutral">{messagedChip(row.lastMessagedAt)}</Badge> : null}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="size-4 shrink-0" aria-hidden="true" />
              {row.courseTitle}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              {lastActive(row.lastActiveAt)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              {who(row.year, row.schoolStream)}
            </span>
            <span aria-hidden="true">·</span>
            <span dir="ltr" className="tabular-nums">
              {row.phone}
            </span>
          </p>
        </div>

        {maySend ? (
          <SendRowButton
            input={{ kind: 'follow-up', userId: row.userId, courseId: row.courseId, window }}
          />
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.missedLessons.length > 0 ? (
          <Badge tone="warn">
            {row.missedLessons.length} {c.missedLessons}
          </Badge>
        ) : null}
        {row.missedQuizzes.length > 0 ? (
          <Badge tone="err">
            {row.missedQuizzes.length} {c.missedQuizzes}
          </Badge>
        ) : null}
        <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{titles.join(' · ')}</span>
      </div>
    </li>
  );
}

/** An account with no seat where its own year points. */
function IdleCard({ row, maySend }: { row: IdleRow; maySend: boolean }) {
  return (
    <li className="rounded-[var(--r-lg)] border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* No link when the record cannot open — see `IdleRow.hasProfile`.
                A name that looks pressable and 404s is worse than plain text. */}
            {row.hasProfile ? (
              <Link
                href={`/admin/students/${row.userId}`}
                className="text-[length:var(--fs-title-4)] font-semibold text-fg underline-offset-4 hover:underline"
              >
                {row.studentName}
              </Link>
            ) : (
              <span className="text-[length:var(--fs-title-4)] font-semibold text-fg">
                {row.studentName}
              </span>
            )}
            <Badge tone={row.reason === 'never' ? 'warn' : 'accent'}>
              {row.reason === 'never' ? c.reasonNever : c.reasonElsewhere}
            </Badge>
            {row.reason === 'elsewhere' ? (
              <Badge tone="neutral">{formatCopy(c.enrolledElsewhere, { n: row.enrolledCount })}</Badge>
            ) : null}
            {row.hasProfile ? null : <Badge tone="neutral">{c.noProfile}</Badge>}
            {row.lastMessagedAt ? <Badge tone="neutral">{messagedChip(row.lastMessagedAt)}</Badge> : null}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              {who(row.year, row.schoolStream)}
            </span>
            {row.phone ? (
              <>
                <span aria-hidden="true">·</span>
                <span dir="ltr" className="tabular-nums">
                  {row.phone}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {maySend ? <SendRowButton input={{ kind: 'subscribe', userId: row.userId }} /> : null}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
        {row.suggestedCourseTitle ? (
          <>
            <GraduationCap className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <span className="text-fg">{row.suggestedCourseTitle}</span>
          </>
        ) : (
          <>
            <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
            {c.noSuggestion}
          </>
        )}
      </p>
    </li>
  );
}

/**
 * «سنة ٢ · لغات» — who this student is, in the two facts that decide which
 * course they belong in.
 *
 * Both halves are nullable and neither is guessed: a profile onboarded before
 * the stream question existed genuinely has no answer, and printing «عربي» for
 * it would be the screen inventing one. Same rule
 * `copy.admin.students.streamFilterLabels.unset` was written for.
 */
function who(year: number | null, stream: 'general' | 'languages' | null): string {
  const parts = [year === null ? c.yearUnknown : formatCopy(c.yearKnown, { n: year })];
  if (stream !== null) parts.push(copy.admin.students.streamFilterLabels[stream]);
  return parts.join(' · ');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** «من ١٢ يوم», and the two days that have their own word. */
function lastActive(iso: string | null): string {
  if (iso === null) return c.lastActiveNever;
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return c.lastActiveToday;
  if (days === 1) return c.lastActiveYesterday;
  return formatCopy(c.lastActiveDays, { days });
}

function messagedChip(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  return days <= 0 ? c.messagedToday : formatCopy(c.messagedAgo, { days });
}

/** A repeated query parameter is a mistake here, not a multi-value filter. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
