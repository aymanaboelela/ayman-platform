'use client';

import { useState } from 'react';
import { BookCheck, NotebookPen } from 'lucide-react';
import type { MistakeAnswerResult, MistakeEntry, MistakeNotebook } from '@ayman/contracts/mistakes';
import { formatCopy } from '@ayman/contracts/format';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';
import { Button } from '@ayman/ui/components/button';
import { MistakesPractice } from './mistakes-practice';
import { MistakeCard } from './mistake-card';

const c = mistakesCopy.page;

type Tab = 'open' | 'mastered';

/**
 * «دفتر غلطاتي» — القايمة (تبويبين) أو المراجعة التفاعلية، مش الاتنين مع
 * بعض. `notebook` بييجي من السيرفر مرة واحدة؛ `MistakesPractice` بيتعامل مع
 * السيرفر لوحده وبيرجّع هنا بالنتيجة النهائية (`onFinish`) عشان الشاشة
 * ترسم القايمة محدّثة من غير ما تحتاج تعيد قراية الصفحة كلها.
 */
export function MistakesApp({ notebook: initial }: { notebook: MistakeNotebook }) {
  const [notebook, setNotebook] = useState(initial);
  const [tab, setTab] = useState<Tab>('open');
  const [practiceQueue, setPracticeQueue] = useState<MistakeEntry[] | null>(null);

  const entries = tab === 'open' ? notebook.open : notebook.mastered;

  // كل إجابة في المراجعة ممكن تنقل السؤال بين «غلطاتي» و«اللي اتصلحت» —
  // غلطة بترجّعه لـ«غلطاتي» (حتى لو كان متصلح)، وصح بيوصّل للعتبة يودّيه
  // لـ«اتصلحت». مفيش داعي يستنى ريفريش للصفحة كلها عشان يشوف أثر الضغطة.
  function onAnswered(entry: MistakeEntry, result: MistakeAnswerResult): void {
    setNotebook((current) => {
      const without = {
        open: current.open.filter((e) => e.questionVersionId !== entry.questionVersionId),
        mastered: current.mastered.filter((e) => e.questionVersionId !== entry.questionVersionId),
      };
      const updated: MistakeEntry = { ...entry, streakRight: result.streakRight };
      return result.mastered
        ? { ...without, mastered: [updated, ...without.mastered] }
        : { ...without, open: [updated, ...without.open] };
    });
  }

  if (practiceQueue) {
    return <MistakesPractice queue={practiceQueue} onAnswered={onAnswered} onExit={() => setPracticeQueue(null)} />;
  }

  return (
    <div className="grid gap-4">
      <header>
        <p className="text-sm font-bold text-fg-muted">{c.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-fg">{c.title}</h1>
        <p className="mt-1 text-fg-muted">{c.lead}</p>
      </header>

      <div className="flex gap-2 border-b border-line pb-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'open'}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-bold text-fg-muted aria-selected:bg-surface-2 aria-selected:text-fg"
          onClick={() => setTab('open')}
        >
          <NotebookPen size={16} aria-hidden="true" />
          {c.tabOpen}
          <span className="grid min-w-5 place-items-center rounded-full bg-surface-3 px-1 text-xs tabular-nums">
            {notebook.open.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mastered'}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 font-bold text-fg-muted aria-selected:bg-surface-2 aria-selected:text-fg"
          onClick={() => setTab('mastered')}
        >
          <BookCheck size={16} aria-hidden="true" />
          {c.tabMastered}
          <span className="grid min-w-5 place-items-center rounded-full bg-surface-3 px-1 text-xs tabular-nums">
            {notebook.mastered.length}
          </span>
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-fg-muted">{tab === 'open' ? c.emptyOpen : c.emptyMastered}</p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {formatCopy(tab === 'open' ? c.countOpen : c.countMastered, { n: entries.length })}
          </p>
          <Button className="w-fit" onClick={() => setPracticeQueue(entries)}>
            {tab === 'open' ? c.practice : c.practiceMastered}
          </Button>
          <ul className="grid gap-3" role="list">
            {entries.map((entry) => (
              <MistakeCard key={entry.questionVersionId} entry={entry} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
