'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarPlus, Check, Clock, PlayCircle, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CourseOutline } from '@ayman/contracts/progress';
import { formatEGP } from '@/lib/price';
import './player-cards.css';

const c = copy.player.monthOffer;

type Offer = NonNullable<CourseOutline['monthOffer']>;

/**
 * «شهور جديدة اتفتحت» — the months of this course the student does not hold
 * yet, sold from inside the course.
 *
 * It is the only door there is, and the reason this card exists at all: an
 * enrolled student's course page redirects to their library (`proxy.ts`), and
 * the month padlock lives on a LECTURE — so «شهر ٢» opened with nothing in it
 * yet had no padlock, and every student holding «شهر ١» had no way to buy it.
 *
 * One month is a sentence and a button. Several are toggles, all on to start —
 * a student who holds «شهر ١» when «شهر ٢» and «شهر ٣» are both open is almost
 * always catching up — and the total follows the taps. The button carries the
 * choice as `?month=a,b` to the checkout, which opens on the month picker with
 * those already chosen.
 *
 * `null` from the API (a term / year / «٣ شهور» subscriber, somebody holding
 * every open month, a course that does not sell by month) renders nothing —
 * the caller does not need to check.
 */
export function MonthOfferCard({ courseSlug, offer }: { courseSlug: string; offer: Offer | null }) {
  const [chosen, setChosen] = useState<string[]>(() => offer?.months.map((month) => month.id) ?? []);

  if (!offer) return null;

  const many = offer.months.length > 1;
  const only = offer.months[0]!;
  const selected = offer.months.filter((month) => chosen.includes(month.id));
  const total = selected.reduce((sum, month) => sum + month.priceCents, 0);
  const href = `/courses/${encodeURIComponent(courseSlug)}/subscribe?month=${selected
    .map((month) => encodeURIComponent(month.id))
    .join(',')}`;

  function toggle(id: string) {
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  return (
    <section className="mo-card" aria-labelledby="month-offer-title">
      <div className="mo-card__head">
        <span className="mo-card__icon" aria-hidden="true">
          <CalendarPlus className="size-6" />
        </span>
        <div className="min-w-0">
          <span className="mo-card__eyebrow">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {c.eyebrow}
          </span>
          <h2 id="month-offer-title" className="mo-card__title">
            {many ? c.titleMany : formatCopy(c.titleOne, { month: only.title })}
          </h2>
          <p className="mo-card__lead">{many ? c.leadMany : c.leadOne}</p>
        </div>
      </div>

      {offer.pending ? (
        // A claim for this course is already in the review queue, and the
        // checkout refuses a second one — so the card says where things stand
        // instead of offering a button that would end on «قيد المراجعة».
        <p className="mo-card__pending">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {c.pending}
        </p>
      ) : (
        <>
          {many ? (
            <div className="mo-card__months">
              {offer.months.map((month) => {
                const on = chosen.includes(month.id);
                return (
                  <button
                    key={month.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(month.id)}
                    className="mo-month"
                  >
                    <span className="mo-month__check" aria-hidden="true">
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                    <span className="mo-month__name">{month.title}</span>
                    <span className="mo-month__meta">
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                      {lessonsLine(month.lessonCount)}
                    </span>
                    <span className="mo-month__price">{formatEGP(month.priceCents)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mo-card__single">
              <span className="mo-card__single-meta">
                <PlayCircle className="size-4" aria-hidden="true" />
                {lessonsLine(only.lessonCount)}
              </span>
              <span className="mo-card__single-price">{formatEGP(only.priceCents)}</span>
            </p>
          )}

          <div className="mo-card__foot">
            {many ? (
              <span className="mo-card__total" aria-live="polite">
                {selected.length > 0 ? formatCopy(c.total, { price: formatEGP(total) }) : c.noneChosen}
              </span>
            ) : null}
            {selected.length > 0 ? (
              <Link href={href} className="mo-card__cta">
                <CalendarPlus className="size-[18px]" aria-hidden="true" />
                {many ? c.ctaMany : c.ctaOne}
              </Link>
            ) : (
              // Not a dead `<a>`: with nothing chosen there is nowhere to go,
              // and the line beside it has already said why.
              <span className="mo-card__cta" aria-disabled="true" data-disabled="">
                <CalendarPlus className="size-[18px]" aria-hidden="true" />
                {c.ctaMany}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** «٤ محاضرة», or «محاضراته بتتجهّز» for a month opened before its lectures —
 *  «0 محاضرة» would read as a number that failed to load. */
function lessonsLine(count: number): string {
  return count > 0
    ? formatCopy(copy.subscribe.monthCardLessons, { count })
    : copy.subscribe.monthCardEmpty;
}
