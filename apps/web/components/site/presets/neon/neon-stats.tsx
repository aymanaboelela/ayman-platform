import { Mono, NeonHead } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonStatsProps {
  title: string;
  items: readonly { labelAr: string; value: string }[];
  level: 1 | 2;
}

/**
 * The `stats` block — `// stats`.
 *
 * The figures are the largest monospace on the page after the step numerals,
 * which is the preset's whole typographic rule stated once: Arabic carries the
 * words, the mono face carries the data.
 *
 * ## `value` is a STRING and is printed exactly as stored
 *
 * `StatsPropsSchema` types it `z.string().max(20)`, so an editor writes
 * «+1200» or «4.9/5» or «24/7» — none of which is a number this component gets
 * to reformat, and all of which are Latin runs with neutral characters in
 * them. That is precisely the shape the bidi algorithm reorders: «+1200»
 * becomes «1200+» in an RTL line, and «24/7» becomes «7/24». `<Mono>` isolates
 * every one of them.
 *
 * ## The title is optional in the schema and the section still has to work
 *
 * `titleAr` defaults to `''`. With no title there is no heading, and the marker
 * alone leads the section — which is legitimate, because the figures under it
 * label themselves. `<NeonHead>` renders no element at all for an empty title
 * rather than an empty `<h2>`, so nothing lands in the outline with no text
 * in it.
 */
export function NeonStats({ title, items, level }: NeonStatsProps) {
  if (items.length === 0) return null;

  return (
    <section className="neon-section" id="stats">
      <div className="neon-shell">
        <NeonHead marker={MARKERS.stats} title={title} level={level} align="center" />

        <ul className="neon-stats">
          {items.map((item) => (
            <li className="neon-stats__item" key={item.labelAr}>
              <Mono className="neon-stats__value">{item.value}</Mono>
              <span className="neon-stats__label">{item.labelAr}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
