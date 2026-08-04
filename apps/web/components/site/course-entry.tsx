'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { copy, EnrollResponseSchema } from '@ayman/contracts';
import { ApiRequestError, apiPost } from '@/lib/api';
import { withNext } from '@/lib/safe-next';

/**
 * The generalised form of `CourseStartButton`: the same enroll-then-navigate
 * click, wrapped around ARBITRARY children and optionally aimed at a SPECIFIC
 * lesson.
 *
 * It exists because `(site)/courses/[slug]` needs that behaviour in three
 * shapes at once — the cover art, the explicit button under it, and every
 * single lesson row — and all three must resolve the same way, because all
 * three face the same constraint:
 *
 * The page is `'use cache'` + `cacheLife('hours')`, so ONE HTML document is
 * served to every visitor. It cannot know whether this one is signed in, and
 * so it cannot render "locked" or "continue" or anything else that asserts a
 * session state. Announcing a lock to a student who was already signed in and
 * already enrolled is the exact bug this component was written to remove.
 *
 * The branch therefore happens on CLICK, where the answer is authoritative and
 * costs no cache:
 *
 *   200 → enrolled (upsert, so pressing twice is not an error) → into the
 *         lesson: the one that was pressed, or `resumeLessonId` when the
 *         caller named none.
 *   401 → no session → /login?next=<the very destination that was pressed>,
 *         so signing in lands them on the lesson they asked for rather than
 *         back at the top of the course.
 *
 * Always a `<button>`, never an `<a>`. The destination is not known until the
 * response arrives, so any `href` would be a guess that JavaScript then
 * overrides — and a link whose href lies is a link that middle-click,
 * ctrl-click and "copy link address" all open to the wrong page.
 */
export function CourseEntry({
  courseId,
  slug,
  lessonId,
  className,
  children,
  ariaLabel,
  disabled = false,
}: {
  courseId: string;
  slug: string;
  /** Omit to resume where the student stopped (or start at the first lesson). */
  lessonId?: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
  /**
   * For the caller that knows, before any click, that there is nowhere to go —
   * a published course with no published lessons.
   *
   * `CourseStartButton` has always honoured that (`disabled={pending ||
   * !hasLessons}`) and says `copy.course.noLessons` underneath. The play frame
   * shipped without it, so the LARGER and more prominent of the two controls
   * on that page stayed fully pressable directly above a disabled button and a
   * line of copy saying there are no lessons — and pressing it enrolled a
   * student in an empty course, or sent a stranger through registration to
   * come back to the same empty course.
   */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coursePath = `/courses/${encodeURIComponent(slug)}`;
  /**
   * Known up front only when the caller named a lesson. That is what lets the
   * 401 path carry the real destination into `?next=` instead of dumping the
   * visitor back on the course page after they sign in.
   */
  const lessonPath = lessonId
    ? `${coursePath}/lessons/${encodeURIComponent(lessonId)}`
    : null;

  async function handleClick() {
    setPending(true);
    setError(null);

    try {
      const result = await apiPost(`/api/courses/${courseId}/enroll`, EnrollResponseSchema);

      const destination =
        lessonPath ??
        (result.resumeLessonId
          ? `${coursePath}/lessons/${encodeURIComponent(result.resumeLessonId)}`
          : null);

      if (!destination) {
        // Published course, no published lessons. A real state, and navigating
        // to `/lessons/null` would be a 404 that reads like a broken control.
        setError(copy.course.noLessons);
        return;
      }

      // A lesson this student has not unlocked is NOT handled here on purpose:
      // the server owns that decision, and
      // `(app)/courses/[slug]/lessons/[lessonId]` redirects to `/library/[slug]`
      // rather than 404ing, so they land on the outline that explains why.
      router.push(destination);
    } catch (caught) {
      // 401 and ONLY 401 means "no session". A 403 here would be CSRF — which
      // cannot normally happen, since `proxy.ts` mints `__Host-csrf` on every
      // response including this public page — and sending that to the login
      // form would be a lie that costs the visitor their place.
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.push(withNext('/login', lessonPath ?? coursePath));
        return;
      }

      setError(copy.course.startError);
    } finally {
      // ALWAYS released, including on the two paths that navigate away.
      //
      // `pending` used to be left set on those in `CourseStartButton`, on the
      // reasoning that the page is leaving anyway. It is not, reliably: these
      // controls live on a page held in Next's client router cache and
      // restored by a back navigation or bfcache with its React state intact,
      // so "leaving" can mean "coming back in four seconds to a permanently
      // disabled control". That was observed end-to-end. Do not move this.
      //
      // The double-click it re-opens is harmless: `enroll` is an upsert, and a
      // second click resolves to the same destination.
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || disabled}
        aria-busy={pending}
        aria-label={ariaLabel}
        className={className ? `course-entry ${className}` : 'course-entry'}
      >
        {children}
      </button>

      {error ? (
        <p role="alert" className="course-entry__error">
          {error}
        </p>
      ) : null}
    </>
  );
}
