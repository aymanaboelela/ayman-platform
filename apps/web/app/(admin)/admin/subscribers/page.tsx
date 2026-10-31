import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  CalendarDays,
  Download,
  FileSpreadsheet,
  History,
  MessageCircle,
  Phone,
  Search,
  UserRound,
  UserRoundX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { listResponse } from '@ayman/contracts/admin/list';
import {
  SUBSCRIBERS_PER_PAGE,
  SubscriberRowSchema,
  SubscribersOverviewSchema,
  metaPhone,
  type SubscriberCourse,
  type SubscriberMonth,
  type SubscriberRow,
} from '@ayman/contracts/admin/subscribers';
import { copy } from '@ayman/contracts/copy/admin';
import { subscribersCopy as c } from '@ayman/contracts/copy/subscribers';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { ListControl, ListPager } from '@/components/admin/list-controls';
import { CourseArt } from '@/components/course-art';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import './subscribers.css';

export const metadata = { title: c.title };

const ListSchema = listResponse(SubscriberRowSchema);

/** Course cards on the first screen; the rest open under one toggle. */
const COURSES_SHOWN = 12;

/** The filters this screen keeps in its URL — also exactly what the API and both files read. */
interface Filters {
  status: 'in' | 'out';
  audience: 'all' | 'past';
  courseId: string;
  monthId: string;
  year: string;
  withPhone: boolean;
  q: string;
}

const DEFAULT: Filters = {
  status: 'out',
  audience: 'all',
  courseId: '',
  monthId: '',
  year: '',
  withPhone: false,
  q: '',
};

/**
 * `/admin/subscribers` — «مين مشترك ومين لأ»، على المنصة، وفي كل كورس، وفي
 * كل شهر.
 *
 * Three blocks on one page, top to bottom, because they are one question
 * asked at three sizes: the platform's totals, every paid course with its
 * months, and the names behind whichever number was pressed. Every number is
 * a LINK that sets the list's filter — «٣٤ مشتركوش في شهر ٢» is only useful
 * if the 34 are one press away — and the ads file always downloads the list
 * on the screen. `@ayman/contracts/admin/subscribers` says what «مشترك»,
 * «الشهر» and «مين» mean; nothing here decides it.
 *
 * ## 404 when the feature is off
 *
 * Like `/admin/promo-banners`: on a stack without `subscribersReport` the
 * screen does not exist, and the API behind it answers 404 too.
 *
 * ## Uncached
 *
 * `adminGet`, never a `'use cache'` loader: a student who pays this minute
 * must leave «مش مشتركين» this minute, on the screen whose output is an ads
 * audience and a list of people to call.
 */
export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getEntitlements()).subscribersReport) notFound();

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(one(params.page) ?? '1', 10) || 1);

  const overview = await adminGet('/api/admin/subscribers/overview', SubscribersOverviewSchema);
  const filters = readFilters(params, overview.courses);
  const course = overview.courses.find((row) => row.courseId === filters.courseId) ?? null;
  const month = course?.months.find((row) => row.monthId === filters.monthId) ?? null;

  const query = toQuery(filters);
  const listQuery = new URLSearchParams(query);
  listQuery.set('page', String(page));
  listQuery.set('perPage', String(SUBSCRIBERS_PER_PAGE));
  const list = await adminGet(`/api/admin/subscribers?${listQuery}`, ListSchema);

  const qs = query.size > 0 ? `?${query}` : '';

  /*
   * Busiest first, and the picked course always on the first screen. A
   * stack with a dozen paid courses shows all of them; a database full of
   * test courses does not bury the list under three hundred empty cards.
   */
  const ranked = [...overview.courses].sort(
    (a, b) =>
      Number(b.courseId === filters.courseId) - Number(a.courseId === filters.courseId) ||
      b.subscribed + b.lapsed - (a.subscribed + a.lapsed) ||
      b.months.length - a.months.length ||
      a.year - b.year,
  );
  const shown = ranked.slice(0, COURSES_SHOWN);
  const rest = ranked.slice(COURSES_SHOWN);
  const { totals } = overview;

  return (
    <div className="subs">
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
      </header>

      <section className="subs-tiles" aria-label={c.title}>
        <Tile icon={Users} tone="--info" label={c.totals.students} value={totals.students} />
        <Tile
          icon={BadgeCheck}
          tone="--ok"
          label={c.totals.subscribed}
          value={totals.subscribed}
          href={hrefFor({ ...DEFAULT, status: 'in' })}
          current={!course && filters.status === 'in'}
        />
        <Tile
          icon={UserRoundX}
          tone="--err"
          label={c.totals.notSubscribed}
          value={totals.notSubscribed}
          href={hrefFor(DEFAULT)}
          current={!course && filters.status === 'out' && filters.audience === 'all' && !filters.withPhone}
        />
        <Tile
          icon={History}
          tone="--warn"
          label={c.totals.lapsed}
          value={totals.lapsed}
          href={hrefFor({ ...DEFAULT, audience: 'past' })}
          current={!course && filters.status === 'out' && filters.audience === 'past'}
        />
        <Tile
          icon={Phone}
          tone="--e-stage"
          label={c.totals.withPhone}
          value={totals.withPhone}
          href={hrefFor({ ...DEFAULT, withPhone: true })}
          current={!course && filters.status === 'out' && filters.withPhone}
        />
      </section>

      <section className="mb-10">
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{c.coursesTitle}</h2>
          <span className="group-head__note">{c.coursesLead}</span>
        </div>

        {overview.courses.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.coursesNone}
          </p>
        ) : (
          <>
            <ul className="subs-courses">
              {shown.map((row) => (
                <CourseCard key={row.courseId} course={row} filters={filters} />
              ))}
            </ul>
            {/* The rest behind one toggle, never dropped: a course with
                nobody in it is still a course, and the count says it is there. */}
            {rest.length > 0 ? (
              <details className="subs-more">
                <summary>{formatCopy(c.moreCourses, { n: rest.length })}</summary>
                <ul className="subs-courses">
                  {rest.map((row) => (
                    <CourseCard key={row.courseId} course={row} filters={filters} />
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </section>

      <section id="list" className="scroll-mt-24">
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{heading(filters, course, month)}</h2>
          <span className="group-head__note tabular-nums">{formatCopy(c.count, { n: list.rowCount.toLocaleString('ar-EG') })}</span>
        </div>

        <div className="subs-ads">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-fg">
              <Download className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
              {c.adsTitle}
            </p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] leading-[1.7] text-fg-muted">{c.adsLead}</p>
          </div>
          <div className="subs-ads__actions">
            {/* Plain links, same origin — the API sets attachment and no-store. */}
            <a className="subs-btn subs-btn--meta" href={`/api/admin/subscribers/export/meta.csv${qs}`} download>
              <Download className="size-4" aria-hidden="true" />
              {c.adsStudents}
            </a>
            <a
              className="subs-btn subs-btn--meta"
              href={`/api/admin/subscribers/export/meta.csv?${withParam(query, 'parents', '1')}`}
              download
            >
              <Users className="size-4" aria-hidden="true" />
              {c.adsWithParents}
            </a>
            <a className="subs-btn" href={`/api/admin/subscribers/export/students.xlsx${qs}`} download>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              {c.excel}
            </a>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <ListControl
            name="status"
            label={c.listTitle}
            value={filters.status === 'out' ? '' : 'in'}
            options={[
              { value: '', label: c.statusOut },
              { value: 'in', label: c.statusIn },
            ]}
          />
          {filters.status === 'out' ? (
            <ListControl
              name="audience"
              label={c.audienceLabel}
              value={filters.audience === 'all' ? '' : 'past'}
              options={[
                { value: '', label: c.audienceAll },
                { value: 'past', label: c.audiencePast },
              ]}
            />
          ) : null}
          <ListControl
            name="courseId"
            label={c.courseFilter}
            value={filters.courseId}
            options={[
              { value: '', label: c.courseAll },
              ...overview.courses.map((row) => ({
                value: row.courseId,
                label: `${row.title} · ${c.yearLabel[row.year] ?? row.year}`,
              })),
            ]}
          />
          {course && course.months.length > 0 ? (
            <ListControl
              name="monthId"
              label={c.monthFilter}
              value={filters.monthId}
              options={[
                { value: '', label: c.monthAll },
                ...course.months.map((row) => ({ value: row.monthId, label: row.title })),
              ]}
            />
          ) : null}
          <ListControl
            name="year"
            label={c.yearFilter}
            value={filters.year}
            options={[
              { value: '', label: c.yearAll },
              ...[1, 2, 3].map((year) => ({ value: String(year), label: c.yearLabel[year] ?? String(year) })),
            ]}
          />
          <ListControl
            name="withPhone"
            label={c.phoneFilter}
            value={filters.withPhone ? '1' : ''}
            options={[
              { value: '', label: c.phoneAny },
              { value: '1', label: c.phoneOnly },
            ]}
          />

          {/* A GET form: the search is one more query parameter, and the
              other filters ride along as hidden fields so pressing «دوّر»
              never drops them. */}
          <form method="get" action="/admin/subscribers#list" className="subs-search">
            {[...query.entries()]
              .filter(([key]) => key !== 'q')
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <label className="sr-only" htmlFor="subs-q">
              {c.search}
            </label>
            <input
              id="subs-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder={c.search}
              className="subs-search__input"
            />
            <button type="submit" className="subs-btn">
              <Search className="size-4" aria-hidden="true" />
              {c.searchButton}
            </button>
          </form>

          {query.size > 0 ? (
            <Link href="/admin/subscribers#list" className="subs-clear">
              {c.clear}
            </Link>
          ) : null}
        </div>

        {list.rowCount === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
            <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          </div>
        ) : (
          <ul className="subs-rows">
            {list.rows.map((row) => (
              <StudentRow key={row.userId} row={row} subscribed={filters.status === 'in'} />
            ))}
          </ul>
        )}

        <ListPager
          page={page}
          perPage={SUBSCRIBERS_PER_PAGE}
          rowCount={list.rowCount}
          labels={{
            previous: copy.admin.books.pagerPrevious,
            next: copy.admin.books.pagerNext,
            of: copy.admin.books.pagerOf,
          }}
        />
      </section>
    </div>
  );
}

type Tone = '--info' | '--ok' | '--err' | '--warn' | '--e-stage';

/** One coloured number. A link when it opens a list — the colour IS the meaning. */
function Tile({
  icon: Icon,
  tone,
  label,
  value,
  href,
  current = false,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: number;
  href?: string;
  current?: boolean;
}) {
  const body = (
    <>
      <span className="subs-tile__icon" style={{ background: `var(${tone})` }} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">{label}</span>
        <span className="block text-[length:var(--fs-title-2)] font-bold leading-tight text-fg tabular-nums">
          {value.toLocaleString('ar-EG')}
        </span>
      </span>
    </>
  );
  const style = {
    borderColor: `color-mix(in oklch, var(${tone}), transparent ${current ? 20 : 70}%)`,
    background: `color-mix(in oklch, var(${tone}), transparent ${current ? 82 : 91}%)`,
  };
  return href ? (
    <Link href={href} className="subs-tile subs-tile--link" style={style} aria-current={current ? 'true' : undefined}>
      {body}
    </Link>
  ) : (
    <div className="subs-tile" style={style}>
      {body}
    </div>
  );
}

function CourseCard({ course, filters }: { course: SubscriberCourse; filters: Filters }) {
  const base: Filters = { ...DEFAULT, courseId: course.courseId };
  const share = course.audience > 0 ? Math.round((course.subscribed / course.audience) * 100) : 0;

  return (
    <li className="panel subs-course" data-current={filters.courseId === course.courseId ? 'true' : undefined}>
      <div className="subs-course__head">
        <div className="subs-course__art" aria-hidden="true">
          <CourseArt coverKey={course.coverKey} subjectNameAr={course.subjectNameAr} seed={course.courseId} compact sizes="8rem" />
        </div>
        <div className="min-w-0 flex-1">
          <Badge tone="accent">{c.yearLabel[course.year] ?? course.year}</Badge>
          <h3 className="mt-1 text-[length:var(--fs-title-4)] font-semibold leading-snug text-fg">{course.title}</h3>
          <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {formatCopy(c.courseAudienceHint, { n: course.audience })}
          </p>
        </div>
      </div>

      <div className="subs-course__nums">
        <Num href={hrefFor({ ...base, status: 'in' })} tone="ok" value={course.subscribed} label={c.courseSubscribed} />
        <Num href={hrefFor(base)} tone="err" value={course.notSubscribed} label={c.courseNotSubscribed} />
        <Num href={hrefFor({ ...base, audience: 'past' })} tone="warn" value={course.lapsed} label={c.courseLapsed} />
      </div>

      <div className="subs-bar" role="img" aria-label={`${course.subscribed} / ${course.audience}`}>
        <span className="subs-bar__fill" style={{ inlineSize: `${course.subscribed > 0 ? Math.max(share, 2) : 0}%` }} />
      </div>

      {course.months.length === 0 ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noMonths}</p>
      ) : (
        <ul className="subs-months">
          {course.months.map((month) => (
            <MonthTile
              key={month.monthId}
              month={month}
              base={base}
              current={filters.monthId === month.monthId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Num({ href, tone, value, label }: { href: string; tone: 'ok' | 'err' | 'warn'; value: number; label: string }) {
  return (
    <Link href={href} className={`subs-num subs-num--${tone}`}>
      <span className="subs-num__value tabular-nums">{value.toLocaleString('ar-EG')}</span>
      <span className="subs-num__label">{label}</span>
    </Link>
  );
}

function MonthTile({ month, base, current }: { month: SubscriberMonth; base: Filters; current: boolean }) {
  const inMonth: Filters = { ...base, monthId: month.monthId };
  const wide = month.subscribed - month.boughtMonth;
  return (
    <li className="subs-month" data-current={current ? 'true' : undefined}>
      <p className="subs-month__title">
        <CalendarDays className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="min-w-0 truncate">{month.title}</span>
        {month.isOpen ? null : <span className="subs-month__closed">{c.monthClosed}</span>}
      </p>
      <div className="subs-month__pair">
        <Link href={hrefFor({ ...inMonth, status: 'in' })} className="subs-pill subs-pill--in">
          <span className="tabular-nums">{month.subscribed.toLocaleString('ar-EG')}</span> {c.monthIn}
        </Link>
        <Link href={hrefFor(inMonth)} className="subs-pill subs-pill--out">
          <span className="tabular-nums">{month.notSubscribed.toLocaleString('ar-EG')}</span> {c.monthOut}
        </Link>
      </div>
      {month.droppedOut > 0 ? (
        <Link href={hrefFor({ ...inMonth, audience: 'past' })} className="subs-month__dropped">
          {formatCopy(c.monthDropped, { n: month.droppedOut.toLocaleString('ar-EG') })}
        </Link>
      ) : null}
      <p className="subs-month__split">
        <span className="block">{formatCopy(c.monthBought, { n: month.boughtMonth.toLocaleString('ar-EG') })}</span>
        {wide > 0 ? (
          <span className="block">{formatCopy(c.monthWide, { n: wide.toLocaleString('ar-EG') })}</span>
        ) : null}
      </p>
    </li>
  );
}

function StudentRow({ row, subscribed }: { row: SubscriberRow; subscribed: boolean }) {
  const wa = metaPhone(row.phone);
  return (
    <li className="subs-row" data-tone={subscribed ? 'in' : row.everSubscribed ? 'past' : 'out'}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* No link when the record cannot open — `/admin/students/:id` 404s
              without a profile, and a name that looks pressable and 404s is
              worse than plain text. */}
          {row.hasProfile ? (
            <Link
              href={`/admin/students/${row.userId}`}
              className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
          ) : (
            <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">{row.name}</span>
          )}
          {subscribed ? null : row.everSubscribed ? (
            <Badge tone="warn">{c.everBadge}</Badge>
          ) : (
            <Badge tone="err">{c.neverBadge}</Badge>
          )}
          {row.hasProfile ? null : <Badge tone="neutral">{c.noProfile}</Badge>}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            {row.year === null ? c.yearUnknown : (c.yearLabel[row.year] ?? row.year)}
          </span>
          <span aria-hidden="true">·</span>
          {row.phone ? (
            <span className="subs-ltr tabular-nums">{row.phone}</span>
          ) : (
            <span>{c.noPhone}</span>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatCopy(c.joined, { date: shortDate(row.createdAt) })}</span>
        </p>

        {row.holdings.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.holdings.map((holding) => (
              <span key={holding.courseId} className="subs-chip">
                {holding.title}
                <span className="subs-chip__tag">
                  {holding.wide
                    ? c.wideChip
                    : formatCopy(c.monthsChip, { list: holding.monthIndexes.map((n) => n.toLocaleString('ar-EG')).join('، ') })}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="subs-row__actions">
        {wa ? (
          <a className="subs-btn subs-btn--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" aria-hidden="true" />
            {c.whatsapp}
          </a>
        ) : null}
        {row.hasProfile ? (
          <Link className="subs-btn" href={`/admin/students/${row.userId}`}>
            <UserRound className="size-4" aria-hidden="true" />
            {c.profile}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The URL's filters, with anything that would 400 dropped rather than sent:
 * a course that is not on this screen, or a month that is not in it. A pasted
 * link from before a course was unpublished then shows the platform list
 * instead of an error page.
 */
function readFilters(
  params: Record<string, string | string[] | undefined>,
  courses: readonly SubscriberCourse[],
): Filters {
  const course = courses.find((row) => row.courseId === one(params.courseId));
  const month = course?.months.find((row) => row.monthId === one(params.monthId));
  const year = one(params.year);
  return {
    status: one(params.status) === 'in' ? 'in' : 'out',
    audience: one(params.audience) === 'past' ? 'past' : 'all',
    courseId: course?.courseId ?? '',
    monthId: month?.monthId ?? '',
    year: year === '1' || year === '2' || year === '3' ? year : '',
    withPhone: one(params.withPhone) === '1',
    q: (one(params.q) ?? '').trim().slice(0, 120),
  };
}

/** Only non-default values, so the bare path is the default list. */
function toQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.status === 'in') query.set('status', 'in');
  if (filters.status === 'out' && filters.audience === 'past') query.set('audience', 'past');
  if (filters.courseId) query.set('courseId', filters.courseId);
  if (filters.monthId) query.set('monthId', filters.monthId);
  if (filters.year) query.set('year', filters.year);
  if (filters.withPhone) query.set('withPhone', '1');
  if (filters.q) query.set('q', filters.q);
  return query;
}

function hrefFor(filters: Filters): string {
  const query = toQuery(filters);
  return `/admin/subscribers${query.size > 0 ? `?${query}` : ''}#list`;
}

function withParam(query: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(query);
  next.set(key, value);
  return next.toString();
}

function heading(filters: Filters, course: SubscriberCourse | null, month: SubscriberMonth | null): string {
  const h = c.heading;
  const past = filters.status === 'out' && filters.audience === 'past';
  if (course && month) {
    const vars = { course: course.title, month: month.title };
    return formatCopy(filters.status === 'in' ? h.monthIn : past ? h.monthPast : h.monthOut, vars);
  }
  if (course) {
    const vars = { course: course.title };
    return formatCopy(filters.status === 'in' ? h.courseIn : past ? h.coursePast : h.courseOut, vars);
  }
  return filters.status === 'in' ? h.platformIn : past ? h.platformLapsed : h.platformOut;
}

const DATE = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' });

function shortDate(iso: string): string {
  return DATE.format(new Date(iso));
}
