import { notFound, redirect } from 'next/navigation';
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

  // No outline means the course is not theirs to see at all — not enrolled, or
  // no such course. A 404 is the honest answer and stays one.
  if (!outline) notFound();

  /*
   * An outline WITHOUT a player payload is a different situation, and it used
   * to get the same 404.
   *
   * It means: this student is enrolled in this course, and asked for a lesson
   * the progression gate has not opened yet. That is a completely ordinary
   * thing to do — every link into a course that is built from a stale outline,
   * every bookmark, and (until this change) every «مشاهدة» button on a lesson
   * the student had not reached. What they got was a not-found page, which
   * reads as the site being broken rather than as the lesson being locked.
   *
   * `/library/[slug]` is the page that can actually explain it: it renders the
   * same outline with each lesson in its real gate state, and its locked rows
   * open a dialog naming the exact lesson standing in the way. So send them
   * there instead of to a dead end.
   *
   * A redirect, not a rendered explanation, because the explanation already
   * exists one route over and two copies of it would drift.
   */
  if (!payload) redirect(`/library/${encodeURIComponent(slug)}`);

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
