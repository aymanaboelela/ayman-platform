import { StudioHeading } from './studio-heading';
import { studioCopy } from './studio-copy';

/**
 * The `whyRail` block — the reasons, as a plain list with rules between them.
 *
 * ## Not cards
 *
 * Eight identical rounded boxes with identical shadows is the single most
 * recognisable generated layout there is, and it also reads wrong here: these
 * are eight statements of one argument, not eight things to choose between.
 * A list separated by hairlines says «keep reading»; a grid of cards says
 * «pick one».
 *
 * No numbering either. These are reasons, in no particular order — numbering
 * them would claim a sequence the content does not have, and a reader who
 * starts at «٣» looking for what came first finds nothing.
 */
export function StudioWhy({
  title,
  titleAccent,
  lead,
  leadSecondary,
  items,
  level,
}: {
  title: string;
  titleAccent: string;
  lead: string;
  leadSecondary: string;
  items: readonly { titleAr: string; bodyAr: string }[];
  level: 1 | 2;
}) {
  // The stored title is split across two fields; joined with a space so an
  // instructor who filled only the first still gets a clean heading.
  const heading = [title, titleAccent].filter(Boolean).join(' ');

  return (
    <section className="st-section" id="why">
      <div className="st-shell">
        <StudioHeading
          chip={studioCopy.chipWhy}
          title={heading}
          lead={lead}
          leadSecondary={leadSecondary}
          level={level}
        />

        <ul className="st-reasons">
          {items.map((item) => (
            <li className="st-reason" key={item.titleAr}>
              <h3 className="st-reason__t">{item.titleAr}</h3>
              <p className="st-reason__b">{item.bodyAr}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
