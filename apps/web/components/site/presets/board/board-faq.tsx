import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The `faq` block — the plain native accordion, and nothing on top of it.
 *
 * ## Why there is no GSAP height tween here
 *
 * `<SiteFaq>` is `'use client'` and takes the toggle over completely: it
 * cancels the native one with `preventDefault`, tweens the panel height, and
 * closes the siblings through the same tween so the swap stays in sync. It is
 * good work and it exists because `<details>` cannot be transitioned — the
 * browser flips `display` and there is no height to animate between.
 *
 * This preset does not take that trade. The whole page is server-rendered with
 * no client boundary, and this section would be the only thing that put a
 * JavaScript bundle on the landing page's LCP path — for a 420ms open. What is
 * left when the enhancement is removed is not a degraded FAQ: it is the
 * element `<SiteFaq>` is built ON, with correct semantics, keyboard handling,
 * find-in-page and screen-reader expanded state for free, working before
 * hydration and without it. That matters most precisely here, because the FAQ
 * is the content search engines and no-JS readers most need. It is also
 * exactly what every reader with `prefers-reduced-motion` already gets on
 * `classic`, where `useGsap` returns early and none of the listeners are ever
 * attached.
 *
 * ## `name` keeps the accordion exclusive
 *
 * The native `name` attribute closes the siblings for us, which is the one
 * thing the enhanced version had to reimplement. With no tween to keep in sync
 * there is nothing wrong with the instant close it produces.
 *
 * ## The first row is open
 *
 * A column of ten closed bars gives a reader nothing to read and no reason to
 * believe there is anything behind them. Same call `<SiteFaq>` makes.
 *
 * ⚠️ The structured data is NOT emitted here — `board-landing.tsx` renders
 * `<JsonLd data={faqPageJsonLd(items)} />` beside this section, in the same
 * branch, for the same reason `classic` does it inside its own `case`: the
 * markup must be fed the rows this block actually renders and must leave with
 * it, so unpublishing the FAQ cannot leave a page advertising answers it no
 * longer shows.
 */
export function BoardFaq({
  title,
  eyebrow,
  rows,
  level,
}: {
  title: string;
  eyebrow: string;
  rows: readonly { questionAr: string; answerAr: string }[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band" id="faq">
      <div className="board-shell">
        {title ? (
          <BoardHeading chip={eyebrow || boardCopy.faq.chip} title={title} level={level} />
        ) : null}

        <div className="board-faq">
          {rows.map((row, index) => (
            <details
              className="board-faq__item"
              key={`${row.questionAr}-${index}`}
              open={index === 0}
              name="board-faq"
            >
              <summary className="board-faq__q">
                <span>{row.questionAr}</span>
                {/* The +/− drawn in CSS rather than as an icon component: it is
                    two rules that rotate, it has to react to `[open]` with no
                    JavaScript watching, and a lucide glyph could not. */}
                <span className="board-faq__mark" aria-hidden="true" />
              </summary>
              <p className="board-faq__a">{row.answerAr}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
