import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { copy } from '@ayman/contracts';
import { getCatalog } from '@/lib/catalog';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0
    ? `${hours} ${copy.catalog.hours} ${minutes} ${copy.catalog.minutes}`
    : `${minutes} ${copy.catalog.minutes}`;
}

export const metadata = { title: copy.catalog.title };

export default async function CoursesPage() {
  const { courses } = await getCatalog();

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <p className="eyebrow mb-2">{copy.catalog.eyebrow}</p>
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">{copy.catalog.title}</h1>
      <p className="mb-10 max-w-[var(--w-prose)] text-fg-muted">{copy.catalog.subtitle}</p>

      {courses.length === 0 ? (
        <p className="text-fg-muted">{copy.catalog.empty}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <li key={course.id}>
              <Card>
                <CardHeader className="flex items-start justify-between gap-3">
                  <CardTitle>
                    <Link href={`/courses/${course.slug}`} className="text-fg">
                      {course.title}
                    </Link>
                  </CardTitle>
                  <Badge tone="accent">{copy.catalog.free}</Badge>
                </CardHeader>
                <CardBody className="space-y-3">
                  {course.subtitle ? <p className="text-fg-muted">{course.subtitle}</p> : null}
                  <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                    {course.systemNameAr} · {course.subjectNameAr}
                    {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''}
                  </p>
                  <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted tabular-nums">
                    {course.lessonCount} {copy.catalog.lessonCount} ·{' '}
                    {formatDuration(course.totalSeconds)}
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
