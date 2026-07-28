import { copy } from '@ayman/contracts';

const c = copy.landing;

const QA: [string, string][] = [
  [c.faq1Q, c.faq1A],
  [c.faq2Q, c.faq2A],
  [c.faq3Q, c.faq3A],
  [c.faq4Q, c.faq4A],
  [c.faq5Q, c.faq5A],
];

/** Native <details> accordion — no JS, keyboard-accessible for free. */
export function Faq() {
  return (
    <div className="lp-faq">
      {QA.map(([q, a]) => (
        <details className="lp-faq__item" key={q}>
          <summary className="lp-faq__q">
            <span>{q}</span>
            <span className="lp-faq__mark" aria-hidden="true" />
          </summary>
          <p className="lp-faq__a">{a}</p>
        </details>
      ))}
    </div>
  );
}
