import Link from 'next/link';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { Card, CardBody } from '@ayman/ui';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  // Resume where they stopped when we know, otherwise the course page picks
  // the first lesson — never a dead link either way.
  const href = course.lastLessonId
    ? `/courses/${course.slug}/lessons/${course.lastLessonId}`
    : `/courses/${course.slug}`;

  return (
    <Card>
      <CardBody className="space-y-3">
        <Link href={href} className="block text-[length:var(--fs-title-4)] font-medium">
          {course.title}
        </Link>

        <LessonProgressBar percent={course.progressPercent} label={copy.player.courseProgress} />

        <p className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
          {course.completedLessons} {copy.player.lessonsCompleted} {course.totalLessons}
        </p>
      </CardBody>
    </Card>
  );
}
