'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { copy } from '@ayman/contracts/copy';
import type { CatalogCourseTerm } from '@ayman/contracts/catalog';
import { EnrollResponseSchema } from '@ayman/contracts/progress';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { ApiRequestError, apiPost } from '@/lib/api';
import { withNext } from '@/lib/safe-next';
import { SubscribePanel } from './subscribe-panel';

/**
 * The single entry point into a course from the PUBLIC course page — the one
 * click that covers both "I have never seen this platform" and "I stopped at
 * lesson 14".
 *
 * `(site)/courses/[slug]/page.tsx` mounts this component TWICE — once beside
 * the price in the sidebar (`label={copy.subscribe.cta}`), once in the play
 * panel below (the default `label`) — but it is still ONE entry point in the
 * sense that matters: both instances run this exact click handler, so there
 * is nowhere for the two to disagree about what pressing either of them does.
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
  monthlyPriceCents,
  quarterlyPriceCents,
  yearlyPriceCents,
  terms,
  instapay,
  label = copy.course.start,
}: {
  courseId: string;
  slug: string;
  hasLessons: boolean;
  /** `null` when this plan is not for sale. Public data, safe on the cached page. */
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  /** A full-year subscription — a FOURTH plan, same public-pricing
   *  reasoning as the two above. */
  yearlyPriceCents: number | null;
  /** الترم الأول / الترم الثاني — only OPEN, PRICED ones. Public for the
   *  same reason the prices above are. */
  terms: CatalogCourseTerm[];
  /** `contact.instapay`, E.164 or `null`. Also public — same reasoning. */
  instapay: string | null;
  /**
   * The button's own visible text — everything else about it (the click
   * handler, the 401/403 branches, the dialog it opens) stays identical.
   *
   * `(site)/courses/[slug]/page.tsx` places this control TWICE — once in the
   * play panel, where "نبدأ الكورس" reads as a "press play" instruction, and
   * once in the sidebar right under the price, where the same click reads
   * better as "اشترك في الكورس" (`copy.subscribe.cta`). Two placements of
   * ONE component, never two components that could drift apart on what a
   * click actually does.
   */
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only by the 403 branch below — the moment this student, specifically,
  // learns the door is shut. Never on render: this button lives on a page
  // cached for every visitor, and whether to show the subscribe flow instead
  // of a plain error depends on the CLICK's outcome, same discipline as the
  // 401 branch a few lines down.
  const [showSubscribe, setShowSubscribe] = useState(false);
  const priced =
    monthlyPriceCents !== null ||
    quarterlyPriceCents !== null ||
    yearlyPriceCents !== null ||
    terms.length > 0;

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

      /*
       * ⚠️ NO `router.refresh()` on this path, and it was tried twice — once
       * paired with the push in a transition, once split from it. Both broke
       * `login-gated-content.e2e.ts`'s «one click opens the lesson», on two
       * shards, with a 30-second `toHaveURL` timeout on the click this button
       * exists for.
       *
       * The reason is specific to THIS route, and it is not a race worth
       * tuning. `refresh()` re-requests the CURRENT route, and the current
       * route is `(site)/courses/:slug` — which `proxy.ts`'s
       * `resolveEnrolledCourseRedirect` answers with a 307 to `/library/:slug`
       * for a student who has an enrollment. The enroll that just succeeded is
       * what creates one. So the refresh does not refresh: it navigates, to
       * somewhere nobody asked to go, racing the push to the lesson.
       *
       * The cost of leaving it out is bounded and cosmetic: `/dashboard` and
       * the `/library` list can be up to `staleTimes.dynamic` behind on a
       * course joined seconds ago. The student is being taken into the lesson,
       * not to either of those. `next.config.ts` states the general rule and
       * this is its one documented exception.
       */
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
       *
       * ⚠️ EVERY 403 opens the subscribe panel. There is no `priced` branch
       * here any more, and putting one back would restore a real bug.
       *
       * It used to read: priced ⇒ subscribe panel, otherwise
       * `copy.course.lockedError` («الكورس ده مقفول دلوقتي. رسالة للمهندس أيمن
       * وهيفتحه»). The reasoning was sound; the INPUT was not. `priced` is
       * computed from this component's props, and those come from a page that
       * is `'use cache'` with `cacheLife('hours')` — so for a course priced, or
       * a term opened, at any point in the preceding hour, `priced` was `false`
       * for a course that was very much for sale, and a student who came to pay
       * was sent to go and message a human. «هو جاي يدفع بيقولوا الكورس قفل…
       * وأنا عايزه إن ده لازم يدفع».
       *
       * The 403 is the authoritative half and always was — it comes from
       * `EntitlementService.enroll` reading the live row. What was missing was
       * an equally live answer to "and what does it cost". `SubscribePanel`
       * fetches that for itself when it opens, so the honest thing to do here
       * is stop guessing and hand over.
       *
       * The unpriced-and-closed course has not stopped existing: it is
       * `copy.subscribe.noPlans` inside the panel now, decided on a live read
       * instead of on a cache entry, and with a retry beside it.
       */
      if (caught instanceof ApiRequestError && caught.status === 403) {
        setShowSubscribe(true);
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
      {/* A modal, not an inline swap: the subscribe flow has its own steps
          (plan, transfer details, upload, success) and used to replace the
          button in place — which pushed the rest of the page down and left
          the panel competing with everything below it for attention. A
          dialog gives it the whole screen's focus, same as the review-reject
          prompt in admin/payments does for a shorter flow. */}
      <Dialog open={showSubscribe} onOpenChange={setShowSubscribe}>
        <DialogContent closeLabel={copy.subscribe.back}>
          <DialogHeader>
            <DialogTitle>{copy.subscribe.title}</DialogTitle>
          </DialogHeader>
          <SubscribePanel
            courseId={courseId}
            slug={slug}
            monthlyPriceCents={monthlyPriceCents}
            quarterlyPriceCents={quarterlyPriceCents}
            yearlyPriceCents={yearlyPriceCents}
            terms={terms}
            instapay={instapay}
            onCancel={() => setShowSubscribe(false)}
          />
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        onClick={handleClick}
        /*
         * Only ever disabled while a press is in flight.
         *
         * It used to also be `(!hasLessons && !priced)`, with the reasoning
         * that a priced course with no lessons yet must stay clickable because
         * that click is the only path to the subscribe panel — right, and it
         * was reading `priced` off an hours-old cache entry to decide. A course
         * priced this morning and not yet filmed is `hasLessons: false` and
         * `priced: false` in that entry, so the one control that could have
         * taken the student's money was rendered DISABLED. The worst possible
         * failure of this component, and silent: nothing on the page explains a
         * greyed-out button.
         *
         * There is nothing worth protecting by disabling. The only case the old
         * condition was really aimed at — a genuinely free, genuinely empty
         * course — now answers with a press: `handleClick`'s 200 branch comes
         * back with no `resumeLessonId` and prints `copy.course.noLessons`,
         * which is the same sentence the note below already shows, and true.
         *
         * The accepted cost, stated so nobody has to rediscover it: that press
         * reaches `POST /enroll` first, so it leaves an enrollment row for a
         * course with nothing in it, and the course then appears on that
         * student's `/library`. Deliberate. The control says «نبدأ الكورس» and
         * they pressed it; `CourseService.setStatus` will not publish a course
         * with no published lesson at all, so the row can only ever be for a
         * course that is real and still filling up — which is the state
         * `comingSoonTitle` exists to describe, and being enrolled in one is
         * the outcome the student was asking for. Weigh it against what the old
         * condition did: it rendered the ONLY path to checkout as a dead grey
         * button, with nothing on the page to explain why, for every course
         * priced before its first lecture shipped.
         */
        disabled={pending}
        className="w-full"
      >
        {pending ? copy.course.startPending : label}
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
          assert the page does not say it. See its docblock.

          A priced, lessonless course reads the same as one with lessons here:
          the visitor has not paid yet, so "الدروس بتفتح أول ما تدخل" is still
          the true sentence for them. The actually-empty case (`noLessons`)
          only fires once `handleClick`'s 200 branch reaches it with no
          `resumeLessonId` — i.e. for someone who already has access. */}
      {hasLessons || priced ? (
        <p className="course-start__note">{copy.course.startNote}</p>
      ) : (
        <p className="course-start__note">{copy.course.noLessons}</p>
      )}
    </div>
  );
}
