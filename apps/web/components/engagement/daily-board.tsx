'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenCheck, Check, CircleHelp, Flame, Loader2, Moon, Trophy, X } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import {
  DailyAnswerResultSchema,
  type DailyPayload,
  type DailyStreak,
  type DailyVerdict,
} from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { SafeHtml } from '@/components/content/safe-html';
import { CountUp } from '@/components/rank/count-up';
import { ApiRequestError, apiPost } from '@/lib/api';

const c = engagementCopy.daily;

/** «الحد», «الاتنين» … under each of the seven dots. Cairo calendar keys, read as UTC dates. */
const weekdayShort = new Intl.DateTimeFormat('ar-EG', { weekday: 'short', timeZone: 'UTC' });

function StreakHero({ streak }: { streak: DailyStreak }) {
  const rate = streak.answered > 0 ? Math.round((streak.right / streak.answered) * 100) : null;
  return (
    <section className="eg-hero" data-hue="amber">
      <div className="eg-hero__shapes" aria-hidden="true">
        <span className="eg-shape eg-shape--ring" />
        <span className="eg-shape eg-shape--blob" />
      </div>
      <span className="eg-hero__pill">
        <Flame className="size-3.5" aria-hidden="true" />
        {c.streak.pill}
      </span>
      <div className="eg-hero__main">
        <span className="eg-flame" data-lit={streak.current > 0} aria-hidden="true">
          <Flame className="size-12" />
        </span>
        <p className="eg-hero__total">
          <span className="eg-hero__num">
            <CountUp to={streak.current} />
          </span>
          <span className="eg-hero__label">
            {streak.current > 0
              ? `${arabicCount(streak.current, c.streak.days)} ${c.streak.runLabel}`
              : c.streak.zero}
          </span>
        </p>
      </div>
      <ol className="eg-week" aria-label={c.streak.weekLabel}>
        {streak.week.map((day) => (
          <li key={day.day} className="eg-week__day" data-status={day.status}>
            <span className="eg-week__dot" title={c.streak.status[day.status]}>
              {day.status === 'right' ? (
                <Check className="size-4" aria-hidden="true" />
              ) : day.status === 'wrong' ? (
                <X className="size-4" aria-hidden="true" />
              ) : day.status === 'today' ? (
                <CircleHelp className="size-4" aria-hidden="true" />
              ) : null}
            </span>
            <span className="eg-week__name">{weekdayShort.format(new Date(`${day.day}T00:00:00Z`))}</span>
            <span className="sr-only">{c.streak.status[day.status]}</span>
          </li>
        ))}
      </ol>
      <dl className="eg-hero__stats">
        <div>
          <dt>{c.streak.answered}</dt>
          <dd>{streak.answered}</dd>
        </div>
        <div>
          <dt>{c.streak.right}</dt>
          <dd>{streak.right}</dd>
        </div>
        <div>
          <dt>{c.streak.rate}</dt>
          <dd className="eg-ltr">{rate === null ? '—' : `${rate}%`}</dd>
        </div>
        <div>
          <dt>
            <Trophy className="inline size-3.5" aria-hidden="true" /> {c.streak.best}
          </dt>
          <dd>{streak.best}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * «سؤال اليوم» — the streak on top, the card under it. One answer: the choice
 * is made, then confirmed, and the confirmation is final — a misclick on a
 * phone should not cost a day.
 */
export function DailyBoard({ initial }: { initial: DailyPayload }) {
  const [payload, setPayload] = useState(initial);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { question, verdict, streak } = payload;

  async function confirm(): Promise<void> {
    if (!picked || busy || verdict) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost('/api/me/daily/answer', DailyAnswerResultSchema, { optionId: picked });
      setPayload((current) => ({ ...current, verdict: result.verdict, streak: result.streak }));
    } catch (failure) {
      setError(failure instanceof ApiRequestError && failure.status === 409 ? c.errors.already : c.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StreakHero streak={streak} />

      {question === null ? (
        <section className="eg-empty">
          <span className="eg-empty__badge" aria-hidden="true">
            <CircleHelp className="size-8" />
          </span>
          <h2 className="eg-empty__title">{c.empty.title}</h2>
          <p className="eg-empty__body">{c.empty.body}</p>
          <Link href="/library" className="eg-btn eg-btn--solid">
            {c.empty.cta}
          </Link>
        </section>
      ) : (
        <section className="eg-card eg-question" data-state={verdict ? (verdict.wasRight ? 'right' : 'wrong') : 'open'}>
          <header className="eg-question__head">
            <span className="eg-chip" data-tone="amber">
              <Flame className="size-4" aria-hidden="true" />
              {c.card.eyebrow}
            </span>
            <span className="eg-card__meta">
              {formatCopy(c.card.from, { course: question.courseTitle })}
              {question.lessonTitle ? ` · ${question.lessonTitle}` : ''}
            </span>
          </header>

          <SafeHtml html={question.stemHtml} className="eg-question__stem eg-rich" />

          <ul className="eg-options" role="radiogroup" aria-label={c.card.eyebrow}>
            {question.options.map((option, index) => (
              <li key={option.id}>
                <OptionButton
                  index={index}
                  html={option.bodyHtml}
                  selected={(verdict?.chosenOptionId ?? picked) === option.id}
                  verdict={verdict}
                  optionId={option.id}
                  disabled={verdict !== null || busy}
                  onPick={() => setPicked(option.id)}
                />
              </li>
            ))}
          </ul>

          {verdict ? (
            <VerdictBlock verdict={verdict} streak={streak} question={question} />
          ) : (
            <footer className="eg-question__foot">
              <p className="eg-muted-line">{c.card.oneShot}</p>
              <button
                type="button"
                className="eg-btn eg-btn--solid eg-btn--lg"
                disabled={!picked || busy}
                onClick={() => void confirm()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                {busy ? c.card.sending : picked ? c.card.confirm : c.card.pickFirst}
              </button>
              {error ? (
                <p className="eg-error" role="alert">
                  {error}
                </p>
              ) : null}
            </footer>
          )}
        </section>
      )}
    </>
  );
}

const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function OptionButton({
  index,
  html,
  selected,
  verdict,
  optionId,
  disabled,
  onPick,
}: {
  index: number;
  html: string;
  selected: boolean;
  verdict: DailyVerdict | null;
  optionId: string;
  disabled: boolean;
  onPick: () => void;
}) {
  const isKey = verdict?.keyOptionIds.includes(optionId) ?? false;
  const tone = verdict ? (isKey ? 'key' : selected ? 'missed' : 'idle') : selected ? 'picked' : 'idle';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="eg-option"
      data-tone={tone}
      disabled={disabled}
      onClick={onPick}
    >
      <span className="eg-option__letter" aria-hidden="true">
        {tone === 'key' ? <Check className="size-4" /> : tone === 'missed' ? <X className="size-4" /> : LETTERS[index] ?? index + 1}
      </span>
      <SafeHtml html={html} className="eg-option__body" />
    </button>
  );
}

function VerdictBlock({
  verdict,
  streak,
  question,
}: {
  verdict: DailyVerdict;
  streak: DailyStreak;
  question: NonNullable<DailyPayload['question']>;
}) {
  return (
    <footer className="eg-verdict" data-right={verdict.wasRight}>
      <div className="eg-verdict__head">
        <span className="eg-verdict__icon" aria-hidden="true">
          {verdict.wasRight ? <Check className="size-6" /> : <X className="size-6" />}
        </span>
        <div>
          <p className="eg-verdict__title">{verdict.wasRight ? c.result.rightTitle : c.result.wrongTitle}</p>
          <p className="eg-verdict__line">
            {formatCopy(c.result.streakNow, { n: arabicCount(streak.current, engagementCopy.dashboard.daily.streak) })}
          </p>
        </div>
      </div>
      {!verdict.wasRight ? <p className="eg-muted-line">{c.result.keyHint}</p> : null}
      {verdict.explanationHtml ? (
        <div className="eg-verdict__explain">
          <p className="eg-verdict__label">{c.result.explanation}</p>
          <SafeHtml html={verdict.explanationHtml} className="eg-rich" />
        </div>
      ) : null}
      <div className="eg-verdict__actions">
        {question.lessonId ? (
          <Link
            href={`/courses/${encodeURIComponent(question.courseSlug)}/lessons/${question.lessonId}`}
            className="eg-btn"
          >
            <BookOpenCheck className="size-4" aria-hidden="true" />
            {c.result.review}
          </Link>
        ) : null}
        <span className="eg-verdict__next">
          <Moon className="size-4" aria-hidden="true" />
          {c.result.next}
        </span>
      </div>
    </footer>
  );
}
