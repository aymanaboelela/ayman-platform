'use client';

import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { MistakeAnswerResultSchema, type MistakeAnswerResult, type MistakeEntry } from '@ayman/contracts/mistakes';
import { formatCopy } from '@ayman/contracts/format';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';
import { Button } from '@ayman/ui/components/button';
import { SafeHtml } from '@/components/content/safe-html';
import { apiPost } from '@/lib/api';

const c = mistakesCopy.practice;

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
      <div className="grid justify-items-center gap-3 py-12 text-center">
        <h1 className="text-2xl font-bold text-fg">{c.done}</h1>
        {masteredCount > 0 && <p className="text-fg-muted">{formatCopy(c.doneMastered, { n: masteredCount })}</p>}
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

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <header className="flex items-center justify-between">
        <button type="button" className="inline-flex items-center gap-1.5 text-fg-muted" onClick={onExit}>
          <ArrowRight size={16} aria-hidden="true" />
          {c.exit}
        </button>
        <p className="text-sm tabular-nums text-fg-muted">{formatCopy(c.of, { n: index + 1, total: queue.length })}</p>
      </header>

      <SafeHtml html={entry.stemHtml} className="text-lg leading-relaxed text-fg" />

      <ul className="grid gap-2.5" role="list">
        {entry.options.map((option) => {
          const state = optionState(option.id, chosenIds, feedback);
          return (
            <li key={option.id}>
              <button
                type="button"
                className="mk-option flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface-1 p-3.5 text-start"
                data-state={state}
                disabled={busy || feedback !== null}
                onClick={() => void submit(option.id)}
              >
                <SafeHtml html={option.bodyHtml} />
                {state === 'right' && <Check size={18} aria-hidden="true" />}
                {state === 'wrong' && <X size={18} aria-hidden="true" />}
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

      {feedback && (
        <div className={`grid justify-items-start gap-2 font-bold ${feedback.result.correct ? 'text-ok' : 'text-err'}`}>
          <p>{feedback.result.mastered ? c.mastered : feedback.result.correct ? c.right : c.wrong}</p>
          {feedback.result.streakRight > 0 && !feedback.result.mastered && (
            <p className="text-sm font-normal text-fg-muted">{formatCopy(c.streak, { n: feedback.result.streakRight })}</p>
          )}
          <Button className="mt-1 w-fit" onClick={next}>
            {c.next}
          </Button>
        </div>
      )}
    </div>
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
