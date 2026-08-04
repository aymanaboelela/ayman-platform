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
 * The heading disappears when a group is the only cell AND it is the untracked
 * one: «عام» above a single grid, with nothing to contrast it against, is a
 * label that adds a line of chrome and no information.
 */
export function TrackCell({ group, alone }: { group: LibraryTrackGroup; alone: boolean }) {
  const bare = alone && group.key === '';

  return (
    <div>
      {bare ? null : (
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">{group.labelAr}</h3>
          <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
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
      <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
        <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">{group.labelAr}</h2>
        <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
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
