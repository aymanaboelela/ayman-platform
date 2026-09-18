import { BoardHeading } from './board-heading';
import { boardCopy } from './board-copy';

/**
 * The `about` block — the instructor's own words about the platform, centred
 * in one column.
 *
 * ## What it drops from `<AboutInstructor>`, and why
 *
 * That section is a two-column grid: copy on one side, a tall studio portrait
 * with a name plate on the other, and a full-width band of résumé cards
 * underneath carrying the organisations he studied and worked at, each as a
 * registered logo or a monogram.
 *
 * None of those three are stored on the block. `roleAr`, `body1Ar`, `body2Ar`,
 * `titleAr` and `chipsAr` are the whole of it — the portrait comes from
 * `<MediaSlot kind="portrait">` (Ayman's asset registry) and the résumé cards
 * come from `copy.landing.aboutCredits`, which is his CV: the faculty he read
 * at, the schools he taught in, the company he worked for. Rendering either on
 * another instructor's domain is the exact failure
 * `packages/contracts/src/tenant-identity-leak.spec.ts` exists to catch, and
 * there is no per-tenant equivalent of them to swap in — this platform has no
 * field for an instructor's employer.
 *
 * So this preset renders the stored block and nothing else. Every word on
 * screen is a word the tenant typed into /admin/home.
 *
 * ## `roleAr` moved above the body
 *
 * On `classic` it is the second line of the portrait's name plate. With no
 * portrait there is no plate, and a role line stranded at the bottom of a
 * centred column reads as a caption for nothing. It sits directly under the
 * heading here, which is where a subtitle belongs.
 *
 * ## The chips are plain pills, on purpose
 *
 * `<AboutInstructor>` gives each chip a positional lucide glyph. This preset
 * already spends its icon budget on `<BoardFeatures>`, where a filled circular
 * badge on every card is the section's whole visual idea. Repeating the motif
 * three sections later on three short pills makes neither of them read as
 * deliberate — so the chips here carry text and a fill, and the badges stay
 * the feature grid's own signature.
 */
export function BoardAbout({
  title,
  body1,
  body2,
  role,
  chips,
  level,
}: {
  title: string;
  body1: string;
  body2: string;
  role: string;
  chips: readonly string[];
  level: 1 | 2;
}) {
  return (
    <section className="board-band" id="about">
      <div className="board-shell">
        <BoardHeading chip={boardCopy.about.chip} title={title} lead={role} level={level} />

        <div className="board-about">
          {body1 ? <p className="board-about__p">{body1}</p> : null}
          {body2 ? <p className="board-about__p">{body2}</p> : null}

          {chips.length > 0 ? (
            <ul className="board-about__chips" role="list">
              {chips.map((chip, index) => (
                <li className="board-about__chip" key={`${chip}-${index}`}>
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
