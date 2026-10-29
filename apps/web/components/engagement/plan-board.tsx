'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CheckCheck,
  CirclePlay,
  ClipboardPen,
  Coffee,
  GraduationCap,
  Layers,
  ListChecks,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Trash2,
  Trophy,
  type LucideProps,
} from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import type { BacklogItem, BacklogItemKind } from '@ayman/contracts/backlog';
import { backlogCopy } from '@ayman/contracts/copy/backlog';
import {
  PLAN_HORIZON_DAYS,
  StudyPlanPayloadSchema,
  shiftDayKey,
  type PlanDay,
  type PlanPicks,
  type StudyPlanPayload,
  type StudyPlanSettings,
} from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { SubjectMark } from '@/components/course-art';
import { CountUp } from '@/components/rank/count-up';
import { apiDelete, apiPutTyped } from '@/lib/api';
import { PlanPicker } from './plan-picker';

const c = engagementCopy.plan;

const KIND_ICON: Record<BacklogItemKind, ComponentType<LucideProps>> = {
  lecture: CirclePlay,
  quiz: ListChecks,
  exam: Trophy,
  homework: ClipboardPen,
};

/** «الخميس ١٢ نوفمبر» — the plan's keys are Cairo calendar days, read as UTC dates. */
const longDay = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function itemHref(item: BacklogItem): string {
  const page = `/courses/${encodeURIComponent(item.courseSlug)}/lessons/${item.lessonId}`;
  return item.kind === 'homework' ? `${page}#homework` : page;
}

function actionLabel(item: BacklogItem): string {
  const a = backlogCopy.action;
  switch (item.kind) {
    case 'lecture':
      return item.status === 'in_progress' ? a.resume : a.watch;
    case 'quiz':
      return a.quiz;
    case 'exam':
      return a.exam;
    case 'homework':
      return item.status === 'redo' ? a.homeworkRedo : a.homework;
  }
}

/** One PUT for both halves — the date and the picks are one row. */
function savePlan(settings: StudyPlanSettings, picks?: PlanPicks): Promise<StudyPlanPayload> {
  return apiPutTyped('/api/me/plan', StudyPlanPayloadSchema, { ...settings, picks });
}

type Mode = 'view' | 'setup' | 'pick';

export function PlanBoard({ initial }: { initial: StudyPlanPayload }) {
  const [plan, setPlan] = useState(initial);
  const [mode, setMode] = useState<Mode>(initial.settings === null ? 'setup' : 'view');
  const done = (next: StudyPlanPayload) => {
    setPlan(next);
    setMode('view');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (mode === 'setup' || plan.settings === null) {
    return <PlanForm plan={plan} onSaved={done} onCancel={plan.settings ? () => setMode('view') : undefined} />;
  }

  if (mode === 'pick') {
    return <PickStep plan={plan} settings={plan.settings} onSaved={done} onCancel={() => setMode('view')} />;
  }

  return (
    <PlanView
      plan={plan}
      onEdit={() => setMode('setup')}
      onPick={() => setMode('pick')}
      onCleared={(next) => setPlan(next)}
    />
  );
}

/** The picker wired to a save — for «تعديل المتراكم» and step two of setup. */
function PickStep({
  plan,
  settings,
  onSaved,
  onCancel,
  onBack,
}: {
  plan: StudyPlanPayload;
  settings: StudyPlanSettings;
  onSaved: (plan: StudyPlanPayload) => void;
  onCancel?: () => void;
  onBack?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(picks: PlanPicks): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await savePlan(settings, picks));
    } catch {
      setError(c.picker.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PlanPicker
      pool={plan.pool}
      picks={plan.picks}
      today={plan.today}
      settings={settings}
      doneToday={plan.doneToday}
      busy={busy}
      error={error}
      onSave={(picks) => void save(picks)}
      footer={
        <>
          {onBack ? (
            <button type="button" className="eg-btn" onClick={onBack}>
              {c.steps.back}
            </button>
          ) : null}
          {onCancel ? (
            <button type="button" className="eg-btn eg-btn--quiet" onClick={onCancel}>
              {c.picker.cancel}
            </button>
          ) : null}
        </>
      }
    />
  );
}

function PlanView({
  plan,
  onEdit,
  onPick,
  onCleared,
}: {
  plan: StudyPlanPayload;
  onEdit: () => void;
  onPick: () => void;
  onCleared: (plan: StudyPlanPayload) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const settings = plan.settings!;
  const daysLeft = plan.daysLeft ?? 0;
  const [today, ...ahead] = plan.days;

  const statusLine =
    plan.status === 'tight'
      ? formatCopy(c.status.tight, { n: plan.perDay })
      : plan.status === 'clear'
        ? c.status.clear
        : plan.status === 'past'
          ? c.status.past
          : formatCopy(c.status.onTrack, { n: plan.perDay });

  async function clear(): Promise<void> {
    await apiDelete('/api/me/plan');
    onCleared({ ...plan, settings: null, daysLeft: null, status: 'none', days: [], perDay: 0, revisionFrom: null });
  }

  return (
    <>
      <section className="eg-hero" data-hue="blue">
        <div className="eg-hero__shapes" aria-hidden="true">
          <span className="eg-shape eg-shape--ring" />
          <span className="eg-shape eg-shape--blob" />
        </div>
        <span className="eg-hero__pill">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {c.hero.pill}
        </span>
        {plan.status === 'past' ? (
          <p className="eg-hero__total">
            <span className="eg-hero__label">{c.status.past}</span>
          </p>
        ) : daysLeft === 0 ? (
          <p className="eg-hero__total">
            <GraduationCap className="size-12" aria-hidden="true" />
            <span className="eg-hero__label">{c.hero.examToday}</span>
          </p>
        ) : (
          <p className="eg-hero__total">
            <span className="eg-hero__label">{c.hero.left}</span>
            <span className="eg-hero__num">
              <CountUp to={daysLeft} />
            </span>
            <span className="eg-hero__label">{arabicCount(daysLeft, c.hero.days)}</span>
          </p>
        )}
        <p className="eg-hero__sub">{formatCopy(c.hero.examOn, { date: longDay.format(asDate(settings.examDate)) })}</p>
        <div className="eg-hero__chips">
          <span className="eg-hero__chip" data-tone={plan.status}>
            {statusLine}
          </span>
          <span className="eg-hero__chip">{arabicCount(plan.remaining, c.remaining)}</span>
          {plan.revisionFrom ? (
            <span className="eg-hero__chip">
              {formatCopy(c.revisionFrom, { date: shortDay.format(asDate(plan.revisionFrom)) })}
            </span>
          ) : null}
        </div>
      </section>

      {today ? <TodayCard day={today} plan={plan} /> : null}

      {plan.total > 0 ? <PicksCard plan={plan} onPick={onPick} /> : null}

      {ahead.length > 0 ? (
        <section className="eg-section" aria-labelledby="plan-week">
          <h2 id="plan-week" className="eg-section__title">
            {c.week}
          </h2>
          <ol className="eg-days">
            {ahead.map((day) => (
              <DayRow key={day.date} day={day} />
            ))}
          </ol>
        </section>
      ) : null}

      <div className="eg-plan-tools">
        <button type="button" className="eg-btn" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
          {c.edit}
        </button>
        {confirming ? (
          <span className="eg-note__confirm" role="alert">
            <span>{c.removeConfirm}</span>
            <button type="button" className="eg-btn eg-btn--danger" onClick={() => void clear()}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.remove}
            </button>
            <button type="button" className="eg-btn" onClick={() => setConfirming(false)}>
              {c.setup.cancel}
            </button>
          </span>
        ) : (
          <button type="button" className="eg-btn eg-btn--quiet" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            {c.remove}
          </button>
        )}
      </div>
    </>
  );
}

function TodayCard({ day, plan }: { day: PlanDay; plan: StudyPlanPayload }) {
  const quotaDone = day.kind === 'study' && day.items.length === 0 && plan.doneToday > 0;
  return (
    <section className="eg-card eg-today" aria-labelledby="plan-today">
      <header className="eg-card__head">
        <span className="eg-panel__icon" data-hue="blue" aria-hidden="true">
          <CalendarCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="plan-today" className="eg-card__title">
            {c.today.title}
          </h2>
          <p className="eg-card__meta">{longDay.format(asDate(day.date))}</p>
        </div>
        {plan.doneToday > 0 ? (
          <span className="eg-chip" data-tone="green">
            <CheckCheck className="size-4" aria-hidden="true" />
            {arabicCount(plan.doneToday, c.today.done)}
          </span>
        ) : null}
      </header>
      {day.kind !== 'study' ? (
        <p className="eg-day-kind" data-kind={day.kind}>
          <DayKindIcon kind={day.kind} />
          {c.kind[day.kind]}
        </p>
      ) : quotaDone ? (
        <p className="eg-day-kind" data-kind="done">
          <CheckCheck className="size-5" aria-hidden="true" />
          {c.today.quotaDone}
        </p>
      ) : day.items.length === 0 ? (
        <p className="eg-muted-line">{c.kind.empty}</p>
      ) : (
        <ul className="eg-rows">
          {day.items.map((item) => (
            <ItemRow key={item.id} item={item} starred={plan.picks.first.includes(item.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({ item, starred }: { item: BacklogItem; starred: boolean }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="eg-row" data-kind={item.kind}>
      <span className="eg-row__icon" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eg-row__title">
          {starred ? (
            <span className="pk-first-tag">
              <Star className="size-3" aria-hidden="true" />
              {c.picker.first}
            </span>
          ) : null}
          {item.title}
        </p>
        <p className="eg-row__meta">
          {backlogCopy.kind[item.kind]} · {item.courseTitle}
        </p>
      </div>
      <Link href={itemHref(item)} className="eg-row__cta">
        <span>{actionLabel(item)}</span>
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * What the plan carries out of «المتراكم», course by course — and the door to
 * change it. The bars are in-plan over found, so a course the student took
 * out reads as an empty bar, not as a missing row.
 */
function PicksCard({ plan, onPick }: { plan: StudyPlanPayload; onPick: () => void }) {
  const skipped = new Set(plan.picks.skipped);
  const out = plan.picks.skipped.length;
  const starred = plan.picks.first.length;
  return (
    <section className="eg-card pk-summary" aria-labelledby="plan-picks">
      <header className="eg-card__head">
        <span className="eg-panel__icon" data-hue="violet" aria-hidden="true">
          <Layers className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="plan-picks" className="eg-card__title">
            {c.picks.title}
          </h2>
          <p className="eg-card__meta">
            <span className="eg-ltr-num">{plan.remaining}</span> {c.picker.of}{' '}
            <span className="eg-ltr-num">{plan.total}</span> {c.picker.inPlan}
          </p>
        </div>
        <button type="button" className="eg-btn" onClick={onPick}>
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {c.picks.edit}
        </button>
      </header>
      <ul className="pk-summary__courses">
        {plan.pool.map((course) => {
          const inCount = course.items.filter((item) => !skipped.has(item.id)).length;
          return (
            <li key={course.id} className="pk-summary__course">
              <SubjectMark subjectNameAr={course.subjectNameAr} className="size-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="pk-summary__title">{course.title}</p>
                <span className="pk-bar" aria-hidden="true">
                  <span className="pk-bar__fill" style={{ inlineSize: `${(inCount / course.items.length) * 100}%` }} />
                </span>
              </div>
              <span className="pk-summary__n eg-ltr-num">
                {inCount}/{course.items.length}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="eg-hero__chips pk-summary__chips">
        {out === 0 && starred === 0 ? <span className="eg-chip">{c.picks.all}</span> : null}
        {out > 0 ? <span className="eg-chip">{arabicCount(out, c.picks.skipped)}</span> : null}
        {starred > 0 ? (
          <span className="eg-chip" data-tone="amber">
            <Star className="size-3.5" aria-hidden="true" />
            {arabicCount(starred, c.picks.starred)}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function DayKindIcon({ kind }: { kind: PlanDay['kind'] }) {
  if (kind === 'off') return <Coffee className="size-5" aria-hidden="true" />;
  if (kind === 'revision') return <RotateCcw className="size-5" aria-hidden="true" />;
  if (kind === 'exam') return <GraduationCap className="size-5" aria-hidden="true" />;
  return <CalendarCheck className="size-5" aria-hidden="true" />;
}

function DayRow({ day }: { day: PlanDay }) {
  return (
    <li className="eg-day" data-kind={day.kind}>
      <div className="eg-day__date">
        <span className="eg-day__weekday">{c.weekdays[asDate(day.date).getUTCDay()]}</span>
        <span className="eg-day__num">{shortDay.format(asDate(day.date))}</span>
      </div>
      {day.kind !== 'study' ? (
        <p className="eg-day-kind" data-kind={day.kind}>
          <DayKindIcon kind={day.kind} />
          {c.kind[day.kind]}
        </p>
      ) : day.items.length === 0 ? (
        <p className="eg-muted-line">{c.kind.empty}</p>
      ) : (
        <ul className="eg-day__items">
          {day.items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} data-kind={item.kind}>
                <Link href={itemHref(item)} className="eg-day__item">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function PlanForm({
  plan,
  onSaved,
  onCancel,
}: {
  plan: StudyPlanPayload;
  onSaved: (plan: StudyPlanPayload) => void;
  onCancel?: () => void;
}) {
  const [examDate, setExamDate] = useState(plan.settings?.examDate ?? '');
  const [daysOff, setDaysOff] = useState<number[]>(plan.settings?.daysOff ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'when' | 'what'>('when');
  const min = plan.today;
  const max = shiftDayKey(plan.today, PLAN_HORIZON_DAYS);
  // Nothing open to pick from: the second step would be an empty page, so
  // there is one step and «حفظ» on it.
  const twoSteps = plan.total > 0;

  function toggle(day: number): void {
    setDaysOff((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : current.length >= 5 ? current : [...current, day],
    );
  }

  async function save(): Promise<void> {
    if (busy) return;
    if (!examDate || examDate < min || examDate > max) {
      setError(c.setup.badDate);
      return;
    }
    if (twoSteps) {
      setError(null);
      setStep('what');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await savePlan({ examDate, daysOff }));
    } catch {
      setError(c.setup.failed);
    } finally {
      setBusy(false);
    }
  }

  const stepper = twoSteps ? <Stepper step={step} /> : null;

  if (step === 'what') {
    return (
      <>
        {stepper}
        <div className="pk-step">
          <PickStep
            plan={plan}
            settings={{ examDate, daysOff }}
            onSaved={onSaved}
            onBack={() => setStep('when')}
            onCancel={onCancel}
          />
        </div>
      </>
    );
  }

  return (
    <>
    {stepper}
    <section className="eg-card eg-form pk-step" aria-labelledby="plan-setup">
      <header className="eg-card__head">
        <span className="eg-panel__icon" data-hue="blue" aria-hidden="true">
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="plan-setup" className="eg-card__title">
            {c.setup.title}
          </h2>
          <p className="eg-card__meta">{c.setup.body}</p>
        </div>
      </header>
      <form
        className="eg-form__body"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="eg-field">
          <span className="eg-field__label">{c.setup.examDate}</span>
          <input
            type="date"
            className="eg-input eg-ltr"
            value={examDate}
            min={min}
            max={max}
            required
            onChange={(event) => setExamDate(event.target.value)}
          />
        </label>
        <fieldset className="eg-field">
          <legend className="eg-field__label">{c.setup.daysOff}</legend>
          <p className="eg-field__hint">{c.setup.daysOffHint}</p>
          <div className="eg-weekdays">
            {c.weekdays.map((name, day) => (
              <button
                key={name}
                type="button"
                className="eg-weekday"
                aria-pressed={daysOff.includes(day)}
                onClick={() => toggle(day)}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p className="eg-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="eg-note__actions">
          <button type="submit" className="eg-btn eg-btn--solid eg-btn--lg" disabled={busy}>
            {twoSteps ? <ArrowLeft className="size-4" aria-hidden="true" /> : <CalendarCheck className="size-4" aria-hidden="true" />}
            {twoSteps ? c.steps.next : busy ? c.setup.saving : c.setup.save}
          </button>
          {onCancel ? (
            <button type="button" className="eg-btn" onClick={onCancel}>
              {c.setup.cancel}
            </button>
          ) : null}
        </div>
      </form>
    </section>
    </>
  );
}

/** «الميعاد ← المتراكم» — where setup stands, the line filling as it moves. */
function Stepper({ step }: { step: 'when' | 'what' }) {
  return (
    <ol className="pk-stepper" data-step={step} aria-label={c.steps.label}>
      <li className="pk-stepper__step" data-state={step === 'when' ? 'current' : 'done'} aria-current={step === 'when' ? 'step' : undefined}>
        <span className="pk-stepper__dot" aria-hidden="true">
          {step === 'when' ? <span className="eg-ltr-num">1</span> : <CheckCheck className="size-4" />}
        </span>
        <span className="pk-stepper__label">{c.steps.when}</span>
      </li>
      <li className="pk-stepper__line" aria-hidden="true">
        <span />
      </li>
      <li className="pk-stepper__step" data-state={step === 'what' ? 'current' : 'next'} aria-current={step === 'what' ? 'step' : undefined}>
        <span className="pk-stepper__dot" aria-hidden="true">
          <span className="eg-ltr-num">2</span>
        </span>
        <span className="pk-stepper__label">{c.steps.what}</span>
      </li>
    </ol>
  );
}
