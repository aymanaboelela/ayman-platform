import { copy } from '@ayman/contracts';

const c = copy.landing;

const ROWS = [
  [c.faq1Q, c.faq1A],
  [c.faq6Q, c.faq6A],
  [c.faq2Q, c.faq2A],
  [c.faq4Q, c.faq4A],
  [c.faq7Q, c.faq7A],
  [c.faq3Q, c.faq3A],
  [c.faq5Q, c.faq5A],
] as const;

/**
 * Built on `<details>` rather than a JS disclosure: the FAQ is the one section
 * whose content search engines and no-JS readers most need, and the native
 * element gives correct semantics, keyboard handling and find-in-page for free.
 *
 * The first row is open on load so the pattern is legible without a click.
 */
export function SiteFaq() {
  return (
    <section className="site-section" id="faq">
      <div className="site-shell">
        <h2 className="site-h2" style={{ textAlign: 'center' }}>
          {c.faqTitle}
        </h2>

        <div className="faq__panel">
          {ROWS.map(([question, answer], i) => (
            <details className="faq__item" key={question} open={i === 0} name="site-faq">
              <summary className="faq__q">
                <span>{question}</span>
                <span className="faq__mark" aria-hidden="true" />
              </summary>
              <p className="faq__a">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
