import { notFound } from 'next/navigation';
import { CourseOutlineSchema, LessonPlayerSchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { CourseOutlineSidebar } from '@/components/player/course-outline';
import { LessonPlayerView } from '@/components/player/lesson-player';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;

  // Two parallel fetches, not one endpoint: the outline is stable across
  // lesson navigations and the lesson body is not. Both are authenticated —
  // the guard's 404 for "not enrolled" is exactly what makes `notFound()`
  // below a rendering decision rather than an authorization one.
  const [outline, payload] = await Promise.all([
    apiGetAuthed(`/api/courses/${slug}/outline`, CourseOutlineSchema).catch(() => null),
    apiGetAuthed(`/api/lessons/${lessonId}/player`, LessonPlayerSchema).catch(() => null),
  ]);

  if (!outline || !payload) notFound();

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <p className="eyebrow mb-2">{copy.player.eyebrow}</p>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold">{payload.lesson.title}</h1>
      <p className="mono mb-8 text-[length:var(--fs-mono-label)] text-fg-muted">
        {payload.lesson.courseTitle} · {payload.lesson.sectionTitle}
      </p>

      {/* Grid column order follows the writing mode: in RTL the content
          column starts at the inline start (the right) and the outline sits
          after it. No physical direction anywhere. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <LessonPlayerView payload={payload} />
        </div>
        <CourseOutlineSidebar outline={outline} activeLessonId={payload.lesson.id} />
      </div>
    </main>
  );
}
