import { Mono, NeonHead } from './neon-chrome';
import { MARKERS, neonCopy } from './neon-copy';

/**
 * `// how_it_works` — the only section on this page that is NOT a block, and
 * the one place this preset adds something the tenant did not order.
 *
 * ## Why it exists at all
 *
 * A brand-new instructor's `home_blocks` table is empty, so `getHomeBlocks()`
 * serves `NEUTRAL_FALLBACK_BLOCKS` — a hero, a course grid, and the year
 * tracks. On day one the catalogue is empty too, so the tracks stand down and
 * the grid draws its empty state: the whole page is an opener and one panel
 * saying the courses are coming. That page is HONEST and it is not enough. The
 * first question a parent has after «لسه مفيش كورسات» is «طيب هي بتشتغل
 * إزاي؟», and nothing on the page answers it.
 *
 * ## Why adding it is not the same as inventing content
 *
 * Every word below describes the PLATFORM's mechanics, which are identical on
 * every deployment and true before a single row exists: you make an account,
 * you pick a course, you watch it and sit the exams. It makes no claim about
 * the instructor, names nobody, and promises nothing that has to be delivered
 * by anyone in particular. That is the line — a section that said «أفضل شرح في
 * مصر» would be the tenant's claim to make and not this component's.
 *
 * ## Where it goes, and why that is one rule and not three
 *
 * Immediately before a trailing `cta` block if the page ends with one,
 * otherwise last. See `<NeonLanding>`, which owns the placement: the closing
 * call to action has to close, and "how it works" belongs with the questions a
 * reader has just before deciding rather than after they have been asked to.
 *
 * ## The numbering is honest here, which is the whole reason it is big
 *
 * `01 → 02 → 03` is a real sequence: a reader does step one, then two, then
 * three, and the order is not an editorial choice anyone could rearrange.
 * `<NeonWhy>` numbers its items too, but small and bracketed, because those
 * are list POSITIONS and not steps — the difference is deliberate and visible.
 *
 * The rules between the steps are DASHED rather than solid, which is the same
 * distinction again: a dashed rule reads as a continuation, a solid one as a
 * boundary. Every other separator on this page is solid.
 */
export function NeonSteps({ level }: { level: 1 | 2 }) {
  const steps = [
    { title: neonCopy.step1Title, body: neonCopy.step1Body },
    { title: neonCopy.step2Title, body: neonCopy.step2Body },
    { title: neonCopy.step3Title, body: neonCopy.step3Body },
  ];

  return (
    <section className="neon-section" id="how-it-works">
      <div className="neon-shell">
        <NeonHead
          marker={MARKERS.steps}
          title={neonCopy.stepsTitle}
          lead={neonCopy.stepsLead}
          level={level}
          align="center"
        />

        <ol className="neon-steps">
          {steps.map((step, index) => (
            <li className="neon-steps__item" key={step.title}>
              {/* Hidden from the tree: the `<ol>` carries the position already,
                  and the numeral's job here is typographic — it is the largest
                  thing in the section. */}
              <Mono className="neon-steps__num" hidden>
                {String(index + 1).padStart(2, '0')}
              </Mono>
              <h3 className="neon-steps__title">{step.title}</h3>
              <p className="neon-steps__body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
