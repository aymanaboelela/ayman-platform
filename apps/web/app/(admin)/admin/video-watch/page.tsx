import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Clock, MessageCircle, Repeat, ShieldAlert, UserRound, type LucideIcon } from 'lucide-react';
import { listResponse } from '@ayman/contracts/admin/list';
import { metaPhone } from '@ayman/contracts/admin/subscribers';
import {
  VideoKeyFlagRowSchema,
  VideoKeyFlagSummarySchema,
  type VideoKeyFlagLecture,
  type VideoKeyFlagRow,
} from '@ayman/contracts/admin/video-key-flags';
import { copy } from '@ayman/contracts/copy/admin';
import { videoWatchCopy as c } from '@ayman/contracts/copy/video-watch';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { ListPager } from '@/components/admin/list-controls';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import './video-watch.css';

export const metadata = { title: c.title };

const ListSchema = listResponse(VideoKeyFlagRowSchema);

/** One of `PAGE_SIZES` — anything else is a 400 and «حصل خطأ». */
const PER_PAGE = 20;

/** Mirrors `KEY_BURST_VIDEOS` in the API's `VideoKeyWatchService` — the line a row crossed. */
const BURST_LINE = 25;

/**
 * `/admin/video-watch` — «متابعة التنزيل».
 *
 * Accounts that opened `BURST_LINE`+ distinct lectures in one Cairo day, one
 * row per account per day, written by `VideoKeyWatchService`. A row is a
 * question, not a verdict — a student revising before an exam lands here too —
 * so each one carries what answers it: how many lectures and which, how many
 * other days the same account was flagged (the rail turns red from the
 * second), and the two buttons that act on it: WhatsApp and the student's file,
 * where the account can be suspended.
 *
 * 404 with the feature off, like the API (`videoKeyWatch`, «Ayman first»).
 * `adminGet`, never cached: a row grows during the day as the account keeps
 * opening lectures, and the count on screen is the count staff act on.
 */
export default async function AdminVideoWatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getEntitlements()).videoKeyWatch) notFound();

  const params = await searchParams;
  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number.parseInt(raw ?? '1', 10) || 1);

  const [summary, list] = await Promise.all([
    adminGet('/api/admin/video-key-flags/summary', VideoKeyFlagSummarySchema),
    adminGet(`/api/admin/video-key-flags?page=${page}&perPage=${PER_PAGE}`, ListSchema),
  ]);

  return (
    <div className="vwatch">
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {formatCopy(c.lead, { n: BURST_LINE.toLocaleString('ar-EG') })}
        </p>
      </header>

      <section className="vwatch-tiles" aria-label={c.title}>
        <Tile icon={ShieldAlert} tone="--err" label={c.tiles.today} value={summary.today} />
        <Tile icon={CalendarDays} tone="--warn" label={c.tiles.week} value={summary.last7Days} />
        <Tile icon={Repeat} tone="--e-stage" label={c.tiles.repeat} value={summary.repeatAccounts} />
      </section>

      <section>
        <div className="group-head">
          <span className="group-head__mark" aria-hidden="true" />
          <h2 className="group-head__title">{c.listTitle}</h2>
          <span className="group-head__note">{c.listLead}</span>
        </div>

        {list.rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-3 text-[length:var(--fs-text-sm)] text-fg-muted">
            {formatCopy(c.empty, { n: BURST_LINE.toLocaleString('ar-EG') })}
          </p>
        ) : (
          <ul className="vwatch-rows">
            {list.rows.map((row) => (
              <FlagRow key={row.id} row={row} />
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
      </section>
    </div>
  );
}

type Tone = '--err' | '--warn' | '--e-stage';

function Tile({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: number }) {
  return (
    <div
      className="vwatch-tile"
      style={{
        borderColor: `color-mix(in oklch, var(${tone}), transparent 70%)`,
        background: `color-mix(in oklch, var(${tone}), transparent 91%)`,
      }}
    >
      <span className="vwatch-tile__icon" style={{ background: `var(${tone})` }} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">{label}</span>
        <span className="block text-[length:var(--fs-title-2)] font-bold leading-tight text-fg tabular-nums">
          {value.toLocaleString('ar-EG')}
        </span>
      </span>
    </div>
  );
}

function FlagRow({ row }: { row: VideoKeyFlagRow }) {
  const wa = metaPhone(row.phone);
  const repeat = row.flaggedDays > 1;
  const groups = byCourse(row.lectures);
  const missing = row.unresolved;

  return (
    <li className="vwatch-row" data-tone={repeat ? 'repeat' : 'first'}>
      <div className="vwatch-row__main">
        <div className="vwatch-count" aria-label={formatCopy(c.videos, { n: row.videos })}>
          <span className="vwatch-count__n tabular-nums">{row.videos.toLocaleString('ar-EG')}</span>
          <span className="vwatch-count__unit">{c.videos.replace('{n} ', '')}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/students/${row.studentId}`}
              className="text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-4 hover:underline"
            >
              {row.studentName}
            </Link>
            {repeat ? (
              <Badge tone="err">
                {row.flaggedDays === 2
                  ? c.repeatBadgeTwo
                  : formatCopy(c.repeatBadge, { n: row.flaggedDays.toLocaleString('ar-EG') })}
              </Badge>
            ) : (
              <Badge tone="warn">{c.firstBadge}</Badge>
            )}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              {longDay(row.day)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              {formatCopy(c.lastSeen, { time: clock(row.updatedAt) })}
            </span>
            <span aria-hidden="true">·</span>
            {row.phone ? <span className="vwatch-ltr tabular-nums">{row.phone}</span> : <span>{c.noPhone}</span>}
          </p>

          {groups.length > 0 || missing > 0 ? (
            <details className="vwatch-lectures">
              <summary>{c.lecturesToggle}</summary>
              {groups.map(([course, lessons]) => (
                <div key={course} className="vwatch-course">
                  <p className="vwatch-course__title">{course}</p>
                  <ul className="vwatch-course__list">
                    {lessons.map((lesson) => (
                      <li key={lesson}>{lesson}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {missing > 0 ? (
                <p className="vwatch-course__gone">
                  {c.lectureGone} ({missing.toLocaleString('ar-EG')})
                </p>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>

      <div className="vwatch-row__actions">
        {wa ? (
          <a className="vwatch-btn vwatch-btn--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" aria-hidden="true" />
            {c.whatsapp}
          </a>
        ) : null}
        <Link className="vwatch-btn" href={`/admin/students/${row.studentId}`}>
          <UserRound className="size-4" aria-hidden="true" />
          {c.profile}
        </Link>
      </div>
    </li>
  );
}

/** Lectures grouped under their course, each title once — a video on two lessons lists both. */
function byCourse(lectures: readonly VideoKeyFlagLecture[]): Array<[string, string[]]> {
  const groups = new Map<string, Set<string>>();
  for (const lecture of lectures) {
    const set = groups.get(lecture.courseTitle) ?? new Set<string>();
    set.add(lecture.lessonTitle);
    groups.set(lecture.courseTitle, set);
  }
  return [...groups].map(([course, lessons]) => [course, [...lessons]]);
}

/** «السبت ١٤ نوفمبر» — the Cairo day the row is about. Noon UTC so no zone moves it. */
function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Cairo',
  });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' });
}
