'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import { EnrollResponseSchema } from '@ayman/contracts/progress';
import { Button } from '@ayman/ui/components/button';
import { ApiRequestError, apiPost } from '@/lib/api';
import { withNext } from '@/lib/safe-next';

/**
 * The single entry point into a course from the PUBLIC course page — the one
 * button that covers both "I have never seen this platform" and "I stopped at
 * lesson 14".
 *
 * It deliberately does NOT branch on render, and that is the whole design
 * (`2026-08-03-login-gated-content-design.md` §5). `(site)/courses/[slug]` is
 * wrapped in `'use cache'` with `cacheLife('hours')`, so ONE cached HTML
 * document is served to every visitor; rendering "سجّل دخول" vs "نكمّل الكورس"
 * would mean either giving up that cache or shipping a session probe whose
 * result arrives after first paint — a button that changes its own label under
 * the cursor.
 *
 * So the branch happens on CLICK instead, where the answer is authoritative:
 *
 *   401 → not signed in  → /login?next=/courses/<slug>, and the login page
 *                          explains why they are there
 *   200 → signed in      → straight into the lesson, enrolled on the way
 *
 * Enrollment is a Prisma upsert keyed on (userId, courseId), so clicking twice
 * is not an error and an already-enrolled student resumes at
 * `resumeLessonId` — their `lastLessonId` when they have one — rather than
 * being restarted or told "already enrolled".
 */
export function CourseStartButton({
  courseId,
  slug,
  hasLessons,
}: {
  courseId: string;
  slug: string;
  hasLessons: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coursePath = `/courses/${encodeURIComponent(slug)}`;

  async function handleClick() {
    setPending(true);
    setError(null);

    try {
      const result = await apiPost(`/api/courses/${courseId}/enroll`, EnrollResponseSchema);

      if (!result.resumeLessonId) {
        // Published course, no published lessons. A real state, and navigating
        // to `/lessons/null` would be a 404 that reads like a broken button.
        setError(copy.course.noLessons);
        return;
      }

      router.push(`${coursePath}/lessons/${result.resumeLessonId}`);
    } catch (caught) {
      // 401 and ONLY 401 means "no session". Sending anything else to the
      // login form would be a lie that costs the visitor their place.
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.push(withNext('/login', coursePath));
        return;
      }

      /*
       * 403 now has a second meaning, and it is the common one.
       *
       * It used to be CSRF only — which cannot normally happen, since
       * `proxy.ts` mints `__Host-csrf` on every response including this public
       * page. `EntitlementService.enroll` refuses a course marked «مقفول» with
       * a 403 as well, and that is not an error the student can do anything
       * about by retrying: «حاول تاني» is the wrong sentence for a locked door.
       */
      if (caught instanceof ApiRequestError && caught.status === 403) {
        setError(copy.course.lockedError);
        return;
      }

      setError(copy.course.startError);
    } finally {
      // ALWAYS released, including on the two paths that navigate away.
      //
      // `pending` used to be left set on those, on the reasoning that the page
      // is leaving anyway. It is not, reliably: this button lives on a page
      // held in Next's client router cache and restored by a back navigation or
      // bfcache with its React state intact, so "leaving" can mean "coming
      // back in four seconds to a permanently disabled button". Observed
      // exactly that end-to-end — the button came back reading "ثانية واحدة…"
      // and could never be pressed again.
      //
      // The double-click it re-opens is harmless: `enroll` is an upsert, and a
      // second click resolves to the same destination.
      setPending(false);
    }
  }

  return (
    <div className="course-start">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending || !hasLessons}
        className="w-full"
      >
        {pending ? copy.course.startPending : copy.course.start}
      </Button>

      {error ? (
        <p role="alert" className="course-start__error">
          {error}
        </p>
      ) : null}

      {/* `startNote`, not `lockedNote`. The old line — «الدروس بتفتح أول ما
          تدخل بحسابك» — announced a LOCK on a page that is cached for every
          visitor alike and therefore cannot know that this one is signed in
          and already enrolled. `startNote` describes what the press will do in
          either case, which is the only kind of sentence a cached page may say
          about state. `lockedNote` survives in `ar.ts` but is rendered
          NOWHERE — it is kept solely so `student-course-entry.e2e.ts` can
          assert the page does not say it. See its docblock. */}
      {hasLessons ? (
        <p className="course-start__note">{copy.course.startNote}</p>
      ) : (
        <p className="course-start__note">{copy.course.noLessons}</p>
      )}
    </div>
  );
}
