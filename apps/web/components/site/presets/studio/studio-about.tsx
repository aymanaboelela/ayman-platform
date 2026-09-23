import Image from 'next/image';

import { mediaUrl } from '@ayman/ui/branding';

import { StudioHeading } from './studio-heading';

export interface StudioAboutProps {
  title: string;
  body1: string;
  body2: string;
  role: string;
  chips: readonly string[];
  imageKey: string | null;
  blockKey: string;
  level: 1 | 2;
}

/**
 * The `about` block — text and, optionally, a picture beside it.
 *
 * ## Beside, not above
 *
 * «الترمينال» stacks the picture over the text in a 2:1 band because its
 * column is a fixed narrow measure and a side-by-side would leave the words at
 * half of it. This preset's grid is already two columns wide, so the natural
 * placement is a real one: the picture holds one column and the prose the
 * other, alternating sides between consecutive `about` blocks so a page with
 * two of them does not read as the same section twice.
 *
 * The alternation is `:nth-of-type` in CSS, not a prop — which block comes
 * second is a fact about the composed page, and threading an index through
 * for a purely visual rhythm would put layout state in the data path.
 *
 * ## The id is the block key
 *
 * This type is addable more than once, and two sections sharing `id="about"`
 * is invalid HTML whose in-page links break silently.
 */
export function StudioAbout({
  title,
  body1,
  body2,
  role,
  chips,
  imageKey,
  blockKey,
  level,
}: StudioAboutProps) {
  return (
    <section className="st-section st-about" id={blockKey} data-figure={imageKey ? 'true' : undefined}>
      <div className="st-shell st-about__grid">
        <div className="st-about__copy">
          <StudioHeading title={title} lead={role} level={level} />
          {body1 ? <p className="st-prose">{body1}</p> : null}
          {body2 ? <p className="st-prose">{body2}</p> : null}

          {chips.length > 0 ? (
            <ul className="st-pills">
              {chips.map((chip) => (
                <li className="st-pill" key={chip}>
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {imageKey ? (
          /*
            `aria-hidden` and `alt=""`: the heading and both paragraphs beside
            it already say who this is and what the section is for. A described
            photograph would be the third time a screen reader hears it.
          */
          <div className="st-about__figure" aria-hidden="true">
            <Image
              className="st-about__image"
              src={mediaUrl(imageKey)}
              alt=""
              width={1200}
              height={900}
              sizes="(max-width: 60rem) 100vw, 30rem"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
