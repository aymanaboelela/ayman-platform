'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Layers, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import {
  CARD_BOXES,
  CardReviewResultSchema,
  type CardFace,
  type CardsCourse,
  type CardsPayload,
} from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { formatCopy } from '@ayman/contracts/format';
import { SafeHtml } from '@/components/content/safe-html';
import { CountUp } from '@/components/rank/count-up';
import { apiPost } from '@/lib/api';
import { optionLetter } from '@/components/quiz/option-letter';

const c = engagementCopy.cards;


function CardsHero({ course, reviewedToday }: { course: CardsCourse; reviewedToday: number }) {
  return (
    <section className="eg-hero" data-hue="green">
      <div className="eg-hero__shapes" aria-hidden="true">
        <span className="eg-shape eg-shape--ring" />
        <span className="eg-shape eg-shape--blob" />
      </div>
      <span className="eg-hero__pill">
        <Layers className="size-3.5" aria-hidden="true" />
        {course.title}
      </span>
      <p className="eg-hero__total">
        <span className="eg-hero__num">
          <CountUp to={course.mastered} />
        </span>
        <span className="eg-hero__label">
          {formatCopy(c.heroOf, { total: course.total })}
        </span>
      </p>
      <dl className="eg-hero__stats">
        <div>
          <dt>{c.stats.total}</dt>
          <dd>{course.total}</dd>
        </div>
        <div>
          <dt>{c.stats.seen}</dt>
          <dd>{course.seen}</dd>
        </div>
        <div>
          <dt>{c.stats.due}</dt>
          <dd>{course.due}</dd>
        </div>
        <div>
          <dt>{c.stats.today}</dt>
          <dd>{reviewedToday}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Five pips, filled up to the card's box — how close it is to «اتحفظت». */
function BoxPips({ box }: { box: number }) {
  return (
    <span className="eg-pips" aria-label={box === 0 ? c.round.newCard : formatCopy(c.round.box, { n: box })}>
      {Array.from({ length: CARD_BOXES }, (_, index) => (
        <span key={index} className="eg-pips__dot" data-on={index < box} />
      ))}
    </span>
  );
}

/**
 * «بطاقات المراجعة» — one round of up to ten cards. The question first; the
 * answer only after «الإجابة»; then the student's own call, «كانت معروفة» or
 * «محتاجة مراجعة», which moves the card between boxes. The round ends on a
 * count and «جولة كمان», which re-reads the deck from the server.
 */
export function CardsBoard({ initial }: { initial: CardsPayload }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ knew: 0, again: 0 });
  const [reviewed, setReviewed] = useState(initial.reviewedToday);
  const [reloading, startReload] = useTransition();

  // A new deck from the server — «جولة كمان» or another course — starts a new round.
  const [dealt, setDealt] = useState(initial);
  if (dealt !== initial) {
    setDealt(initial);
    setIndex(0);
    setFlipped(false);
    setError(null);
    setTally({ knew: 0, again: 0 });
    setReviewed(initial.reviewedToday);
  }

  const { courses, courseId, deck } = initial;
  const course = courses.find((entry) => entry.courseId === courseId) ?? null;

  if (!course) {
    return (
      <section className="eg-empty">
        <span className="eg-empty__badge" aria-hidden="true">
          <Layers className="size-8" />
        </span>
        <h2 className="eg-empty__title">{c.empty.title}</h2>
        <p className="eg-empty__body">{c.empty.body}</p>
        <Link href="/library" className="eg-btn eg-btn--solid">
          {c.empty.cta}
        </Link>
      </section>
    );
  }

  const card: CardFace | undefined = deck[index];
  const finished = deck.length > 0 && index >= deck.length;

  async function rate(knew: boolean): Promise<void> {
    if (!card || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/me/cards/review', CardReviewResultSchema, {
        bankEntryId: card.bankEntryId,
        courseId: course!.courseId,
        knew,
      });
      setTally((current) => ({ knew: current.knew + (knew ? 1 : 0), again: current.again + (knew ? 0 : 1) }));
      setReviewed((current) => current + 1);
      setFlipped(false);
      setIndex((current) => current + 1);
    } catch {
      setError(c.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  function another(): void {
    startReload(() => router.refresh());
  }

  return (
    <>
      {courses.length > 1 ? (
        <nav className="eg-months" aria-label={c.course}>
          {courses.map((entry) => (
            <Link
              key={entry.courseId}
              href={`/cards?course=${entry.courseId}`}
              className="eg-month"
              data-hue="green"
              aria-current={entry.courseId === course.courseId ? 'page' : undefined}
            >
              {entry.title}
              {entry.due > 0 ? <span className="eg-count-dot eg-ltr-num">{entry.due}</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}

      <CardsHero course={course} reviewedToday={reviewed} />

      {deck.length === 0 ? (
        <section className="eg-empty">
          <span className="eg-empty__badge" aria-hidden="true">
            <Check className="size-8" />
          </span>
          <h2 className="eg-empty__title">{c.caughtUp.title}</h2>
          <p className="eg-empty__body">{c.caughtUp.body}</p>
        </section>
      ) : finished ? (
        <section className="eg-card eg-done">
          <span className="eg-done__icon" aria-hidden="true">
            <Sparkles className="size-8" />
          </span>
          <h2 className="eg-card__title">{c.done.title}</h2>
          <dl className="eg-done__tally">
            <div data-tone="green">
              <dt>{c.done.knew}</dt>
              <dd className="eg-ltr-num">{tally.knew}</dd>
            </div>
            <div data-tone="amber">
              <dt>{c.done.again}</dt>
              <dd className="eg-ltr-num">{tally.again}</dd>
            </div>
          </dl>
          <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" onClick={another} disabled={reloading}>
            {reloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
            {c.done.another}
          </button>
        </section>
      ) : card ? (
        <section className="eg-flash" data-flipped={flipped} aria-live="polite">
          <div className="eg-flash__progress" aria-label={formatCopy(c.round.of, { n: index + 1, total: deck.length })}>
            {deck.map((entry, at) => (
              <span key={entry.bankEntryId} className="eg-flash__step" data-state={at < index ? 'done' : at === index ? 'now' : 'next'} />
            ))}
          </div>

          <article className="eg-card eg-flash__card" key={card.bankEntryId}>
            <header className="eg-question__head">
              <span className="eg-chip" data-tone="green">
                {card.box === 0 ? <Sparkles className="size-4" aria-hidden="true" /> : <Layers className="size-4" aria-hidden="true" />}
                {card.box === 0 ? c.round.newCard : formatCopy(c.round.of, { n: index + 1, total: deck.length })}
              </span>
              <BoxPips box={card.box} />
              {card.lessonTitle ? (
                <span className="eg-card__meta">{formatCopy(c.round.fromLesson, { lesson: card.lessonTitle })}</span>
              ) : null}
            </header>

            <SafeHtml html={card.stemHtml} className="eg-question__stem eg-rich" />

            <ul className="eg-options">
              {card.options.map((option, at) => {
                const isKey = card.keyOptionIds.includes(option.id);
                const tone = flipped ? (isKey ? 'key' : 'dim') : 'idle';
                return (
                  <li key={option.id}>
                    <div className="eg-option" data-tone={tone}>
                      <span className="eg-option__letter" aria-hidden="true">
                        {tone === 'key' ? <Check className="size-4" /> : optionLetter(at, card.stemHtml)}
                      </span>
                      <SafeHtml html={option.bodyHtml} className="eg-option__body" />
                      {tone === 'key' ? <span className="sr-only">{c.round.answerLabel}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {flipped && card.explanationHtml ? (
              <div className="eg-verdict__explain">
                <p className="eg-verdict__label">{c.round.explanation}</p>
                <SafeHtml html={card.explanationHtml} className="eg-rich" />
              </div>
            ) : null}

            <footer className="eg-flash__actions">
              {flipped ? (
                <>
                  <button type="button" className="eg-btn eg-btn--lg eg-btn--again" disabled={busy} onClick={() => void rate(false)}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {c.round.again}
                  </button>
                  <button type="button" className="eg-btn eg-btn--lg eg-btn--knew" disabled={busy} onClick={() => void rate(true)}>
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                    {c.round.knew}
                  </button>
                </>
              ) : (
                <button type="button" className="eg-btn eg-btn--solid eg-btn--lg" onClick={() => setFlipped(true)}>
                  <Eye className="size-4" aria-hidden="true" />
                  {c.round.flip}
                </button>
              )}
            </footer>
            {error ? (
              <p className="eg-error" role="alert">
                {error}
              </p>
            ) : null}
          </article>
        </section>
      ) : null}
    </>
  );
}
