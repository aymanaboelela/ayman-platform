'use client';

import { useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { Check, CirclePlay, ClipboardPen, ListChecks, Sparkles, Star, Trophy, type LucideProps } from 'lucide-react';
import type { BacklogCourse, BacklogItem, BacklogItemKind } from '@ayman/contracts/backlog';
import { backlogCopy } from '@ayman/contracts/copy/backlog';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import {
  PLAN_TIGHT_PER_DAY,
  planCalendar,
  planPerDay,
  type PlanPicks,
  type StudyPlanSettings,
} from '@ayman/contracts/engagement';
import { CourseArt } from '@/components/course-art';

const c = engagementCopy.plan.picker;

const KIND_ICON: Record<BacklogItemKind, ComponentType<LucideProps>> = {
  lecture: CirclePlay,
  quiz: ListChecks,
  exam: Trophy,
  homework: ClipboardPen,
};

/** The bulk chips. The exam rides with the quizzes, as on «المتراكم». */
type KindGroup = 'lecture' | 'quiz' | 'homework';
const GROUP_OF: Record<BacklogItemKind, KindGroup> = { lecture: 'lecture', quiz: 'quiz', exam: 'quiz', homework: 'homework' };
const GROUPS: { key: KindGroup; label: string; icon: ComponentType<LucideProps> }[] = [
  { key: 'lecture', label: backlogCopy.stats.lectures, icon: CirclePlay },
  { key: 'quiz', label: backlogCopy.stats.quizzes, icon: ListChecks },
  { key: 'homework', label: backlogCopy.stats.homework, icon: ClipboardPen },
];

const NUM = new Intl.NumberFormat('en-US');

/** The ring's circumference at r = 42 — `stroke-dasharray` is in user units. */
const RING = 2 * Math.PI * 42;

type Load = 'none' | 'light' | 'ok' | 'tight';

function loadOf(perDay: number): Load {
  if (perDay === 0) return 'none';
  if (perDay <= 2) return 'light';
  return perDay > PLAN_TIGHT_PER_DAY ? 'tight' : 'ok';
}

/**
 * «المتراكم اللي في الخطة» — the platform's backlog, ticked in or out, with a
 * star for what comes first. See `PlanPicksSchema` for what is stored and why
 * it is exclusions only.
 *
 * Everything is local until «حفظ الخطة»: a tap is a state change, never a
 * request, so a student can try three shapes of the week and keep the one
 * whose «في اليوم» they can live with. That number is recomputed here from
 * `planCalendar` + `planPerDay` — the same two functions the server plans
 * with — so the meter and the saved plan cannot disagree.
 */
export function PlanPicker({
  pool,
  picks,
  today,
  settings,
  doneToday,
  busy,
  error,
  onSave,
  footer,
}: {
  pool: readonly BacklogCourse[];
  picks: PlanPicks;
  today: string;
  /** The date being planned for — a draft not saved yet, during setup. */
  settings: StudyPlanSettings;
  doneToday: number;
  busy: boolean;
  error: string | null;
  onSave: (picks: PlanPicks) => void;
  /** The buttons beside «حفظ» — back to the date, or cancel. */
  footer?: ReactNode;
}) {
  const [skipped, setSkipped] = useState(() => new Set(picks.skipped));
  const [first, setFirst] = useState<string[]>(() => picks.first.filter((id) => !picks.skipped.includes(id)));
  /** The id whose star was JUST lit — it alone gets the burst. */
  const [burst, setBurst] = useState<string | null>(null);

  const items = pool.flatMap((course) => course.items);
  const total = items.length;
  const inPlan = items.filter((item) => !skipped.has(item.id)).length;

  const calendar = planCalendar(today, settings);
  const studyDays = calendar.daysLeft < 0 ? 0 : calendar.days.filter((day) => day.kind === 'study').length;
  const perDay = planPerDay(inPlan, doneToday, studyDays);
  const load = loadOf(perDay);

  function setIn(ids: readonly string[], include: boolean): void {
    setSkipped((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (include) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    // Out of the plan is out of the queue: a star on it would be a promise
    // the plan does not keep.
    if (!include) setFirst((current) => current.filter((id) => !ids.includes(id)));
  }

  function toggleStar(id: string): void {
    if (first.includes(id)) {
      setFirst((current) => current.filter((entry) => entry !== id));
      setBurst(null);
      return;
    }
    setIn([id], true);
    setFirst((current) => [...current, id]);
    setBurst(id);
  }

  if (total === 0) {
    return (
      <section className="eg-card pk-intro" aria-labelledby="pk-title">
        <PickArt />
        <div className="pk-intro__text">
          <h2 id="pk-title" className="eg-card__title">
            {c.title}
          </h2>
          <p className="eg-card__meta">{c.empty}</p>
        </div>
        <div className="pk-footer">
          <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" disabled={busy} onClick={() => onSave({ skipped: [], first: [] })}>
            <Check className="size-4" aria-hidden="true" />
            {busy ? c.saving : c.save}
          </button>
          {footer}
        </div>
      </section>
    );
  }

  const ratio = total === 0 ? 0 : inPlan / total;

  return (
    <div className="pk">
      <section className="eg-card pk-intro" aria-labelledby="pk-title">
        <PickArt />
        <div className="pk-intro__text">
          <h2 id="pk-title" className="eg-card__title">
            {c.title}
          </h2>
          <p className="eg-card__meta">{c.body}</p>
          <p className="pk-intro__note">
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            {c.newNote}
          </p>
        </div>
      </section>

      <div className="pk-meter" data-load={load} role="status" aria-live="polite">
        <svg className="pk-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="pk-ring__track" cx="50" cy="50" r="42" />
          <circle
            className="pk-ring__fill"
            cx="50"
            cy="50"
            r="42"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - ratio)}
          />
        </svg>
        <p className="pk-meter__count">
          <span key={inPlan} className="pk-meter__num pk-pop eg-ltr-num">
            {NUM.format(inPlan)}
          </span>
          <span className="pk-meter__of">
            {c.of} <span className="eg-ltr-num">{NUM.format(total)}</span>
          </span>
          <span className="pk-meter__label">{c.inPlan}</span>
        </p>
        <p className="pk-meter__load">
          {load === 'none' ? (
            <span>{c.perDayNone}</span>
          ) : (
            <>
              <span key={perDay} className="pk-meter__perday pk-pop eg-ltr-num">
                {NUM.format(perDay)}
              </span>
              <span>{c.perDay}</span>
              <span className="pk-meter__tone">{c.load[load]}</span>
            </>
          )}
        </p>
      </div>

      <div className="pk-bulk" role="group" aria-label={c.bulk}>
        <button
          type="button"
          className="pk-chip"
          aria-pressed={skipped.size === 0}
          onClick={() => setIn(items.map((item) => item.id), true)}
        >
          <Check className="size-4" aria-hidden="true" />
          {c.all}
        </button>
        {GROUPS.map((group) => {
          const ids = items.filter((item) => GROUP_OF[item.kind] === group.key).map((item) => item.id);
          if (ids.length === 0) return null;
          const allIn = ids.every((id) => !skipped.has(id));
          const Icon = group.icon;
          return (
            <button
              key={group.key}
              type="button"
              className="pk-chip"
              data-kind={group.key}
              aria-pressed={allIn}
              onClick={() => setIn(ids, !allIn)}
            >
              <Icon className="size-4" aria-hidden="true" />
              {group.label}
              <span className="pk-chip__n eg-ltr-num">{NUM.format(ids.length)}</span>
            </button>
          );
        })}
      </div>

      <ol className="pk-courses">
        {pool.map((course, index) => (
          <CourseCard
            key={course.id}
            course={course}
            index={index}
            skipped={skipped}
            first={first}
            burst={burst}
            onSetIn={setIn}
            onStar={toggleStar}
          />
        ))}
      </ol>

      {error ? (
        <p className="eg-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="pk-footer">
        <button
          type="button"
          className="eg-btn eg-btn--solid eg-btn--lg"
          disabled={busy}
          onClick={() => onSave({ skipped: [...skipped], first })}
        >
          <Check className="size-4" aria-hidden="true" />
          {busy ? c.saving : c.save}
        </button>
        {footer}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  index,
  skipped,
  first,
  burst,
  onSetIn,
  onStar,
}: {
  course: BacklogCourse;
  index: number;
  skipped: ReadonlySet<string>;
  first: readonly string[];
  burst: string | null;
  onSetIn: (ids: readonly string[], include: boolean) => void;
  onStar: (id: string) => void;
}) {
  const ids = course.items.map((item) => item.id);
  const inCount = ids.filter((id) => !skipped.has(id)).length;
  const state = inCount === ids.length ? 'true' : inCount === 0 ? 'false' : 'mixed';

  return (
    <li className="pk-course" style={{ '--i': Math.min(index, 6) } as CSSProperties}>
      <header className="pk-course__head">
        <span className="pk-course__art">
          <CourseArt coverKey={course.coverKey} subjectNameAr={course.subjectNameAr} seed={course.slug} compact />
        </span>
        <div className="pk-course__text">
          <h3 className="pk-course__title">{course.title}</h3>
          <p className="pk-course__count">
            <span className="eg-ltr-num">{NUM.format(inCount)}</span> {c.of}{' '}
            <span className="eg-ltr-num">{NUM.format(ids.length)}</span> {c.inPlan}
          </p>
          <span className="pk-bar" aria-hidden="true">
            <span className="pk-bar__fill" style={{ inlineSize: `${(inCount / ids.length) * 100}%` }} />
          </span>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={state}
          aria-label={`${c.course}: ${course.title}`}
          className="pk-switch"
          onClick={() => onSetIn(ids, state !== 'true')}
        >
          <span className="pk-switch__knob" />
        </button>
      </header>
      <ul className="pk-items">
        {course.items.map((item, row) => (
          <ItemRow
            key={item.id}
            item={item}
            row={row}
            included={!skipped.has(item.id)}
            order={first.indexOf(item.id)}
            burst={burst === item.id}
            onToggle={() => onSetIn([item.id], skipped.has(item.id))}
            onStar={() => onStar(item.id)}
          />
        ))}
      </ul>
    </li>
  );
}

function statusLine(item: BacklogItem): string {
  const s = backlogCopy.status;
  switch (item.kind) {
    case 'lecture':
      return item.status === 'in_progress' ? s.lectureStarted : s.lectureNew;
    case 'quiz':
      return item.status === 'in_progress' ? s.quizStarted : s.quizNew;
    case 'exam':
      return item.status === 'in_progress' ? s.quizStarted : s.examOpen;
    case 'homework':
      return item.status === 'redo' ? s.homeworkRedo : s.homeworkNew;
  }
}

function ItemRow({
  item,
  row,
  included,
  order,
  burst,
  onToggle,
  onStar,
}: {
  item: BacklogItem;
  row: number;
  included: boolean;
  /** Place among the starred rows, -1 for none. */
  order: number;
  burst: boolean;
  onToggle: () => void;
  onStar: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const starred = order >= 0;
  return (
    <li
      className="pk-item"
      data-kind={item.kind}
      data-in={included}
      data-first={starred}
      style={{ '--r': Math.min(row, 10) } as CSSProperties}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={included}
        className="pk-item__main"
        onClick={onToggle}
        title={included ? c.toggleOut : c.toggleIn}
      >
        <span className="pk-check" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="pk-item__icon" aria-hidden="true">
          <Icon className="size-[1.15rem]" />
        </span>
        <span className="pk-item__text">
          <span className="pk-item__title">{item.title}</span>
          <span className="pk-item__meta">
            {backlogCopy.kind[item.kind]} · {statusLine(item)}
            {included ? null : <span className="pk-item__out">{c.outOfPlan}</span>}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="pk-star"
        aria-pressed={starred}
        aria-label={`${starred ? c.firstOff : c.firstOn}: ${item.title}`}
        data-burst={burst || undefined}
        onClick={onStar}
      >
        <Star className="size-[1.1rem]" aria-hidden="true" />
        {starred ? <span className="pk-star__n eg-ltr-num">{NUM.format(order + 1)}</span> : null}
      </button>
    </li>
  );
}

/**
 * The picture at the top: the backlog's three kinds of card drifting into a
 * week. Drawn, not an image — it re-themes with the viz layer, costs no
 * request, and its motion is CSS the reduced-motion rule can stop.
 */
function PickArt() {
  return (
    <svg className="pk-art" viewBox="0 0 240 150" aria-hidden="true">
      <rect className="pk-art__cal" x="104" y="22" width="124" height="112" rx="14" />
      <rect className="pk-art__calhead" x="104" y="22" width="124" height="26" rx="14" />
      <rect className="pk-art__calhead" x="104" y="36" width="124" height="12" />
      <circle className="pk-art__ring" cx="128" cy="22" r="5" />
      <circle className="pk-art__ring" cx="204" cy="22" r="5" />
      {Array.from({ length: 12 }, (_, n) => {
        const col = n % 4;
        const line = Math.floor(n / 4);
        const tone = [0, 5, 6, 9].includes(n) ? ['lec', 'quiz', 'hw', 'lec'][[0, 5, 6, 9].indexOf(n)] : 'empty';
        return (
          <rect
            key={n}
            className={`pk-art__cell pk-art__cell--${tone}`}
            x={114 + col * 27}
            y={58 + line * 24}
            width="20"
            height="17"
            rx="5"
            style={{ '--n': n } as CSSProperties}
          />
        );
      })}
      <g className="pk-art__card pk-art__card--hw">
        <rect x="14" y="88" width="66" height="42" rx="10" />
        <rect className="pk-art__line" x="24" y="100" width="36" height="5" rx="2.5" />
        <rect className="pk-art__line" x="24" y="111" width="24" height="5" rx="2.5" />
      </g>
      <g className="pk-art__card pk-art__card--quiz">
        <rect x="26" y="52" width="66" height="42" rx="10" />
        <circle className="pk-art__line" cx="40" cy="67" r="4" />
        <rect className="pk-art__line" x="50" y="64" width="30" height="5" rx="2.5" />
        <circle className="pk-art__line" cx="40" cy="80" r="4" />
        <rect className="pk-art__line" x="50" y="77" width="22" height="5" rx="2.5" />
      </g>
      <g className="pk-art__card pk-art__card--lec">
        <rect x="8" y="16" width="66" height="42" rx="10" />
        <path className="pk-art__play" d="M35 28.5v15l12-7.5z" />
      </g>
      <path className="pk-art__star" d="M92 12l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
    </svg>
  );
}

