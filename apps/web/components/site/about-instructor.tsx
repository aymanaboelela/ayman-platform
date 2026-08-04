import Image from 'next/image';
import { Code2, RefreshCw, ClipboardCheck, GraduationCap, Users, Braces } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { MediaSlot } from '@/components/site/media-slot';
import { getCredentialLogo } from '@/lib/brand-assets';

const c = copy.landing;

/**
 * Positional, like `why-rail.tsx`'s — the composer stores chip TEXT only, and
 * the Nth chip takes the Nth icon, wrapping if an editor adds more. See that
 * file for why an icon name is not a thing worth putting in the database.
 */
const CHIP_ICONS = [
  <Code2 size={18} key="code" />,
  <RefreshCw size={18} key="refresh" />,
  <ClipboardCheck size={18} key="check" />,
];

const DEFAULT_CHIPS = [c.aboutChip1, c.aboutChip2, c.aboutChip3];

/**
 * One per credit card, positional for the same reason `CHIP_ICONS` is: the
 * card says «درس» / «درّس» / «اشتغل», and a studied/taught/worked glyph is the
 * one piece of art that can be drawn for those three without borrowing anyone
 * else's. Sat at low opacity in the card's far corner, it is what gives each
 * card a face of its own — the tiles below it are deliberately uniform.
 */
const CREDIT_GLYPHS = [
  <GraduationCap size={104} strokeWidth={1.25} key="study" />,
  <Users size={104} strokeWidth={1.25} key="teach" />,
  <Braces size={104} strokeWidth={1.25} key="work" />,
];

/** One organisation. `id` keys `credentialLogos`; `short` is the monogram. */
export interface AboutMark {
  id: string;
  name: string;
  short: string;
}

/** One card of the résumé rail. Shaped by `copy.landing.aboutCredits`. */
export interface AboutCredit {
  label: string;
  marks: readonly AboutMark[];
  note: string;
}

export interface AboutInstructorProps {
  title?: string;
  body1?: string;
  body2?: string;
  body3?: string;
  role?: string;
  chips?: readonly string[];
  credits?: readonly AboutCredit[];
}

export function AboutInstructor({
  title = c.aboutTitle,
  body1 = c.aboutBody1,
  body2 = c.aboutBody2,
  body3 = c.aboutBody3,
  role = c.aboutRole,
  chips = DEFAULT_CHIPS,
  credits = c.aboutCredits,
}: AboutInstructorProps = {}) {
  return (
    <section className="site-section site-section--tint" id="about">
      {/* Copy first in the DOM: it carries the heading, so it should also be
          what a screen reader and a search crawler reach first. CSS places it
          in the inline-start column, which under `dir="rtl"` is the right —
          the side the section reads from. */}
      <div className="site-shell about__grid">
        <div className="about__body">
          <h2 className="site-h2">{title}</h2>
          {body1 ? <p className="site-lead">{body1}</p> : null}
          {body2 ? <p className="site-lead">{body2}</p> : null}
          {body3 ? <p className="site-lead">{body3}</p> : null}

          {chips.length > 0 ? (
            <div className="about__chips">
              {chips.map((chip, index) => (
                <div className="about__chip" key={`${chip}-${index}`}>
                  <span aria-hidden="true">{CHIP_ICONS[index % CHIP_ICONS.length]}</span>
                  {chip}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="about__portrait">
          <MediaSlot
            kind="portrait"
            alt={copy.site.instructor}
            sizes="(max-width: 1024px) 26rem, 32rem"
          />
          <div className="about__plate">
            <p className="about__plate-name">{copy.site.instructor}</p>
            <p className="about__plate-role">{role}</p>
          </div>
        </div>
      </div>

      {/* Below the two columns rather than inside the copy one, and that is a
          layout decision with a reason: the portrait is a fixed 3:4 box, so
          anything added to the copy column only makes the two sides less
          equal. A full-width band under both keeps the columns balanced AND
          gives the credentials the width their longest line actually needs. */}
      {credits.length > 0 ? (
        <div className="site-shell about__credits">
          {credits.map((credit, index) => (
            <article className="about__credit" key={credit.label}>
              <span className="about__credit-glyph" aria-hidden="true">
                {CREDIT_GLYPHS[index % CREDIT_GLYPHS.length]}
              </span>
              <h3 className="about__credit-label">{credit.label}</h3>
              {/* `role="list"` because `list-style: none` drops the list
                  semantics in Safari/VoiceOver, and "3 items" is the whole
                  point of announcing this as a list. */}
              <ul className="about__marks" role="list">
                {credit.marks.map((mark) => (
                  <li className="about__mark" key={mark.id}>
                    <CredentialMark mark={mark} />
                  </li>
                ))}
              </ul>
              <p className="about__credit-note">{credit.note}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * An organisation's emblem on a pale plate: its registered logo, or — for an
 * id with no file — a monogram set in the platform's own type at the identical
 * height. The same bargain `<MediaSlot>` makes for the photographs.
 *
 * ## The logo IS the name
 *
 * There is no caption under the plate, because a wordmark with its own name
 * repeated beneath it reads as a stutter — `Avnology` under a plate that
 * already says AVNOLOGY. So the `alt` carries the organisation's name and is
 * the only place it exists as text: a screen reader hears the list of names,
 * and removing it would leave this section's employers legible to sighted
 * readers alone.
 *
 * The monogram fallback is the one case that DOES caption itself, because two
 * letters are not a name.
 */
function CredentialMark({ mark }: { mark: AboutMark }) {
  const logo = getCredentialLogo(mark.id);

  if (!logo) {
    return (
      <span className="about__mark-tile about__mark-tile--mono">
        <span className="about__mark-mono" data-len={mark.short.length > 2 ? 'long' : 'short'}>
          {mark.short}
        </span>
        <span className="about__mark-name" dir="ltr">
          {mark.name}
        </span>
      </span>
    );
  }

  return (
    <span className="about__mark-tile">
      <Image
        src={logo.src}
        width={logo.width}
        height={logo.height}
        alt={mark.name}
        sizes="132px"
      />
    </span>
  );
}
