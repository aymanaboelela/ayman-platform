import { notFound, redirect } from 'next/navigation';
import { CourseOutlineSchema, LessonPlayerSchema } from '@ayman/contracts';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { CourseOutlineSidebar } from '@/components/player/course-outline';
import { LessonPlayerView } from '@/components/player/lesson-player';

/**
 * A 404 becomes `null`; everything else keeps throwing.
 *
 * Both fetches used to be wrapped in `.catch(() => null)`, which flattened
 * every possible failure into the one meaning the page goes on to assume —
 * "this course is not theirs". So a 500, a dropped connection, or a 429 from
 * the rate limiter showed a student the not-found page for a course they are
 * enrolled in: the worst available answer, because it says the thing does not
 * exist rather than that we could not reach it.
 *
 * The 404 really does mean "not enrolled, or no such lesson" —
 * `LessonAccessService` compiles ownership into the Prisma `where` and raises
 * `NotFoundException` for both, deliberately, so the catalog cannot be used as
 * an oracle. Anything else belongs to `(app)/error.tsx`, which says so and
 * offers a retry.
 */
function nullOn404(error: unknown): null {
  if (error instanceof ApiRequestError && error.status === 404) return null;
  throw error;
}

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
    apiGetAuthed(`/api/courses/${slug}/outline`, CourseOutlineSchema).catch(nullOn404),
    apiGetAuthed(`/api/lessons/${lessonId}/player`, LessonPlayerSchema).catch(nullOn404),
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
    /*
      Wider than `--w-shell` (1152px), and only here.

      The shell width is a READING measure — it exists so prose does not run to
      140 characters. This page's main object is a 16/9 video, and a video is
      the one thing on the platform that is better bigger: at 1152px minus a
      320px rail minus the gap, the player was 768px wide, which is smaller than
      the video is on YouTube in the same window. «عايز الفيديو أكبر من كده،
      بشكله أكبر وموجود فوق كده بشكل كبير.»

      1440 with a 380px outline puts the player at ~1012px — a third more
      picture — and still leaves the outline wider than it was.
    */
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Grid column order follows the writing mode: in RTL the content
          column starts at the inline start (the right) and the outline sits
          after it. No physical direction anywhere. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="min-w-0">
          {/*
            The title moved BELOW the player.

            It used to sit above it with an eyebrow and a meta line and a 2rem
            gap — about 120px of chrome before the thing the student came for,
            which on a phone is most of the first screen. The video is now the
            first pixel of content, and the title reads as its caption, which
            is what it is.
          */}
          <LessonPlayerView payload={payload} />

          <h1 className="mt-5 text-[length:var(--fs-title-3)] font-semibold">
            {payload.lesson.title}
          </h1>
          <p className="mono mt-1 text-[length:var(--fs-mono-label)] text-fg-muted">
            {payload.lesson.courseTitle} · {payload.lesson.sectionTitle}
          </p>
        </div>
        <CourseOutlineSidebar outline={outline} activeLessonId={payload.lesson.id} />
      </div>
    </main>
  );
}
