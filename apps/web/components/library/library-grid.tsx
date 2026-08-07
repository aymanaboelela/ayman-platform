import { copy } from '@ayman/contracts';
import type { LibraryTrackGroup, LibraryYearGroup } from '@/lib/library';
import { LibraryCourseCard } from './library-course-card';

const c = copy.library;

/**
 * One track cell — «لغات», «علمي», «عام» — as a labelled grid.
 *
 * The heading is an `<h3>` because every caller nests it under a section that
 * already owns an `<h2>` («كورساتك», «الصف الأول بكالوريا»). Two levels is the
 * whole structure: year, then track. A third would be a subject, and the
 * subject already lives on the card.
 *
 * ## Why this is NOT a `.group-head`
 *
 * `.group-head` is the h2 object — a ember bar, a title-3 and a rule across
 * the column. Giving the track cell the same one would draw the year and the
 * track at identical weight, and a hierarchy whose two levels look the same is
 * not a hierarchy. The cell gets the quieter half of the same vocabulary
 * instead: a ember DOT rather than a bar, the title one step down, and the
 * count in `text-study` so the ember still says "this is a grouping".
 *
 * The heading disappears when a group is the only cell AND it is the untracked
 * one: «عام» above a single grid, with nothing to contrast it against, is a
 * label that adds a line of chrome and no information.
 */
export function TrackCell({ group, alone }: { group: LibraryTrackGroup; alone: boolean }) {
  const bare = alone && group.key === '';

  return (
    <div>
      {bare ? null : (
        <div className="mb-3 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-stage"
          />
          <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">{group.labelAr}</h3>
          <span className="mono tabular ms-auto shrink-0 text-[length:var(--fs-mono-label)] text-study">
            {c.courseCount.replace('{n}', String(group.courses.length))}
          </span>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {group.courses.map((course) => (
          <LibraryCourseCard course={course} key={course.id} />
        ))}
      </ul>
    </div>
  );
}

/** A whole year under «باقي الصفوف», with its track cells inside it. */
export function YearSection({ group }: { group: LibraryYearGroup }) {
  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{group.labelAr}</h2>
        <span className="group-head__count">
          {c.courseCount.replace('{n}', String(group.courseCount))}
        </span>
      </div>
      <div className="flex flex-col gap-8">
        {group.tracks.map((track) => (
          <TrackCell group={track} key={track.key} alone={group.tracks.length === 1} />
        ))}
      </div>
    </section>
  );
}
