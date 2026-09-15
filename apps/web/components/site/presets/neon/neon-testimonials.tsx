import { NeonHead, NeonWindow } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonTestimonialsProps {
  title: string;
  items: readonly { nameAr: string; bodyAr: string }[];
  level: 1 | 2;
}

/**
 * The `testimonials` block — `// students`.
 *
 * `<blockquote>` inside `<figure>` with the attribution in `<figcaption>`,
 * exactly as the classic section builds it: a testimonial is an attributed
 * quotation and that pairing is the only thing that tells a screen reader who
 * said it. Two stacked `<p>`s look identical and say nothing.
 *
 * ## No avatars, and no stars
 *
 * `TestimonialsPropsSchema` stores an optional `avatarAssetId` and NOTHING on
 * the platform reads it — the composer writes it, the classic section ignores
 * it, and an asset id is not resolvable to a URL from here anyway (the API
 * resolves ids to storage keys, and only for the three branding assets). So an
 * initial in a bracket stands in, which is what `<SiteTestimonials>` settled on
 * and for the same reason: a broken image box under somebody's name is worse
 * than a letter.
 *
 * Stars would be a second reason. There is no rating in this payload, so any
 * number of them would be decoration pretending to be data — on the one
 * section of the page whose entire job is to be believed.
 *
 * ## The window filename is the speaker's initial, not their name
 *
 * A filename is Latin and monospace by construction here, and a transliterated
 * Arabic name would be something nobody chose and nobody can check. `student`
 * with the row's index is honest chrome instead.
 */
export function NeonTestimonials({ title, items, level }: NeonTestimonialsProps) {
  if (items.length === 0) return null;

  return (
    <section className="neon-section" id="testimonials">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.testimonials} title={title} level={level} />

        <ul className="neon-grid">
          {items.map((item, index) => (
            <li className="neon-quote" key={`${item.nameAr}-${index}`}>
              <NeonWindow file={`student_${String(index + 1).padStart(2, '0')}`}>
                <figure className="neon-quote__fig">
                  <blockquote className="neon-quote__body">{item.bodyAr}</blockquote>
                  <figcaption className="neon-quote__who">
                    <span className="neon-quote__initial" aria-hidden="true">
                      {item.nameAr.trim().charAt(0)}
                    </span>
                    {item.nameAr}
                  </figcaption>
                </figure>
              </NeonWindow>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
