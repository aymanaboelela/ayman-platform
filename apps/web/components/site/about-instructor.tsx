import { Code2, RefreshCw, ClipboardCheck } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { MediaSlot } from '@/components/site/media-slot';

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

export interface AboutInstructorProps {
  title?: string;
  body1?: string;
  body2?: string;
  role?: string;
  chips?: readonly string[];
}

export function AboutInstructor({
  title = c.aboutTitle,
  body1 = c.aboutBody1,
  body2 = c.aboutBody2,
  role = c.aboutRole,
  chips = DEFAULT_CHIPS,
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
    </section>
  );
}
