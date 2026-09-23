/**
 * The one heading shape every section on «الاستوديو» uses.
 *
 * A component and not a class name for the same reason `<BoardHeading>` is:
 * the page must emit exactly one `<h1>`, and which section carries it is not
 * knowable from inside the section — `home_blocks` is an ordered list a tenant
 * composes, so the first thing on the page might be the opener, a course grid,
 * or the FAQ. `studio-landing.tsx` decides and passes `level={1}` to that one
 * section; everything else gets `level={2}`.
 *
 * ## The chip is a word, not a tracked-out label
 *
 * Sentence case, normal weight, in the accent, with a short rule beside it —
 * NOT `ALL CAPS` with letter-spacing. Two reasons, and the second one is the
 * one that decides it:
 *
 * 1. Uppercase is not a thing Arabic has. A tracked-out Latin eyebrow over an
 *    Arabic heading is Latin typography borrowed onto a page that does not
 *    read left to right, and it looks borrowed.
 * 2. The chip's job is to say which section this is, and a reader skimming
 *    headings reads the word — spacing it out costs legibility to buy an
 *    effect this page is not trying for.
 */
export function StudioHeading({
  chip,
  title,
  lead,
  leadSecondary,
  level,
}: {
  chip?: string;
  title: string;
  lead?: string;
  /**
   * `whyRail` is the only block storing two lead paragraphs. Taken here rather
   * than rendered as a sibling for the same reason `<BoardHeading>` takes it:
   * a sibling lands below the header's own bottom margin, so an admin who
   * wrote two sentences would see them split by a full section gap.
   */
  leadSecondary?: string;
  /** 1 for the single section that owns the page heading, 2 for every other. */
  level: 1 | 2;
}) {
  const Title = level === 1 ? 'h1' : 'h2';

  return (
    <header className="st-head">
      {chip ? <p className="st-chip">{chip}</p> : null}
      <Title className="st-head__title">{title}</Title>
      {lead ? <p className="st-head__lead">{lead}</p> : null}
      {leadSecondary ? <p className="st-head__lead">{leadSecondary}</p> : null}
    </header>
  );
}
