'use client';

import { useState } from 'react';
import { BookCheck, NotebookPen, Play } from 'lucide-react';
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
    <div className="mk-notebook">
      <header className="mk-hero">
        <div className="mk-hero__text">
          <p className="mk-hero__eyebrow">{c.eyebrow}</p>
          <h1 className="mk-hero__title">{c.title}</h1>
          <p className="mk-hero__lead">{c.lead}</p>
        </div>
        <div className="mk-hero__stats">
          <div className="mk-stat" data-tone="open">
            <NotebookPen size={20} aria-hidden="true" />
            <b>{notebook.open.length}</b>
            <span>{c.tabOpen}</span>
          </div>
          <div className="mk-stat" data-tone="mastered">
            <BookCheck size={20} aria-hidden="true" />
            <b>{notebook.mastered.length}</b>
            <span>{c.tabMastered}</span>
          </div>
        </div>
      </header>

      <div className="mk-toolbar">
        <div className="mk-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'open'}
            className="mk-tab"
            data-tone="open"
            onClick={() => setTab('open')}
          >
            <NotebookPen size={16} aria-hidden="true" />
            {c.tabOpen}
            <span className="mk-tab__n">{notebook.open.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'mastered'}
            className="mk-tab"
            data-tone="mastered"
            onClick={() => setTab('mastered')}
          >
            <BookCheck size={16} aria-hidden="true" />
            {c.tabMastered}
            <span className="mk-tab__n">{notebook.mastered.length}</span>
          </button>
        </div>

        {entries.length > 0 && (
          <Button className="mk-start" onClick={() => setPracticeQueue(entries)}>
            <Play size={16} aria-hidden="true" />
            {tab === 'open' ? c.practice : c.practiceMastered}
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="mk-empty">
          {tab === 'open' ? <BookCheck size={28} aria-hidden="true" /> : <NotebookPen size={28} aria-hidden="true" />}
          <p>{tab === 'open' ? c.emptyOpen : c.emptyMastered}</p>
        </div>
      ) : (
        <>
          <p className="mk-count">
            {formatCopy(tab === 'open' ? c.countOpen : c.countMastered, { n: entries.length })}
          </p>
          <ul className="mk-cards" role="list">
            {entries.map((entry, i) => (
              <MistakeCard key={entry.questionVersionId} entry={entry} n={i + 1} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
