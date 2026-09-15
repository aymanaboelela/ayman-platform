import { Mono, NeonHead } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonFaqProps {
  title: string;
  eyebrow: string;
  rows: readonly { questionAr: string; answerAr: string }[];
  level: 1 | 2;
}

/**
 * The `faq` block — `// faq`.
 *
 * ## `<details>`, and no JavaScript at all
 *
 * The classic accordion is a `<details>` with a GSAP height tween on top. This
 * one is the element on its own, and that is a feature rather than a cut
 * corner: it works in the server HTML, before hydration and without it; it is
 * focusable and operable from the keyboard for free; it announces its own
 * expanded state to a screen reader; a tap opens it on touch. The whole preset
 * ships zero client JavaScript and this is the one interactive thing on the
 * page — adding a boundary here would be the reason a reader on a throttled
 * phone cannot open an answer.
 *
 * The open/closed marker is the `+` / `−` in the summary, swapped by CSS on
 * `[open]`. It is `aria-hidden` because `<details>` already exposes the state;
 * a screen reader that read the glyph too would say «plus» before every
 * question.
 *
 * ## The JSON-LD is NOT emitted here
 *
 * `<NeonLanding>` renders `faqPageJsonLd(props.items)` beside this section,
 * fed the same rows, exactly as `page.tsx` does for the classic page — inside
 * the block's own branch rather than at page level, so unpublishing the FAQ
 * takes the structured data with it instead of leaving markup advertising
 * answers the page no longer shows.
 *
 * ## `eyebrowAr` is dropped
 *
 * The section already has a marker above its heading — `// faq` — and that
 * marker IS the eyebrow on this preset. Printing the block's own eyebrow as
 * well would put two labels above one `<h2>`, which is the shape the classic
 * page uses and the shape this one deliberately does not. Nothing is lost that
 * the heading beneath it does not already say.
 */
export function NeonFaq({ title, rows, level }: NeonFaqProps) {
  if (rows.length === 0) return null;

  return (
    <section className="neon-section" id="faq">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.faq} title={title} level={level} />

        <ul className="neon-faq">
          {rows.map((row, index) => (
            <li key={`${row.questionAr}-${index}`}>
              <details className="neon-faq__row">
                <summary className="neon-faq__q">
                  <Mono className="neon-faq__sigil" hidden>
                    ?
                  </Mono>
                  <span className="neon-faq__q-text">{row.questionAr}</span>
                  <span className="neon-faq__toggle" aria-hidden="true" />
                </summary>
                <p className="neon-faq__a">{row.answerAr}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
