import Link from 'next/link';
import { BookOpen, Clock, Sparkles } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { formatEGP } from '@/lib/price';
import './player-cards.css';

const c = copy.player.termOffer;

export type TermOffer = {
  terms: { id: string; title: string; priceCents: number }[];
  pending: boolean;
};

/**
 * «الترم التاني اتفتح» — the terms of this course the student does not hold
 * yet, sold from inside the course. `MonthOfferCard`'s twin, and for the same
 * reason: the enrolled student's course page redirects here (`proxy.ts`), and
 * a term opened for booking before its first lecture has no padlock to press.
 *
 * Each term is its own purchase (`plan: 'term'` names one), so each gets its
 * own button rather than toggles and a total. The link names the plan AND the
 * term, which `SubscribePanel` reads to skip the plan grid and the term picker.
 *
 * Same palette and shape as the month card (`mo-card`), so the two read as one
 * family when both are on screen.
 */
export function TermOfferCard({ courseSlug, offer }: { courseSlug: string; offer: TermOffer | null }) {
  if (!offer || offer.terms.length === 0) return null;
  const many = offer.terms.length > 1;

  return (
    <section className="mo-card" aria-labelledby="term-offer-title">
      <div className="mo-card__head">
        <span className="mo-card__icon" aria-hidden="true">
          <BookOpen className="size-6" />
        </span>
        <div className="min-w-0">
          <span className="mo-card__eyebrow">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {c.eyebrow}
          </span>
          <h2 id="term-offer-title" className="mo-card__title">
            {many ? c.titleMany : formatCopy(c.titleOne, { term: offer.terms[0]!.title })}
          </h2>
          <p className="mo-card__lead">{c.lead}</p>
        </div>
      </div>

      {offer.pending ? (
        // The checkout refuses a second claim on the same course while one is
        // in review — say where things stand instead of a button that ends there.
        <p className="mo-card__pending">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {c.pending}
        </p>
      ) : (
        offer.terms.map((term) => (
          <div key={term.id} className="mo-card__term">
            <p className="mo-card__single">
              <span className="mo-card__single-meta">
                {many ? <strong className="mo-card__term-name">{term.title}</strong> : null}
                {c.soon}
              </span>
              <span className="mo-card__single-price">{formatEGP(term.priceCents)}</span>
            </p>
            <div className="mo-card__foot">
              <Link
                href={`/courses/${encodeURIComponent(courseSlug)}/subscribe?plan=term&term=${encodeURIComponent(term.id)}`}
                className="mo-card__cta"
              >
                <BookOpen className="size-[18px]" aria-hidden="true" />
                {c.cta}
              </Link>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
