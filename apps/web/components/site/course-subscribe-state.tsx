'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { z } from '@ayman/contracts/zod';
import { EnrollmentSchema } from '@ayman/contracts/progress';
import { PaymentSubmissionSchema } from '@ayman/contracts/payments';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { apiGet } from '@/lib/api';
import { loadAssistantSummary } from '@/components/assistant/assistant-summary';
import { resolveCourseVisitorState, type CourseVisitorState } from '@/lib/course-visitor-state';

const MY_ENROLLMENTS_SCHEMA = z.array(EnrollmentSchema);
const MY_SUBMISSIONS_SCHEMA = z.array(PaymentSubmissionSchema);

/**
 * The progressive-enhancement layer on top of the cached, session-blind
 * public course page — mounted once in the sidebar, only for a PRICED
 * course.
 *
 * `(site)/courses/[slug]/page.tsx` is `'use cache'` with `cacheLife('hours')`
 * and cannot know who is looking at it (see `<CourseStartButton>`'s own
 * docblock and `2026-08-03-login-gated-content-design.md` §5): every visitor
 * gets the same HTML, and today that HTML only reveals "you already have
 * access" or "your payment is pending" once someone actually PRESSES
 * "اشترك في الكورس" — `<CourseStartButton>`'s 200 branch redirects a
 * subscribed student, and `<SubscribePanel>` shows «قيد المراجعة» once its
 * modal is open. Neither happens on page load.
 *
 * This component runs that same pair of checks on mount instead, WITHOUT
 * paying for it on the common case — an anonymous pageview, which is most
 * of them:
 *
 * 1. "Is there a session at all?" is answered by `loadAssistantSummary()`
 *    (`components/assistant/assistant-summary.ts`), NOT by a fetch this file
 *    starts itself. `<AssistantWidget>` is mounted at the root of `(site)`
 *    and already calls that same function, unconditionally, on every page
 *    load — it is deliberately built to be that cheap (four primitives, no
 *    Zod schema; see its own docblock). `loadAssistantSummary` shares its
 *    in-flight PROMISE at module scope (`inFlight ??= …`), so calling it a
 *    second time from here — mounted in the same initial render as the
 *    widget — joins the identical network request rather than starting a
 *    second one: React flushes both components' mount effects synchronously,
 *    long before a real round trip can resolve. An anonymous visitor
 *    therefore costs this feature exactly the request the page was already
 *    making, and this file stops there for them (`isSignedIn: false` short-
 *    circuits before any per-course fetch).
 *
 *    There is no cheaper client-side signal available: the session cookie is
 *    `httpOnly` by design (`auth.config.ts`'s S8 note), so `document.cookie`
 *    can never see it, and this codebase mints no separate "is there a
 *    session" hint cookie the way some apps do.
 *
 * 2. Only once signed in does this fetch anything course-specific, and both
 *    calls reuse EXISTING read endpoints rather than new ones:
 *      - `GET /api/enrollments` — the same list `EnrollmentController` has
 *        always exposed, filtered here to this course. Read-only: unlike
 *        `POST .../enroll`, it cannot create or revive an enrollment, so
 *        visiting a course page never has a side effect.
 *      - `GET /api/payments/submissions/me` — literally the same call and
 *        the same per-course filter `<SubscribePanel>`'s own `checkExisting`
 *        effect already makes; see that file for why `find()` (newest-first)
 *        is correct here too.
 *
 * `resolveCourseVisitorState` (`lib/course-visitor-state.ts`) turns those two
 * results into the one of three outcomes this component renders:
 *
 *   enrolled → redirect straight into the resumed lesson, same destination
 *              `<CourseStartButton>`'s own 200 branch would send a CLICK to.
 *   pending  → a «قيد المراجعة» banner plus a WhatsApp button, visible
 *              without needing to open the subscribe modal first.
 *   none     → render nothing; the existing click-driven flow is untouched.
 */
export function CourseSubscribeState({
  courseId,
  slug,
  whatsapp,
}: {
  courseId: string;
  slug: string;
  /** `contact.whatsapp`, E.164 or `null` — same public settings value the
   *  site footer already builds its own `wa.me` link from. */
  whatsapp: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<CourseVisitorState>({ kind: 'none' });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let isSignedIn: boolean;
      try {
        isSignedIn = (await loadAssistantSummary()).isSignedIn;
      } catch {
        // The probe failing must never surface here — the ordinary click
        // flow is a complete fallback, and this component has nothing
        // useful to say about a request that did not even establish who is
        // asking.
        return;
      }
      if (cancelled || !isSignedIn) return;

      const [enrollments, submissions] = await Promise.allSettled([
        apiGet('/api/enrollments', MY_ENROLLMENTS_SCHEMA),
        apiGet('/api/payments/submissions/me', MY_SUBMISSIONS_SCHEMA),
      ]);
      if (cancelled) return;

      const enrollment =
        enrollments.status === 'fulfilled'
          ? (enrollments.value.find((row) => row.courseId === courseId) ?? null)
          : null;
      // `find`, not `filter` — newest-first, same as `SubscribePanel`'s own
      // `checkExisting`. An older rejection sitting behind a later pending
      // resubmission must not resurface here.
      const latestSubmission =
        submissions.status === 'fulfilled'
          ? submissions.value.find((row) => row.courseId === courseId)
          : undefined;

      const next = resolveCourseVisitorState({
        isSignedIn,
        enrollment: enrollment ? { lastLessonId: enrollment.lastLessonId } : null,
        hasPendingSubmission: latestSubmission?.status === 'pending',
      });

      setState(next);
      if (next.kind === 'enrolled') {
        router.replace(`/courses/${encodeURIComponent(slug)}/lessons/${next.lessonId}`);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [courseId, slug, router]);

  if (state.kind === 'enrolled') {
    // Mirrors the moment between a click and the navigation it triggers on
    // `<CourseStartButton>` — same copy, so a student who has seen that
    // button before recognises this as "on my way in", not a stall.
    return <p className="course-aside__redirect">{copy.course.startPending}</p>;
  }

  if (state.kind === 'pending') {
    const whatsappHref = waMeHref(whatsapp);
    return (
      <div className="course-aside__pending">
        <p>{copy.subscribe.pendingStatus}</p>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="course-aside__pending-whatsapp"
          >
            <MessageCircle size={16} aria-hidden="true" />
            {copy.subscribe.pendingWhatsapp}
          </a>
        ) : null}
      </div>
    );
  }

  return null;
}
