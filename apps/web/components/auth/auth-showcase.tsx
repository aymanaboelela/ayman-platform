import { copy } from '@ayman/contracts';
import { BrandLockup } from '@/components/brand-lockup';

const c = copy.auth.aside;

const POINTS = [c.point1, c.point2, c.point3] as const;

/**
 * The dark half of the auth split screen.
 *
 * A Server Component with no interactivity: everything here is markup and CSS,
 * so /login and /register ship the same client bundle they did when this column
 * was a mascot SVG with a focus listener attached to the document.
 *
 * The panel is dark in BOTH themes — it is a lit stage, the same decision the
 * marketing hero makes — so every colour inside it is fixed rather than read
 * from the theme-following `--n-*` scale. `auth.css` scopes those literals to
 * `.auth-aside`; nothing outside this column may reuse them.
 *
 * Hidden below the split breakpoint (`display: none`), where the form owns the
 * whole viewport. Its content is decorative reassurance, not information the
 * form needs — so dropping it on a phone costs nothing, and rendering it as a
 * stacked block above the form would push the actual inputs below the fold.
 */
export function AuthShowcase() {
  return (
    <aside className="auth-aside" aria-label={c.eyebrow}>
      <div className="auth-aside__grid" aria-hidden="true" />
      <div className="auth-aside__inner">
        <BrandLockup tone="ink" />

        <div className="auth-aside__copy">
          <p className="auth-aside__eyebrow">{c.eyebrow}</p>
          <h2 className="auth-aside__title">{c.title}</h2>
          <p className="auth-aside__body">{c.body}</p>
        </div>

        <AuthCodePane />

        <ul className="auth-aside__points">
          {POINTS.map((point) => (
            <li key={point}>
              <span className="auth-aside__tick" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none">
                  <path
                    d="M3 8.4 6.2 11.6 13 4.8"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/**
 * Decoration, and marked as such: the snippet says nothing the surrounding copy
 * does not, and read aloud token by token it is noise. Hand-tokenised rather
 * than run through Shiki — pulling the highlighter's WASM payload onto the
 * login route to colour six lines nobody reads is not a trade worth making.
 */
function AuthCodePane() {
  return (
    <div className="auth-code" aria-hidden="true">
      <div className="auth-code__bar">
        <i />
        <i />
        <i />
        <span className="auth-code__file">{copy.auth.aside.codeCaption}</span>
      </div>
      <pre className="auth-code__body">
        <code>
          <span className="auth-code__line">
            <b className="t-k">const</b> <b className="t-v">student</b> = {'{'}
          </span>
          <span className="auth-code__line">
            {'  '}
            <b className="t-a">name</b>: <b className="t-s">&apos;إنت&apos;</b>,
          </span>
          <span className="auth-code__line">
            {'  '}
            <b className="t-a">streak</b>: <b className="t-n">12</b>,
          </span>
          <span className="auth-code__line">
            {'  '}
            <b className="t-a">next</b>: <b className="t-s">&apos;lesson-04&apos;</b>,
          </span>
          <span className="auth-code__line">{'};'}</span>
          <span className="auth-code__line">
            <b className="t-f">resume</b>(<b className="t-v">student</b>);
          </span>
        </code>
      </pre>
    </div>
  );
}
