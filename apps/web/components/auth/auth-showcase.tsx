import Image from 'next/image';
import { copy } from '@ayman/contracts';
import { IS_AYMAN } from '@/lib/tenant';

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
 *
 * ## The photograph
 *
 * It replaced a hand-tokenised fake code snippet that sat where the copy now
 * sits. The snippet said nothing the surrounding words did not, and it was the
 * third layer of decoration on a panel that only ever needed one. A real
 * picture of the instructor does the job the snippet was pretending to do.
 *
 * Full-bleed rather than framed, and that is a crop decision: the source is
 * 4:3 and the composition runs top to bottom — the vaulted library above, the
 * fallen robot below. A card in the old snippet's slot would have been a 16:9
 * strip through the middle and would have thrown both away. This column is
 * tall, so `cover` here shows nearly the whole frame.
 *
 * Two things went with the snippet once there was a photograph here:
 *
 *   · the `<BrandLockup>`. The form column carries one, and the eyebrow below
 *     is the brand name in words — so the screen said «منصة أ. أيمن أبو العلا»
 *     three times, once of them stamped across his chest;
 *   · the grid overlay. Ruled lines over a flat gradient read as a technical
 *     surface; the same lines over a photograph read as glass in front of it.
 *
 * ## HIS STACK ONLY, and the panel was already built to survive without it
 *
 * `/brand/auth-library.webp` is a photograph of Ayman, and /login and /register
 * are the two pages every student on every deployment sees before they have any
 * idea whose platform they are on — so on any stack but his the picture is not
 * rendered at all. Nothing else had to change: `.auth-aside` carries its own
 * three-layer gradient and `auth.css` says in as many words that it "stays as
 * the colour the column falls back to if the file never arrives". That is the
 * state this panel shipped in before the photograph existed, and it is a
 * finished lit stage rather than an empty box.
 */
export function AuthShowcase() {
  return (
    <aside className="auth-aside" aria-label={c.eyebrow}>
      {/*
        The scrim is INSIDE this branch, not beside it, and that pairing is the
        one thing worth being careful about here. It exists to make white copy
        legible over a picture — `rgb(8 9 10 / 0.97)` at the bottom, where the
        words are — and `auth.css` re-states the warm key light inside it
        precisely "because the photo now covers the background that used to
        carry it". Left rendering with no photograph under it, it would lay
        near-solid black over the panel's own gradient and double the key
        light: the designed stage would come out a muddy dark smear, which is a
        worse page than the one this gate is protecting.

        `alt=""` on purpose. The panel is decorative reassurance that the form
        does not need, and the words layered on top already say everything this
        picture is here to say — announcing it would only put a description
        between a screen-reader user and the password field.

        No `priority`: it is below the fold on every phone (the panel is
        `display: none` there) and `sizes` already tells the browser so, which
        a preload would override.
      */}
      {IS_AYMAN ? (
        <>
          <Image
            src="/brand/auth-library.webp"
            alt=""
            fill
            sizes="(min-width: 62rem) 52vw, 1px"
            className="auth-aside__photo"
          />
          <div className="auth-aside__scrim" aria-hidden="true" />
        </>
      ) : null}

      <div className="auth-aside__inner">
        <div className="auth-aside__copy">
          <p className="auth-aside__eyebrow">{c.eyebrow}</p>
          <h2 className="auth-aside__title">{c.title}</h2>
          <p className="auth-aside__body">{c.body}</p>
        </div>

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
