import type { ReactNode } from 'react';
import Form from 'next/form';
import Link from 'next/link';
import { z } from 'zod';
import {
  BookOpen,
  CalendarCheck2,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Layers3,
  Phone,
  Search,
  StickyNote,
  UserRound,
  UserRoundX,
  Wallet,
} from 'lucide-react';
import {
  AdminUnlockCodeListSchema,
  AdminUnlockCourseOptionsSchema,
  type AdminUnlockCodeRow,
} from '@ayman/contracts/admin/unlock-codes';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { can, getSession } from '@/lib/session';
import { ListControl } from '@/components/admin/list-controls';
import { CodeRowActions, CopyCodeButton } from './code-row-actions';
import { UnlockCodeGenerator } from './unlock-code-generator';
import {
  CodeText,
  KindChip,
  STATUS_META,
  StatusBadge,
  TINT_CARD,
  TINT_WELL,
  TONE_TEXT,
  tone,
} from './unlock-ui';

const c = copy.admin.unlockCodes;

export const metadata = { title: c.title };

/** One of the API's four page sizes — anything else is a 400, and a 400 from
 *  `adminGet` is the whole page's error boundary, not an empty list. */
const PER_PAGE = 20;

const FILTERS = ['all', 'unused', 'used', 'revoked'] as const;
type Filter = (typeof FILTERS)[number];

/** Western digits and Cairo time, whatever the server's own zone — a code
 *  used at 11pm must not read as the next day. */
const dateTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});
const when = (iso: string) => dateTime.format(new Date(iso));

interface View {
  status: Filter;
  courseId: string | undefined;
  q: string;
  page: number;
}

/** The URL for the same list with one thing changed. Any change but `page`
 *  goes back to page one — page 4 of a list that now has one page is empty
 *  and reads as a broken filter. */
function hrefFor(view: View, patch: Partial<View>): string {
  const next = { ...view, page: 1, ...patch };
  const query = new URLSearchParams();
  if (next.status !== 'all') query.set('status', next.status);
  if (next.courseId) query.set('courseId', next.courseId);
  if (next.q) query.set('q', next.q);
  if (next.page > 1) query.set('page', String(next.page));
  const search = query.toString();
  return search ? `/admin/unlock-codes?${search}` : '/admin/unlock-codes';
}

/**
 * `/admin/unlock-codes` — «أكواد الفتح».
 *
 * The generator on top, then the three counts (which double as the status
 * filter), then every code with who used it and a way to take it back.
 *
 * The write controls render only for `payment:review` — the permission the
 * API's POST, revoke and DELETE carry. A role with `payment:read` alone sees
 * the list and would otherwise get a form that 403s on its only button.
 */
export default async function UnlockCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = Array.isArray(params[key]) ? params[key][0] : params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const rawStatus = one('status');
  const rawCourse = one('courseId');
  const view: View = {
    status: FILTERS.includes(rawStatus as Filter) ? (rawStatus as Filter) : 'all',
    // Validated here because the API's `z.uuid()` answers a pasted half-id
    // with a 400, and that 400 would take the whole screen down with it.
    courseId: rawCourse && z.uuid().safeParse(rawCourse).success ? rawCourse : undefined,
    q: (one('q') ?? '').trim().slice(0, 120),
    page: Math.max(1, Math.floor(Number(one('page') ?? 1)) || 1),
  };

  const query = new URLSearchParams({
    page: String(view.page),
    perPage: String(PER_PAGE),
    status: view.status,
  });
  if (view.courseId) query.set('courseId', view.courseId);
  if (view.q) query.set('q', view.q);

  const [session, list, courseOptions] = await Promise.all([
    getSession(),
    adminGet(`/api/admin/unlock-codes?${query.toString()}`, AdminUnlockCodeListSchema),
    adminGet('/api/admin/unlock-codes/courses', AdminUnlockCourseOptionsSchema),
  ]);
  const canWrite = can(session, 'payment:review');
  const courses = courseOptions.items;

  const total = list.counts.unused + list.counts.used + list.counts.revoked;
  const pages = Math.max(1, Math.ceil(list.rowCount / PER_PAGE));
  const filtered = view.status !== 'all' || view.courseId !== undefined || view.q !== '';

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.subtitle}
      </p>

      {canWrite ? <UnlockCodeGenerator courses={courses} /> : null}

      {/* ── The three counts — also the status filter ─────────────────── */}
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        {(['unused', 'used', 'revoked'] as const).map((status) => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          const active = view.status === status;
          return (
            <Link
              key={status}
              href={hrefFor(view, { status: active ? 'all' : status })}
              aria-current={active ? 'true' : undefined}
              style={tone(meta.color)}
              scroll={false}
              className={cn(
                'flex min-w-0 flex-col items-start gap-2 rounded-lg p-3 transition-shadow duration-[160ms]',
                'sm:flex-row sm:items-center sm:gap-3.5 sm:p-4',
                TINT_CARD,
                active
                  ? 'ring-2 ring-[color:var(--uc-tone)]'
                  : 'hover:ring-1 hover:ring-[color-mix(in_oklab,var(--uc-tone)_55%,transparent)]',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg sm:size-11',
                  TINT_WELL,
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[length:var(--fs-title-2)] font-semibold leading-none tabular-nums sm:text-[length:var(--fs-title-1)]',
                    TONE_TEXT,
                  )}
                >
                  {list.counts[status]}
                </span>
                <span className="mt-1 block truncate text-[length:var(--fs-text-xs)] font-medium text-fg-muted sm:text-[length:var(--fs-text-sm)]">
                  {c.tiles[status]}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3 lg:flex-row lg:flex-wrap lg:items-end">
        <nav aria-label={c.columns.status} className="flex flex-wrap gap-1.5">
          {FILTERS.map((status) => {
            const active = view.status === status;
            const count = status === 'all' ? total : list.counts[status];
            const meta = status === 'all' ? null : STATUS_META[status];
            const Icon = meta?.icon ?? Layers3;
            return (
              <Link
                key={status}
                href={hrefFor(view, { status })}
                aria-current={active ? 'page' : undefined}
                scroll={false}
                style={tone(meta?.color ?? 'var(--a-9)')}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3',
                  'text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms]',
                  active
                    ? 'border-[color:var(--uc-tone)] bg-[color-mix(in_oklab,var(--uc-tone)_16%,var(--n-2))] text-fg'
                    : 'border-line bg-surface-1 text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-4 text-[color:var(--uc-tone)]" aria-hidden="true" />
                {c.filters[status]}
                <span className="rounded-full bg-surface-3 px-1.5 text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end lg:ms-auto">
          <ListControl
            name="courseId"
            label={c.step1}
            value={view.courseId ?? ''}
            options={[
              { value: '', label: c.allCourses },
              ...courses.map((course) => ({
                value: course.id,
                label: course.published
                  ? course.title
                  : formatCopy(c.draftOption, { title: course.title }),
              })),
            ]}
            className="min-w-0 sm:w-56"
          />
          {/* `next/form`, not a bare `<form>`: a soft navigation, so a half-
              built code in the generator above survives a search. */}
          <Form
            role="search"
            action="/admin/unlock-codes"
            scroll={false}
            className="flex min-w-0 items-stretch sm:w-72"
          >
            {view.status !== 'all' ? <input type="hidden" name="status" value={view.status} /> : null}
            {view.courseId ? <input type="hidden" name="courseId" value={view.courseId} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={view.q}
              maxLength={120}
              placeholder={c.search}
              aria-label={c.search}
              className="h-9 min-w-0 flex-1 rounded-s-lg border border-line bg-surface-1 px-3 text-[1rem] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none md:text-[length:var(--fs-text-sm)]"
            />
            <button
              type="submit"
              aria-label={c.search}
              className="grid h-9 w-10 place-items-center rounded-e-lg bg-accent text-[#1A1206] transition-colors hover:bg-accent-hover"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
          </Form>
        </div>
      </div>

      {/* ── The list ─────────────────────────────────────────────────── */}
      {list.rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <span
            style={tone('var(--a-9)')}
            className={cn('grid size-12 place-items-center rounded-full', TINT_WELL)}
          >
            <STATUS_META.unused.icon className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-[30rem] text-[length:var(--fs-text-base)] font-medium text-fg">
            {filtered || total > 0 ? c.emptyFiltered : c.empty}
          </p>
        </div>
      ) : (
        <>
          {/* Cards below `2xl`: the admin shell's sidebar takes 260px from `md`
              up, and at a 1280px viewport the seven-column table clipped its
              own action buttons (measured) — so the table waits for the room. */}
          <ul className="mt-4 grid gap-3 lg:grid-cols-2 2xl:hidden">
            {list.rows.map((row) => (
              <li key={row.id}>
                <CodeCard row={row} canWrite={canWrite} />
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-line bg-surface-2 2xl:block">
            <table className="w-full border-collapse text-[length:var(--fs-text-sm)]">
              <thead className="bg-surface-3 text-fg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{c.columns.code}</th>
                  <th className="px-3 py-3 text-start font-medium">{c.columns.content}</th>
                  <th className="px-3 py-3 text-start font-medium">{c.columns.student}</th>
                  <th className="px-3 py-3 text-start font-medium">{c.columns.status}</th>
                  <th className="px-3 py-3 text-end font-medium">{c.columns.price}</th>
                  <th className="px-3 py-3 text-start font-medium">{c.columns.created}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{c.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr
                    key={row.id}
                    style={tone(STATUS_META[row.status].color)}
                    className="border-t border-line-subtle align-top transition-colors hover:bg-[color-mix(in_oklab,var(--uc-tone)_4%,var(--n-2))]"
                  >
                    <td className="relative px-4 py-3.5">
                      {/* The status, as a stripe down the row's start edge —
                          readable while scanning the code column alone. */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-[color:var(--uc-tone)]"
                      />
                      <div className="flex items-center gap-2">
                        <CodeText
                          code={row.code}
                          className={cn(
                            'text-[length:var(--fs-title-4)]',
                            row.status === 'revoked' && 'text-fg-muted line-through',
                          )}
                        />
                        <CopyCodeButton code={row.code} compact />
                      </div>
                    </td>
                    <td className="max-w-[20rem] px-3 py-3.5">
                      <CourseLine title={row.course.title} />
                      <ContentChips row={row} />
                      <NoteLine note={row.note} />
                    </td>
                    <td className="px-3 py-3.5">
                      <StudentCell row={row} />
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={row.status} label={c.status[row.status]} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-end font-semibold tabular-nums text-fg">
                      <Price cents={row.priceCents} />
                    </td>
                    <td className="px-3 py-3.5">
                      <CreatedCell row={row} />
                    </td>
                    <td className="px-4 py-3.5">
                      {canWrite ? <CodeRowActions row={row} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {list.rowCount > PER_PAGE ? (
        <nav className="mt-5 flex items-center justify-center gap-2">
          <PagerLink href={view.page > 1 ? hrefFor(view, { page: view.page - 1 }) : null}>
            <ChevronRight className="size-4" aria-hidden="true" />
            {c.prev}
          </PagerLink>
          <span className="px-2 text-[length:var(--fs-text-sm)] tabular-nums text-fg-muted">
            {formatCopy(c.pageOf, { page: view.page, pages })}
          </span>
          <PagerLink href={view.page < pages ? hrefFor(view, { page: view.page + 1 }) : null}>
            {c.next}
            <ChevronLeft className="size-4" aria-hidden="true" />
          </PagerLink>
        </nav>
      ) : null}
    </>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/** One code as a card — every screen narrower than the table. */
function CodeCard({ row, canWrite }: { row: AdminUnlockCodeRow; canWrite: boolean }) {
  return (
    <article
      style={tone(STATUS_META[row.status].color)}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-line border-s-4 border-s-[color:var(--uc-tone)] bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <CodeText
            code={row.code}
            className={cn(
              'text-[length:var(--fs-title-3)]',
              row.status === 'revoked' && 'text-fg-muted line-through',
            )}
          />
          <CopyCodeButton code={row.code} compact />
        </div>
        <StatusBadge status={row.status} label={c.status[row.status]} />
      </div>

      <div className="px-4">
        <CourseLine title={row.course.title} />
        <ContentChips row={row} />
        <NoteLine note={row.note} />
      </div>

      <dl className="mx-4 mt-3 grid grid-cols-2 gap-x-3 gap-y-3 rounded-md bg-surface-1 p-3 text-[length:var(--fs-text-sm)]">
        <div className="col-span-2 min-w-0">
          <dt className="sr-only">{c.columns.student}</dt>
          <dd>
            <StudentCell row={row} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            <Wallet className="size-3.5" aria-hidden="true" />
            {c.columns.price}
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-fg">
            <Price cents={row.priceCents} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            <CalendarPlus className="size-3.5" aria-hidden="true" />
            {c.columns.created}
          </dt>
          <dd className="mt-0.5">
            <CreatedCell row={row} bare />
          </dd>
        </div>
      </dl>

      {canWrite && (row.status !== 'revoked' || row.redeemedAt === null) ? (
        <div className="mt-auto px-4 pb-4 pt-3">
          <CodeRowActions row={row} />
        </div>
      ) : (
        <div className="pb-4" />
      )}
    </article>
  );
}

function CourseLine({ title }: { title: string }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
      <BookOpen className="size-3.5 shrink-0 text-accent-text" aria-hidden="true" />
      <span className="truncate">{title}</span>
    </p>
  );
}

/** What the code opens. Four chips and «+n» — a code that opens twelve
 *  lectures is one row, not a wall of pills; the full list is on hover. */
function ContentChips({ row }: { row: AdminUnlockCodeRow }) {
  if (row.wholeCourse) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <KindChip kind="course" label={c.kind.course} />
      </div>
    );
  }
  const shown = row.items.slice(0, 4);
  const rest = row.items.length - shown.length;
  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
      {shown.map((item) => (
        <KindChip
          key={`${item.kind}-${item.id}`}
          kind={item.kind}
          label={item.title}
          hint={
            item.parentTitle
              ? `${c.kind[item.kind]}: ${item.parentTitle} — ${item.title}`
              : `${c.kind[item.kind]}: ${item.title}`
          }
          className="max-w-[15rem]"
        />
      ))}
      {rest > 0 ? (
        <span
          title={row.items.slice(4).map((item) => item.title).join('، ')}
          className="inline-flex items-center rounded-full border border-line bg-surface-3 px-2 text-[length:var(--fs-text-xs)] font-semibold tabular-nums text-fg-muted"
        >
          {formatCopy(c.moreItems, { count: rest })}
        </span>
      ) : null}
    </div>
  );
}

function NoteLine({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
      <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{note}</span>
    </p>
  );
}

/**
 * Who typed it. Three cases, and the middle one is easy to lose: a used code
 * whose student account was since deleted has `redeemedBy: null` but keeps
 * `redeemedAt` — it is «حساب اتمسح», never «لسه محدش استخدمه».
 */
function StudentCell({ row }: { row: AdminUnlockCodeRow }) {
  if (row.redeemedBy) {
    return (
      <div className="min-w-0">
        <Link
          href={`/admin/students/${row.redeemedBy.id}`}
          className="inline-flex max-w-full items-center gap-1.5 font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
        >
          <UserRound className="size-4 shrink-0 text-ok" aria-hidden="true" />
          <span className="truncate">{row.redeemedBy.name}</span>
        </Link>
        {row.redeemedBy.phone ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            <Phone className="size-3.5 shrink-0" aria-hidden="true" />
            <span dir="ltr" className="tabular-nums [unicode-bidi:isolate]">
              {row.redeemedBy.phone}
            </span>
          </p>
        ) : null}
        {row.redeemedAt ? <UsedOn iso={row.redeemedAt} /> : null}
      </div>
    );
  }
  if (row.redeemedAt) {
    return (
      <div>
        <p className="inline-flex items-center gap-1.5 text-fg-muted">
          <UserRoundX className="size-4 shrink-0 text-err" aria-hidden="true" />
          {c.deletedStudent}
        </p>
        <UsedOn iso={row.redeemedAt} />
      </div>
    );
  }
  return (
    <p className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
      <Hourglass className="size-3.5 shrink-0 text-info" aria-hidden="true" />
      {c.notUsedYet}
    </p>
  );
}

function UsedOn({ iso }: { iso: string }) {
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
      <CalendarCheck2 className="size-3.5 shrink-0 text-ok" aria-hidden="true" />
      <time dateTime={iso}>{formatCopy(c.usedOn, { date: when(iso) })}</time>
    </p>
  );
}

function CreatedCell({ row, bare = false }: { row: AdminUnlockCodeRow; bare?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn('flex items-center gap-1.5 text-fg', bare && 'text-[length:var(--fs-text-xs)]')}>
        {bare ? null : (
          <CalendarPlus className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
        )}
        <time dateTime={row.createdAt} className="whitespace-nowrap">
          {when(row.createdAt)}
        </time>
      </p>
      {row.createdBy ? (
        <p className="mt-0.5 truncate text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.by, { name: row.createdBy.name })}
        </p>
      ) : null}
    </div>
  );
}

function Price({ cents }: { cents: number | null }) {
  // «ج» after the number, like every other money cell in the admin.
  return cents === null ? <span className="text-fg-faint">—</span> : <>{formatEGP(cents)} ج</>;
}

function PagerLink({ href, children }: { href: string | null; children: ReactNode }) {
  const shape =
    'inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-[length:var(--fs-text-sm)] font-medium';
  if (href === null) {
    return (
      <span aria-disabled="true" className={cn(shape, 'border-line text-fg-faint opacity-60')}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        shape,
        'border-line bg-surface-2 text-fg transition-colors hover:border-accent/50 hover:text-accent-text',
      )}
    >
      {children}
    </Link>
  );
}

