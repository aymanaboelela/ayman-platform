import { Mono } from './neon-chrome';
import { MARKERS } from './neon-copy';

export interface NeonWhyProps {
  title: string;
  titleAccent: string;
  lead: string;
  leadSecondary: string;
  items: readonly { titleAr: string; bodyAr: string }[];
  level: 1 | 2;
}

/**
 * The `whyRail` block — `// why`.
 *
 * A grid of cells separated by glowing hairlines, each led by its index in
 * brackets. Nothing is boxed: the cells are defined by the rules between them,
 * which is the preset's rule for every section — sections are separated by
 * light, not by a change of ground.
 *
 * ## The index is a LIST POSITION and is hidden from the accessible tree
 *
 * `[01]`, `[02]` … is the block's own order, which an admin sets by dragging
 * the items in /admin/home. It is real, and printing it is what makes the rail
 * read as an ordered file rather than as a bag of reasons. It is NOT a
 * sequence of steps — a reader does not do `[01]` before `[02]` — which is why
 * the section that IS a sequence (`<NeonSteps>`) numbers its items in a
 * visibly different way, big and bare, rather than reusing this treatment.
 *
 * It is `aria-hidden` because the `<ol>` around it already carries the
 * position, and a screen reader that read both announces "item one, bracket
 * zero one" for every row.
 *
 * ## `titleAccent`
 *
 * Rendered immediately after the title, in the brand colour, exactly as
 * `WhyRailPropsSchema` describes and `<WhyRail>` renders it. The space between
 * them is a real character rather than a CSS margin, so a copy-paste of the
 * heading still reads as two words.
 */
export function NeonWhy({ title, titleAccent, lead, leadSecondary, items, level }: NeonWhyProps) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <section className="neon-section" id="why">
      <div className="neon-shell">
        {/*
          Not `<NeonHead>`: this is the one section whose heading is two runs —
          the title and its accented tail — and whose lead is two paragraphs.
          Bending the shared head to take either would have made every other
          caller pass `undefined` for something.
        */}
        <header className="neon-head" data-align="start">
          <p className="neon-marker">
            <Mono hidden>{`// ${MARKERS.why}`}</Mono>
          </p>
          <Heading className="neon-h">
            {title}
            {titleAccent ? <span className="neon-h__accent"> {titleAccent}</span> : null}
          </Heading>
          {lead ? <p className="neon-lead">{lead}</p> : null}
          {leadSecondary ? <p className="neon-lead">{leadSecondary}</p> : null}
        </header>

        <ol className="neon-why">
          {items.map((item, index) => (
            <li className="neon-why__cell" key={item.titleAr}>
              <Mono className="neon-why__index" hidden>
                {`[${String(index + 1).padStart(2, '0')}]`}
              </Mono>
              <h3 className="neon-why__title">{item.titleAr}</h3>
              <p className="neon-why__body">{item.bodyAr}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
