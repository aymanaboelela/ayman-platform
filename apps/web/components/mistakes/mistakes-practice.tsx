'use client';

import { useState } from 'react';
import { ArrowRight, Check, PartyPopper, Sparkles, Trophy, X } from 'lucide-react';
import {
  MISTAKE_MASTERY_STREAK,
  MistakeAnswerResultSchema,
  type MistakeAnswerResult,
  type MistakeEntry,
} from '@ayman/contracts/mistakes';
import { formatCopy } from '@ayman/contracts/format';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';
import { Button } from '@ayman/ui/components/button';
import { SafeHtml } from '@/components/content/safe-html';
import { apiPost } from '@/lib/api';
import { optionLetter } from '@/components/quiz/option-letter';

const c = mistakesCopy.practice;

/** Option letters, in the order the options arrive. */

interface Feedback {
  chosenIds: string[];
  result: MistakeAnswerResult;
}

/**
 * مراجعة سؤال سؤال — مفيش تايمر ولا أرواح، مراجعة هادية. نفس درس «الضغطة
 * الأولانية لازم توّري أثرها على طول» اللي اتصلّح في `quiz-game.tsx`:
 * `chosenIds` بيتسجّل في `onClick` قبل ما `answer()` يتبعت، فالزرار بيوّري
 * حالة `pending` من لحظة الضغط لحد رد السيرفر، مش بعده.
 */
export function MistakesPractice({
  queue,
  onAnswered,
  onExit,
}: {
  queue: readonly MistakeEntry[];
  onAnswered: (entry: MistakeEntry, result: MistakeAnswerResult) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);

  const entry = queue[index];

  if (!entry) {
    return (
      <div className="mk-done">
        <span className="mk-done__icon" aria-hidden="true">
          {masteredCount > 0 ? <Trophy size={34} /> : <PartyPopper size={34} />}
        </span>
        <h1 className="mk-done__title">{c.done}</h1>
        {masteredCount > 0 && <p className="mk-done__lead">{formatCopy(c.doneMastered, { n: masteredCount })}</p>}
        <Button className="mt-2" onClick={onExit}>
          {c.backToNotebook}
        </Button>
      </div>
    );
  }

  async function submit(optionId: string): Promise<void> {
    if (busy || feedback || !entry) return;
    const picked = entry.type === 'mcq_multi' ? toggled(chosenIds, optionId) : [optionId];
    setChosenIds(picked);
    if (entry.type === 'mcq_multi') return; // mcq_multi انتظر زرار التأكيد تحت
    await send(picked);
  }

  async function send(optionIds: string[]): Promise<void> {
    if (!entry || optionIds.length === 0) return;
    setBusy(true);
    try {
      const result = await apiPost(
        `/api/me/mistakes/${entry.questionVersionId}/answer`,
        MistakeAnswerResultSchema,
        { optionIds },
      );
      if (result.mastered) setMasteredCount((n) => n + 1);
      setFeedback({ chosenIds: optionIds, result });
      onAnswered(entry, result);
    } finally {
      setBusy(false);
    }
  }

  function next(): void {
    setChosenIds([]);
    setFeedback(null);
    setIndex((i) => i + 1);
  }

  const progress = ((index + (feedback ? 1 : 0)) / queue.length) * 100;
  const tone = feedback ? (feedback.result.mastered ? 'mastered' : feedback.result.correct ? 'right' : 'wrong') : null;

  return (
    <div className="mk-review">
      <header className="mk-review__top">
        <button type="button" className="mk-back" onClick={onExit}>
          <ArrowRight size={16} aria-hidden="true" />
          {c.exit}
        </button>
        <p className="mk-count">{formatCopy(c.of, { n: index + 1, total: queue.length })}</p>
      </header>

      <div className="mk-progress" aria-hidden="true">
        <span className="mk-progress__fill" style={{ inlineSize: `${progress}%` }} />
      </div>

      <section className="mk-question" data-tone={tone ?? undefined}>
        <div className="mk-question__head">
          <span className="mk-question__n">{index + 1}</span>
          {(entry.courseTitle || entry.lessonTitle) && (
            <p className="mk-question__where">
              {entry.courseTitle}
              {entry.courseTitle && entry.lessonTitle ? ' · ' : ''}
              {entry.lessonTitle}
            </p>
          )}
          <StreakDots have={feedback ? feedback.result.streakRight : entry.streakRight} />
        </div>

        <SafeHtml html={entry.stemHtml} className="mk-question__stem" />

        <ul className="mk-options" role="list">
          {entry.options.map((option, i) => {
            const state = optionState(option.id, chosenIds, feedback);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  className="mk-option"
                  data-state={state}
                  data-hue={(i % 4) + 1}
                  disabled={busy || feedback !== null}
                  onClick={() => void submit(option.id)}
                >
                  <span className="mk-option__letter" aria-hidden="true">
                    {optionLetter(i, entry.stemHtml)}
                  </span>
                  <SafeHtml html={option.bodyHtml} className="mk-option__text" />
                  {state === 'right' && <Check className="mk-option__mark" size={20} aria-hidden="true" />}
                  {state === 'wrong' && <X className="mk-option__mark" size={20} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>

        {entry.type === 'mcq_multi' && !feedback && (
          <Button className="w-fit" disabled={chosenIds.length === 0 || busy} onClick={() => void send(chosenIds)}>
            {c.next}
          </Button>
        )}
      </section>

      {feedback && (
        <div className="mk-feedback" data-tone={tone ?? undefined} role="status">
          <span className="mk-feedback__icon" aria-hidden="true">
            {feedback.result.mastered ? <Sparkles size={22} /> : feedback.result.correct ? <Check size={22} /> : <X size={22} />}
          </span>
          <div className="mk-feedback__body">
            <p className="mk-feedback__title">
              {feedback.result.mastered ? c.mastered : feedback.result.correct ? c.right : c.wrong}
            </p>
            {feedback.result.streakRight > 0 && !feedback.result.mastered && (
              <p className="mk-feedback__sub">{formatCopy(c.streak, { n: feedback.result.streakRight })}</p>
            )}
          </div>
          <Button className="mk-feedback__next" onClick={next}>
            {c.next}
          </Button>
        </div>
      )}
    </div>
  );
}

/** «صح متتالي» as dots toward mastery — the same count the card shows in words. */
function StreakDots({ have }: { have: number }) {
  return (
    <span className="mk-streak" aria-hidden="true">
      {Array.from({ length: MISTAKE_MASTERY_STREAK }, (_, i) => (
        <span key={i} className="mk-streak__dot" data-on={i < have || undefined} />
      ))}
    </span>
  );
}

function toggled(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];
}

function optionState(
  optionId: string,
  chosenIds: readonly string[],
  feedback: Feedback | null,
): 'pending' | 'right' | 'wrong' | 'dim' | undefined {
  if (!feedback) return chosenIds.includes(optionId) ? 'pending' : undefined;
  if (feedback.result.rightOptionIds.includes(optionId)) return 'right';
  if (feedback.chosenIds.includes(optionId)) return 'wrong';
  return 'dim';
}
