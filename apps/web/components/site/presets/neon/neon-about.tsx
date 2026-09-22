import Image from 'next/image';

import { mediaUrl } from '@ayman/ui/branding';

import { Mono, NeonHead, NeonWindow } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonAboutProps {
  title: string;
  body1: string;
  body2: string;
  role: string;
  chips: readonly string[];
  /** The block's own picture, already resolved to a storage key by the API. */
  imageKey: string | null;
  /**
   * The block's key, which is the section's anchor.
   *
   * ⚠️ NOT the literal `about`. This block type is addable more than once —
   * one section can be «why this subject is easier than you think» over a wide
   * photograph and another «who is teaching it» over a portrait — and two
   * sections sharing an `id` is invalid HTML that silently breaks in-page
   * links and `aria-labelledby` for whichever one loses.
   */
  blockKey: string;
  level: 1 | 2;
}

/**
 * The `about` block — `// about`, rendered as `about.md`.
 *
 * Every word is the admin's: the title, both paragraphs, the role line, the
 * chips and now the picture all come off the stored block. Nothing about a
 * person is hardcoded anywhere in this file, which is the point — the classic
 * section this replaces (`<AboutInstructor>`) is laid out around a photograph
 * and a CV that belong to one instructor.
 *
 * ## The picture is optional, and wide
 *
 * `imageKey` is whatever the admin picked in /admin/home, resolved to a
 * storage key server-side — a block payload carries only the asset's UUID, and
 * `mediaUrl()` needs the key. Leave it unset and the section renders exactly
 * as it did before it existed, which is what every stack that has not chosen
 * one gets.
 *
 * It sits ABOVE the window rather than beside it, in a 2:1 band. Beside would
 * mean a column of text at half width on a page whose whole grid is full-bleed
 * mono, and a portrait crop would collide with `<NeonInstructor>` below, which
 * already draws the instructor 3:4. Two pictures of one person in two shapes
 * on one page reads as a mistake even when both are deliberate.
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
export function NeonAbout({
  title,
  body1,
  body2,
  role,
  chips,
  imageKey,
  blockKey,
  level,
}: NeonAboutProps) {
  return (
    <section className="neon-section" id={blockKey}>
      <div className="neon-shell">
        <NeonHead marker={MARKERS.about} title={title} level={level} />

        <div className="neon-about">
          {imageKey ? (
            /* `alt=""` and `aria-hidden`: the heading and the paragraphs below
               already say who this is and what the section is for, so a
               description here would be the third time a screen reader hears
               the same thing. The picture is illustration, not information. */
            <div className="neon-about__figure" aria-hidden="true">
              <Image
                src={mediaUrl(imageKey)}
                alt=""
                width={1200}
                height={600}
                sizes="(max-width: 60rem) 100vw, 60rem"
                className="neon-about__image"
              />
            </div>
          ) : null}

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
