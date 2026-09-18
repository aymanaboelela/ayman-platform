/**
 * The one heading shape every section on «اللوح» uses: a small pill chip, a
 * large heavy title, and a single line underneath it — all centred.
 *
 * ## Why it is a component and not a class name
 *
 * Because of `level`. The page must emit EXACTLY ONE `<h1>`, and which section
 * carries it is not knowable from inside the section: `home_blocks` is an
 * ordered list a tenant composes, so the first thing on the page might be the
 * opener panel, or a course grid, or — for an admin who deleted the hero
 * block — the FAQ. `board-landing.tsx` works out which block owns the page
 * heading and passes `level={1}` to exactly that one; everything else gets
 * `level={2}`. A bare CSS class cannot make that decision, and hard-coding
 * `<h2>` in every section would leave a page with no `<h1>` at all whenever
 * the hero is absent — which axe reports, and which is a genuine failure for
 * anyone navigating by headings.
 *
 * `role`/`aria-level` were considered and rejected: a real `<h1>` element is
 * what search crawlers, reader modes and the AI scrapers all read, and none of
 * those run the accessibility tree.
 *
 * ## The chip is decoration with words in it
 *
 * It is NOT `aria-hidden`: it names the section («الصفوف», «الكورسات») and a
 * reader arriving on the heading gets the category before the title. But it is
 * also never the only place a fact appears — every section's title stands on
 * its own if the chip is removed.
 */
export function BoardHeading({
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
   * The `whyRail` block is the only one that stores TWO lead paragraphs
   * (`leadAr` and `leadSecondaryAr`), and it is taken here rather than
   * rendered as a sibling of this header on purpose: a sibling would land
   * BELOW `.board-head`'s bottom margin, so an admin who wrote two sentences
   * would see them separated by the full section gap with the grid pushed
   * down behind it. Inside the header it is simply the second line of the
   * same block, which is what it is.
   *
   * Silently rendering only the first would be worse than either: the field
   * would look broken in the composer, with no way to tell from the page that
   * the text had been accepted and dropped.
   */
  leadSecondary?: string;
  /** 1 for the single section that owns the page heading, 2 for every other. */
  level: 1 | 2;
}) {
  const Title = level === 1 ? 'h1' : 'h2';

  return (
    <header className="board-head">
      {chip ? <span className="board-chip">{chip}</span> : null}
      <Title className="board-head__title">{title}</Title>
      {lead ? <p className="board-head__lead">{lead}</p> : null}
      {leadSecondary ? (
        <p className="board-head__lead board-head__lead--2">{leadSecondary}</p>
      ) : null}
    </header>
  );
}
