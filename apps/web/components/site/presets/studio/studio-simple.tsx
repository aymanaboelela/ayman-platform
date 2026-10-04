import Link from 'next/link';

import { copy } from '@ayman/contracts/copy';
import type { HonorBoardEntry } from '@ayman/contracts/admin/exams';

import { HonorFace } from '../../honor-face';
import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/**
 * The four block types that are lists of short records, sharing one shape.
 *
 * `stats`, `testimonials`, `honorBoard` and `books` all render «a heading and
 * then some rows», and giving each its own bespoke layout on this preset would
 * be four designs to keep in step for content most instructors never fill in.
 * They share `.st-rows`; what differs is what a row contains.
 *
 * ⚠️ Each one still STANDS DOWN on empty rather than drawing a heading over
 * nothing — which is also why `ownsPageHeading` in `studio-landing.tsx`
 * refuses to trust any of them with the page's `<h1>`.
 */

export function StudioStats({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { labelAr: string; value: string }[];
  level: 1 | 2;
}) {
  if (items.length === 0) return null;

  return (
    <section className="st-section" id="numbers">
      <div className="st-shell">
        {title ? <StudioHeading title={title} level={level} /> : null}
        <dl className="st-figures">
          {items.map((item) => (
            <div className="st-figure" key={`${item.labelAr}-${item.value}`}>
              <dt className="st-figure__n tabular-nums">{item.value}</dt>
              <dd className="st-figure__l">{item.labelAr}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function StudioQuotes({
  title,
  items,
  level,
}: {
  title: string;
  items: readonly { nameAr: string; bodyAr: string }[];
  level: 1 | 2;
}) {
  if (items.length === 0) return null;

  return (
    <section className="st-section" id="quotes">
      <div className="st-shell">
        <StudioHeading chip={studioCopy.chipQuotes} title={title} level={level} />
        <ul className="st-rows" role="list">
          {items.map((item) => (
            <li className="st-quote" key={item.nameAr}>
              {/* The quotation marks are in the stylesheet, not the markup: a
                  literal « in the text would be read aloud by a screen reader
                  and would survive a copy-paste of the sentence. */}
              <blockquote className="st-quote__b">{item.bodyAr}</blockquote>
              <p className="st-quote__n">{item.nameAr}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StudioHonors({
  entries,
  level,
}: {
  entries: readonly HonorBoardEntry[];
  level: 1 | 2;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="st-section" id="honors">
      <div className="st-shell">
        <StudioHeading
          chip={studioCopy.chipHonors}
          title={copy.landing.honorBoard.title}
          level={level}
        />
        {/*
          ⚠️ كروت، مش صفوف — عملية حقيقية (أيمن، 2026-10-04): الشكل القديم
          (`st-rows`/`st-honor`, سطر رفيع والصورة 2.5rem) كان مقروء أقل من
          preset الكلاسيك، والمطلوب هنا بالظبط إن اللوحة تبان بنفس وضوح
          الكلاسيك — صورة كبيرة، اسم واضح، ترتيب واضح — مش نسخة مصغّرة منه.
          نفس بنية `.board-honor` في preset «اللوح» (شبكة كروت، صورة دايرة
          كبيرة، رانك/اسم/مادة) بس بألوان ومسافات استوديو (`--st-*`) —
          مفيش أيقونة ميدالية هنا عن قصد، preset الاستوديو مالوش أيقونات
          زخرفية خالص في أي قسم تاني.
        */}
        <ul className="st-honor-cards">
          {entries.map((entry) => (
            <li
              className="st-honor-card"
              key={`${entry.studentName}-${entry.courseLabel}-${entry.rank}`}
            >
              {/* الصورة اللي المدرّس وافق عليها لللوحة دي، أو الحروف الأولى
                  لو مفيش — نفس الكومبوننت ونفس الحجة اللي preset الكلاسيك
                  بيعملها؛ شوف `HonorFace`. `.honor-board__slot-avatar`
                  بيرجع لحجمه الأصلي (7rem) هنا، مش الـ2.5rem بتاع الصف. */}
              <HonorFace name={entry.studentName} photoKey={entry.photoKey} />
              {/* الرانك المكتوب، مش ترتيب العنصر في القايمة: اللوحة ممكن
                  تحمل أول وتاني من مادتين مختلفين، والترقيم بالموضع بيسمّي
                  التاني «الأول» تاني. */}
              <span className="st-honor-card__r">{copy.landing.honorBoard.placeRanks[entry.rank - 1] ?? ''}</span>
              <span className="st-honor-card__n">{entry.studentName}</span>
              <span className="st-honor-card__note">{entry.courseLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StudioBooksLink({
  title,
  lead,
  ctaLabel,
  level,
}: {
  title: string;
  lead: string;
  ctaLabel: string;
  level: 1 | 2;
}) {
  return (
    <section className="st-section" id="books">
      <div className="st-shell st-shell--narrow">
        <StudioHeading chip={studioCopy.chipBooks} title={title} lead={lead} level={level} />
        {ctaLabel ? (
          <div className="st-section__foot">
            <Link className="st-btn st-btn--quiet" href="/books">
              {ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
