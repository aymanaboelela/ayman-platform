import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/**
 * The `faq` block — real `<details>`, one per question.
 *
 * Native disclosure rather than a scripted accordion: it works before hydration,
 * it is keyboard-operable and announced correctly with no ARIA to maintain, and
 * a browser's own find-in-page can open one to reveal a match. None of that is
 * true of a `useState` list, and none of it is worth re-implementing for a
 * section whose whole behaviour is «show the answer».
 *
 * Every panel is closed on load. An open first item is a common default and it
 * costs the reader the one thing the section is for — seeing all the questions
 * at once and choosing.
 */
export function StudioFaq({
  eyebrow,
  title,
  items,
  level,
}: {
  eyebrow: string;
  title: string;
  items: readonly { questionAr: string; answerAr: string }[];
  level: 1 | 2;
}) {
  return (
    <section className="st-section" id="faq">
      <div className="st-shell st-shell--narrow">
        <StudioHeading chip={eyebrow || studioCopy.chipFaq} title={title} level={level} />

        <div className="st-faq">
          {items.map((item) => (
            <details className="st-q" key={item.questionAr}>
              <summary className="st-q__q">{item.questionAr}</summary>
              <p className="st-q__a">{item.answerAr}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
