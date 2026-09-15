import { Mono, NeonHead, NeonWindow } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonAboutProps {
  title: string;
  body1: string;
  body2: string;
  role: string;
  chips: readonly string[];
  level: 1 | 2;
}

/**
 * The `about` block — `// about`, rendered as `about.md`.
 *
 * Every word is the admin's: the title, both paragraphs, the role line and the
 * chips all come off the stored block. Nothing about a person is hardcoded
 * anywhere in this file, which is the point — the classic section this
 * replaces (`<AboutInstructor>`) is laid out around a photograph and a CV, and
 * this preset has neither to draw on.
 *
 * ## The chips are a mono tag row, not pills
 *
 * `chipsAr` is at most four short strings — on the shipped page they are
 * credentials. They render as `#tag`-style monospace runs because that is what
 * this page does with a short label, and because a row of rounded accent pills
 * is the single most recognisable piece of the classic surface.
 *
 * The `#` is `aria-hidden` ornament and the Arabic beside it is the chip: a
 * screen reader that read the sigil would announce "hash" four times in a row
 * for no meaning at all.
 */
export function NeonAbout({ title, body1, body2, role, chips, level }: NeonAboutProps) {
  return (
    <section className="neon-section" id="about">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.about} title={title} level={level} />

        <div className="neon-about">
          <NeonWindow file="about.md">
            {role ? <p className="neon-about__role">{role}</p> : null}
            {body1 ? <p className="neon-about__body">{body1}</p> : null}
            {body2 ? <p className="neon-about__body">{body2}</p> : null}

            {chips.length > 0 ? (
              <ul className="neon-tags">
                {chips.map((chip) => (
                  <li className="neon-tag" key={chip}>
                    <Mono className="neon-tag__sigil" hidden>
                      #
                    </Mono>
                    <span>{chip}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </NeonWindow>
        </div>
      </div>
    </section>
  );
}
