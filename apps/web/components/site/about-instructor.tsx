import { Code2, RefreshCw, ClipboardCheck } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { MediaSlot } from '@/components/site/media-slot';

const c = copy.landing;

const CHIPS = [
  { icon: <Code2 size={18} />, label: c.aboutChip1 },
  { icon: <RefreshCw size={18} />, label: c.aboutChip2 },
  { icon: <ClipboardCheck size={18} />, label: c.aboutChip3 },
];

export function AboutInstructor() {
  return (
    <section className="site-section site-section--tint" id="about">
      {/* Copy first in the DOM: it carries the heading, so it should also be
          what a screen reader and a search crawler reach first. CSS places it
          in the inline-start column, which under `dir="rtl"` is the right —
          the side the section reads from. */}
      <div className="site-shell about__grid">
        <div className="about__body">
          <h2 className="site-h2">{c.aboutTitle}</h2>
          <p className="site-lead">{c.aboutBody1}</p>
          <p className="site-lead">{c.aboutBody2}</p>

          <div className="about__chips">
            {CHIPS.map((chip) => (
              <div className="about__chip" key={chip.label}>
                <span aria-hidden="true">{chip.icon}</span>
                {chip.label}
              </div>
            ))}
          </div>
        </div>

        <div className="about__portrait">
          <MediaSlot
            kind="portrait"
            alt={copy.site.instructor}
            sizes="(max-width: 1024px) 26rem, 32rem"
          />
          <div className="about__plate">
            <p className="about__plate-name">{copy.site.instructor}</p>
            <p className="about__plate-role">{c.aboutRole}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
