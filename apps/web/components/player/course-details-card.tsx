import { BookOpen, Clock } from 'lucide-react';
import { copy, type CourseOutline } from '@ayman/contracts';
import { Badge, cn } from '@ayman/ui';
import { CourseArt } from '@/components/course-art';
import { StatTile } from '@/components/dashboard/stat-tile';
import { formatHoursMinutes } from '@/lib/format';

const c = copy.player.courseDetails;

/**
 * «تفاصيل الكورس» — the "about this course" framing, sitting ABOVE
 * `CourseOutlineSidebar` in the same right-hand column.
 *
 * ## Why it exists
 *
 * The reference layout the owner pointed at put a course-details card beside
 * the player; this one carries the same job with this platform's own real
 * data rather than copying the reference's fields wholesale — see the next
 * section for the two that were left out on purpose.
 *
 * ## Two stats, not four
 *
 * `totalLessons` and `totalDuration` are the ONLY figures here, and both are
 * server-computed — `outline.totalLessons` the outline already carried,
 * `outline.totalEstimatedSeconds` summed by `PlayerService.outline` for this
 * card specifically. There is deliberately no enrolled-student count (that is
 * admin-only data — `CourseAnalyticsService`'s numbers, never sent to a
 * student) and no difficulty level (no such field exists anywhere on
 * `Course`). A stat tile with nothing real behind it is worse than one fewer
 * tile; this card shows exactly the two the platform can actually back.
 *
 * ## `.tile`, not new markup
 *
 * `StatTile` is the SAME object the dashboard, `/results` and the quiz runner
 * already use for "one number, one label" — reusing it here means a student
 * who has learned to read a `.tile` anywhere on the platform reads this one
 * for free, and this file adds no new stat-row CSS of its own.
 */
export function CourseDetailsCard({ outline }: { outline: CourseOutline }) {
  return (
    <section
      aria-label={c.title}
      className="overflow-hidden rounded-lg border border-line bg-surface-2"
    >
      {/* Same guard `LibraryCourseCard` uses: an uploaded cover brings its own
          ratio and takes the full width at it, but the GENERATED scene
          (`CourseArt`'s fallback when there is no cover yet) has no intrinsic
          height and needs a box drawn for it. */}
      <div className={cn('relative overflow-hidden', !outline.course.coverKey && 'aspect-[16/8]')}>
        <CourseArt
          coverKey={outline.course.coverKey}
          subjectNameAr={outline.course.subjectNameAr}
          seed={outline.course.id}
        />
      </div>

      <div className="p-4">
        <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">
          {outline.course.title}
        </p>
        <Badge tone="neutral" className="mt-2">
          {outline.course.subjectNameAr}
        </Badge>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <StatTile
            icon={<BookOpen className="size-4" />}
            value={outline.totalLessons}
            label={c.totalLessons}
            hue={210}
          />
          <StatTile
            icon={<Clock className="size-4" />}
            value={formatHoursMinutes(outline.totalEstimatedSeconds)}
            label={c.totalDuration}
            hue={150}
          />
        </div>
      </div>
    </section>
  );
}
