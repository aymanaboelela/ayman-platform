import { shortFollowerCount } from '@ayman/contracts/admin/social-counts';
import { socialCountsCopy as c } from '@ayman/contracts/copy/social-counts';
import { SOCIAL_MARKS, SocialIcon, inkBrand, type SocialMark } from '@/components/site/social-icons';
import { SocialFigure } from '@/components/site/social-figure';
import { loadSocialCountItems } from '@/components/site/social-counts';

/**
 * «عدد السوشيال ميديا» on the classic landing — a band directly under the hero.
 *
 * ## Why here, and not in the instructor card where it started
 *
 * The figures are social proof, and social proof works in the first scroll or
 * not at all: tucked into `<InstructorProfile>` they sat several sections down,
 * as a row of small chips under the course count, and the ask was the
 * opposite — «في الهوم بيدج بشكل حلو… يظهر». So the band follows the hero
 * (`page.tsx`, the `hero` case), and the card no longer carries a second copy
 * of the same numbers.
 *
 * ## What it shows
 *
 * The combined figure, summed from the RAW counts and only then shortened —
 * the sum of four rounded-down figures would understate it — and only with two
 * networks or more; with one it would just repeat the card beside it. Then one
 * card per network: the app-icon plate in its own colours, the figure, what it
 * counts, and «زيارة القناة» to the profile — the same link the footer's icon
 * uses (`loadSocialCountItems`).
 *
 * ## It renders NOTHING by default
 *
 * `null` unless the `socialCounts` feature is on AND a non-zero figure was
 * typed, so a stack without it — and Ayman's page until his are entered —
 * serves exactly the HTML it served before this existed.
 *
 * A server component; the only client code is `<SocialFigure>`'s count-up.
 */
export async function SocialProofBand() {
  const items = await loadSocialCountItems();
  if (items.length === 0) return null;

  const total = items.length > 1 ? shortFollowerCount(items.reduce((sum, item) => sum + item.count, 0)) : null;

  return (
    <section
      className="social-proof"
      aria-labelledby={total ? 'social-proof-total' : undefined}
      aria-label={total ? undefined : c.listLabel}
    >
      <div className="site-shell">
        <div className="social-proof__panel" data-count={items.length}>
          {total ? (
            <div className="social-proof__head">
              <h2 className="social-proof__total" id="social-proof-total">
                <span className="social-proof__total-n">
                  <SocialFigure text={total} />
                </span>
                <span className="social-proof__total-l">{c.band.totalLabel}</span>
              </h2>
              <span className="social-proof__stack" aria-hidden="true">
                {items.map((item) => (
                  <Plate key={item.network} mark={SOCIAL_MARKS[item.network]} className="social-proof__dot" size={14} />
                ))}
              </span>
            </div>
          ) : null}

          <ul className="social-proof__list" role="list">
            {items.map((item) => {
              const mark: SocialMark = SOCIAL_MARKS[item.network];
              const network = c.networks[item.network];
              const body = (
                <>
                  <Plate mark={mark} className="social-proof__icon" size={22} />
                  <span className="social-proof__n">
                    <SocialFigure text={item.figure} />
                  </span>
                  <span className="social-proof__l">{item.label}</span>
                  {item.href ? (
                    <span className="social-proof__go">
                      {network.visit}
                      <ExternalGlyph />
                    </span>
                  ) : null}
                </>
              );
              return (
                <li
                  key={item.network}
                  className="social-proof__card"
                  // Brand colour for the card's accents, and the variant a dark
                  // theme needs (`SocialMark.inkHex`) — read the way the footer's
                  // `.social__link` reads them.
                  style={{
                    ['--brand' as string]: mark.hex,
                    ['--brand-ink' as string]: inkBrand(mark),
                  }}
                >
                  {item.href ? (
                    <a
                      className="social-proof__link"
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${item.figure} ${item.label}، ${network.visit} ${c.band.newTab}`}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="social-proof__link">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** The app-icon plate: the mark in white on the brand's own fill. */
function Plate({ mark, className, size }: { mark: SocialMark; className: string; size: number }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        ['--plate' as string]: mark.plate ?? mark.hex,
        ...(mark.plateGlyphFx ? { ['--plate-fx' as string]: mark.plateGlyphFx } : {}),
      }}
    >
      <SocialIcon mark={mark} size={size} />
    </span>
  );
}

/** «بيفتح برّه الموقع» — the link leaves the site, in a 12px glyph. */
function ExternalGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="social-proof__ext">
      <path d="M4.5 2.5h5v5M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
