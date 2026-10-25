'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, X, ArrowLeft, RotateCcw, BookOpen, Trophy, Sparkles, MousePointerClick, Lightbulb, Gauge } from 'lucide-react';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { optionLetter } from '@/components/quiz/option-letter';
import type { PracticePublicSet } from '@ayman/contracts/practice';
import { bestKey, percent, practiceBand, recordBest, shuffledOrder } from '@/lib/practice/grade';
import { usePracticeBest } from './use-practice-best';

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

type PracticeQuestion = PracticePublicSet['questions'][number];

/** A question as served on one attempt: options in this attempt's order. */
interface Served {
  question: PracticeQuestion;
  /** Option texts in display order. */
  options: string[];
  /** Index into `options` of the right answer. */
  answer: number;
}

function serve(question: PracticeQuestion, english: boolean): Served {
  if (question.type === 'tf') {
    // صح / غلط never shuffle — «غلط» first would be a trap, not a test.
    const pair = english ? [p.run.trueEn, p.run.falseEn] : [p.run.true, p.run.false];
    return { question, options: pair, answer: question.answer };
  }
  const options = question.options;
  const order = shuffledOrder(options.length);
  return { question, options: order.map((i) => options[i]!), answer: order.indexOf(question.answer) };
}

type Phase = 'intro' | 'running' | 'done';

export function PracticeRunner({
  set,
  articleHref,
  courseHref,
}: {
  set: PracticePublicSet;
  articleHref: string | null;
  courseHref: string;
}) {
  const total = set.questions.length;
  const id = bestKey(set.year, set.track, set.lessonCode);
  /*
   * The Languages track is written in English. Its question text, options and
   * explanations are set LTR as a block — inside the RTL page a trailing «?»
   * or «.» otherwise jumps to the wrong end of the line — while the chrome
   * around them (progress, buttons, verdict) stays Arabic.
   */
  const english = set.track === 'languages';
  const content = english ? ({ dir: 'ltr', lang: 'en' } as const) : {};
  const [phase, setPhase] = useState<Phase>('intro');
  const [served, setServed] = useState<Served[]>([]);
  const [index, setIndex] = useState(0);
  /** Chosen display index per question, or undefined while unanswered. */
  const [picks, setPicks] = useState<Array<number | undefined>>([]);
  const best = usePracticeBest(id);
  const [newBest, setNewBest] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const start = () => {
    setServed(set.questions.map((q) => serve(q, english)));
    setPicks([]);
    setIndex(0);
    setNewBest(false);
    setPhase('running');
  };

  const score = useMemo(
    () => served.reduce((n, s, i) => n + (picks[i] === s.answer ? 1 : 0), 0),
    [served, picks],
  );

  const current = served[index];
  const picked = picks[index];
  const answered = picked !== undefined;

  const choose = (option: number) => {
    if (answered) return;
    setPicks((prev) => {
      const next = [...prev];
      next[index] = option;
      return next;
    });
  };

  const advance = () => {
    if (index + 1 < served.length) {
      setIndex(index + 1);
      return;
    }
    // A first attempt is a score, not a record: «رقم قياسي» only when it beats
    // one that was already there.
    const hadBest = best !== null;
    setNewBest(recordBest(id, { score, total }) && hadBest);
    setPhase('done');
  };

  // Focus follows the question, so a keyboard or screen-reader user is never
  // left on a button that just disappeared.
  useEffect(() => {
    if (phase === 'running') headingRef.current?.focus();
    if (phase === 'done') resultRef.current?.focus();
  }, [phase, index]);

  if (phase === 'intro') {
    return (
      <div className="practice-card practice-intro">
        <p className="practice-intro__lead">
          {fill(p.run.intro, { count: arabicCount(total, quizExperience.counts.questions) })}
        </p>
        <ol className="practice-steps">
          {p.run.steps.map((step, i) => {
            const Icon = [MousePointerClick, Lightbulb, Gauge][i] ?? Check;
            return (
              <li key={step} data-step={i + 1}>
                <span className="practice-steps__icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                {step}
              </li>
            );
          })}
        </ol>
        {best ? (
          <p className="practice-best">
            <Trophy size={16} aria-hidden="true" />
            {fill(p.result.best, { score: best.score, total: best.total })}
          </p>
        ) : null}
        <button type="button" className="practice-btn practice-btn--primary" onClick={start}>
          {p.run.start}
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (phase === 'running' && current) {
    const correct = answered && picked === current.answer;
    return (
      <div className="practice-card">
        <div className="practice-progress">
          <span>{fill(p.run.progress, { n: index + 1, total })}</span>
          <span className="practice-progress__score">{fill(p.run.scoreSoFar, { n: score })}</span>
        </div>
        <div
          className="practice-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + (answered ? 1 : 0)}
          aria-label={fill(p.run.progress, { n: index + 1, total })}
        >
          <span style={{ inlineSize: `${((index + (answered ? 1 : 0)) / total) * 100}%` }} />
        </div>

        <h2 ref={headingRef} tabIndex={-1} className="practice-stem bidi-auto" {...content}>
          {current.question.stem}
        </h2>

        <div className="practice-options" role="group" aria-label={p.run.optionsLabel} {...content}>
          {current.options.map((text, i) => {
            const state = !answered
              ? 'idle'
              : i === current.answer
                ? 'right'
                : i === picked
                  ? 'wrong'
                  : 'dim';
            return (
              <button
                key={`${current.question.id}-${i}`}
                type="button"
                className="practice-option"
                data-state={state}
                aria-pressed={picked === i}
                disabled={answered}
                onClick={() => choose(i)}
              >
                <span className="practice-option__letter" aria-hidden="true">
                  {current.question.type === 'tf' ? (
                    i === 0 ? (
                      <Check size={16} />
                    ) : (
                      <X size={16} />
                    )
                  ) : english ? (
                    // The book and the teacher say «A, B, C, D» to a Languages class.
                    String.fromCharCode(65 + i)
                  ) : (
                    optionLetter(i)
                  )}
                </span>
                <span className="practice-option__text bidi-auto">{text}</span>
                {state === 'right' ? <Check className="practice-option__mark" size={18} aria-hidden="true" /> : null}
                {state === 'wrong' ? <X className="practice-option__mark" size={18} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {answered ? (
            <div className="practice-feedback" data-correct={correct}>
              <p className="practice-feedback__verdict">
                {correct ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
                {correct ? p.run.correct : p.run.wrong}
                {!correct ? (
                  <span className="practice-feedback__answer">
                    {fill(p.run.rightAnswer, { answer: current.options[current.answer] ?? '' })}
                  </span>
                ) : null}
              </p>
              <p className="practice-feedback__why" {...content}>
                <strong>{p.run.explanation}: </strong>
                {current.question.explanation}
              </p>
              <button type="button" className="practice-btn practice-btn--primary" onClick={advance}>
                {index + 1 < served.length ? p.run.next : p.run.finish}
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const band = practiceBand(score, total);
  const pct = percent(score, total);
  const misses = served
    .map((s, i) => ({ s, pick: picks[i] }))
    .filter(({ s, pick }) => pick !== s.answer);

  return (
    <div className="practice-result">
      <section className="practice-card practice-score" data-band={band}>
        <div className="practice-ring" style={{ '--practice-pct': pct } as CSSProperties} aria-hidden="true">
          <span>{fill(p.result.percent, { p: pct })}</span>
        </div>
        <div className="practice-score__text">
          <h2 ref={resultRef} tabIndex={-1}>
            {p.result.bands[band].label}
          </h2>
          <p className="practice-score__num">{fill(p.result.score, { score, total })}</p>
          <p>{p.result.bands[band].note}</p>
          {newBest ? (
            <p className="practice-best">
              <Sparkles size={16} aria-hidden="true" />
              {p.result.newBest}
            </p>
          ) : best ? (
            <p className="practice-best">
              <Trophy size={16} aria-hidden="true" />
              {fill(p.result.best, { score: best.score, total: best.total })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="practice-actions">
        <button type="button" className="practice-btn practice-btn--primary" onClick={start}>
          <RotateCcw size={18} aria-hidden="true" />
          {p.result.retry}
        </button>
        {articleHref ? (
          <Link href={articleHref} className="practice-btn">
            <BookOpen size={18} aria-hidden="true" />
            {p.result.lessonArticle}
          </Link>
        ) : null}
        <Link href={`/practice/${set.year}/${set.track}`} className="practice-btn">
          {p.result.another}
        </Link>
      </div>

      <section className="practice-card">
        <h2 className="practice-section-title">{p.result.mistakesHeading}</h2>
        {misses.length === 0 ? (
          <p>{p.result.noMistakes}</p>
        ) : (
          <ol className="practice-misses">
            {misses.map(({ s, pick }) => (
              <li key={s.question.id}>
                <p className="practice-misses__stem bidi-auto" {...content}>
                  {s.question.stem}
                </p>
                {pick !== undefined ? (
                  <p className="practice-misses__yours">
                    <X size={15} aria-hidden="true" />
                    {fill(p.result.yourAnswer, { answer: s.options[pick] ?? '' })}
                  </p>
                ) : null}
                <p className="practice-misses__right">
                  <Check size={15} aria-hidden="true" />
                  {fill(p.run.rightAnswer, { answer: s.options[s.answer] ?? '' })}
                </p>
                <p className="practice-misses__why" {...content}>
                  {s.question.explanation}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="practice-card practice-cta">
        <div>
          <h2 className="practice-section-title">{p.result.courseTitle}</h2>
          <p>{p.result.courseBody}</p>
        </div>
        <Link href={courseHref} className="practice-btn practice-btn--primary">
          {p.result.courseCta}
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
