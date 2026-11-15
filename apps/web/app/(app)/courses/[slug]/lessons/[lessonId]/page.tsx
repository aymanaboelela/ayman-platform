import { notFound, redirect } from 'next/navigation';
import { CourseOutlineSchema, LessonPlayerSchema, type CourseOutline } from '@ayman/contracts';
import { LessonNotesSchema, type LessonNote } from '@ayman/contracts/engagement';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { getSession } from '@/lib/session';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { getBookShippingRates } from '@/lib/books';
import { courseBookCtaVisible } from '@/lib/course-book';
import { groupIntoEntries, isLessonFinished } from '@/lib/course-outline';
import { featureEnabled } from '@/lib/entitlements';
import { getStudentExamsOrEmpty } from '@/lib/exams';
import { sanitizeRichText } from '@/lib/sanitize-html';
import { UnitArt } from '@/components/library/unit-art';
import { LessonNotesPanel } from '@/components/engagement/lesson-notes';
import { CourseExamsCard, courseExamDoors } from '@/components/player/course-exams-card';
import { CourseOutlineSidebar } from '@/components/player/course-outline';
import { CourseSideLinks } from '@/components/player/course-side-links';
import { LessonDescription } from '@/components/player/lesson-description';
import { LessonHomework } from '@/components/player/lesson-homework';
import { LessonPlayerView, type LessonPlace } from '@/components/player/lesson-player';
import { MonthOfferCard } from '@/components/player/month-offer-card';
import { NextLessonBar } from '@/components/player/next-lesson-bar';
import { OutlineSheet } from '@/components/player/outline-sheet';

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
  if (error instanceof ApiRequestError) {
    if (error.status === 401) redirect('/login');
    if (error.status === 404 || error.status === 403) return null;
  }
  throw error;
}

/**
 * A 403 from the player, REMEMBERED rather than acted on where it lands.
 *
 * This used to redirect to `/courses/:slug` from inside the `.catch`, on one
 * reading of a 403: `LessonAccessService.require()` re-checks the live
 * `AccessGrant` behind the enrollment, so an expired or revoked subscription
 * throws instead of silently serving the lesson, and the public course page is
 * the only page that sells — «ابدأ الكورس» there re-runs
 * `EntitlementService.enroll`, throws the same 403, and `CourseStartButton`
 * turns it into the subscribe modal.
 *
 * That reading is now one of TWO. `requireEntitled` also throws 403
 * `needs_month_grant` for a lecture in a curriculum month this student did not
 * buy — a student whose subscription is perfectly live, who owns other months
 * of this very course, and for whom «the course you were in is gone, here is
 * the sales page» is simply false. Worse, it does not even land: `proxy.ts`
 * 307s `/courses/:slug` back to `/library/:slug` for any enrollment with live
 * access, and a month grant is live access.
 *
 * So the status is carried out of the `catch` and answered below, once the
 * outline — which is fetched in the same breath and knows this student's real
 * gate on every row — has arrived.
 */
const FORBIDDEN = 'forbidden';

function forbiddenOn403(error: unknown): typeof FORBIDDEN | null {
  if (error instanceof ApiRequestError && error.status === 403) return FORBIDDEN;
  return nullOn404(error);
}

/**
 * Does this student hold SOME of this course and not this lesson — or none of
 * it at all?
 *
 * The honest version of this question is the 403's own `reason`, and it is not
 * readable here: `apiGetAuthed` throws `ApiRequestError(status, path)` and
 * drops the body (only `apiPost` keeps one). So it is answered from the
 * outline instead, which is the same `resolveGate` run the refusal came from:
 * this lesson drawn `locked` while something else in the course is not means
 * the student demonstrably owns part of the course — a month lock.
 *
 * ⚠️ The `some open` half is load-bearing, not a tidiness check. A student
 * whose subscription has LAPSED on a month-selling course also has every
 * lesson locked (`resolveMonthSlice` unions live grants and finds none), and
 * sending that student to `/library/:slug` would put the checkout back outside
 * the loop `EnrollmentService.listOwn`'s own note describes — «الطالب اللي
 * اشتراكه خلص مش قادر يدفع». Everything locked → they need the sales page.
 */
function ownsPartOfCourse(outline: CourseOutline, lessonId: string): boolean {
  const lessons = outline.sections.flatMap((section) => section.lessons);
  return (
    lessons.some((lesson) => lesson.id === lessonId && lesson.gate === 'locked') &&
    lessons.some((lesson) => lesson.id !== lessonId && lesson.gate !== 'locked')
  );
}

/** `?t=120` from a note — a whole second inside a day, or nothing. */
function jumpSecond(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const seconds = Number(value);
  return seconds <= 86_400 ? seconds : null;
}

/**
 * The student's notes on this lesson, or `null` for no panel at all: the
 * feature is off here, or the read failed. A notes panel is never worth a
 * broken lesson page, so every failure is swallowed into «no panel».
 */
async function lessonNotesOrNull(lessonId: string): Promise<LessonNote[] | null> {
  if (!(await featureEnabled('lessonNotes'))) return null;
  try {
    return (await apiGetAuthed(`/api/me/lessons/${lessonId}/notes`, LessonNotesSchema)).notes;
  } catch {
    return null;
  }
}

/**
 * Where this lesson sits — the unit it is in and its place among that unit's
 * LECTURES, counted the way the outline counts them (`groupIntoEntries`: a
 * quiz hanging off a lecture is not a step). Read off the outline rather than
 * the player payload because only the outline knows the unit's other rows.
 */
function placeOf(outline: CourseOutline, lessonId: string) {
  const unitIndex = outline.sections.findIndex((section) =>
    section.lessons.some((lesson) => lesson.id === lessonId),
  );
  const section = outline.sections[unitIndex];
  if (!section) {
    return {
      place: { unitIndex: 0, unitTitle: '', lectureIndex: null, lectureCount: 0 } satisfies LessonPlace,
      unitDone: 0,
      section: null,
    };
  }
  const entries = groupIntoEntries(section.lessons);
  const lectureAt = entries.findIndex((entry) => entry.lecture.id === lessonId);
  return {
    place: {
      unitIndex: unitIndex + 1,
      unitTitle: section.title,
      lectureIndex: lectureAt >= 0 ? lectureAt + 1 : null,
      lectureCount: entries.length,
    } satisfies LessonPlace,
    unitDone: entries.filter((entry) => isLessonFinished(entry.lecture)).length,
    section,
  };
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, lessonId } = await params;
  const jumpTo = jumpSecond((await searchParams).t);

  // Two parallel fetches, not one endpoint: the outline is stable across
  // lesson navigations and the lesson body is not. Both are authenticated —
  // the guard's 404 for "not enrolled" is exactly what makes `notFound()`
  // below a rendering decision rather than an authorization one.
  const [outline, result, settings, shippingRates, viewer, studentExams, notes] = await Promise.all([
    apiGetAuthed(`/api/courses/${slug}/outline`, CourseOutlineSchema).catch(nullOn404),
    apiGetAuthed(`/api/lessons/${lessonId}/player`, LessonPlayerSchema).catch(forbiddenOn403),
    // The payment numbers «اطلب الكتاب» needs — `…OrDefaults` so a settings
    // read that throws does not take a student's lesson down.
    getPublicSettingsOrDefaults(),
    /* The delivery fee «اطلب الكتاب» quotes. `'use cache'` on one coarse tag,
       so this is not a per-view request — see `getBookShippingRates`. */
    getBookShippingRates(),
    /* Who is watching — for the name over OUR copy of an uploaded lecture.
       `getSession` is `cache()`d per request and `proxy.ts` has already paid
       for it, so this is not a second round trip. */
    getSession().catch(() => null),
    /* «امتحانات الشهر» — the door a kept-open exam keeps once the dashboard
       has let go of it. Never fatal: a miss is `{ exams: [] }` and the card
       renders nothing, and a stack without exams skips the request. */
    getStudentExamsOrEmpty(),
    /* «ملاحظاتي» — `null` (no panel) when the feature is off or the read
       failed; see `lessonNotesOrNull`. */
    lessonNotesOrNull(lessonId),
  ]);

  // No outline means the course is not theirs to see at all — not enrolled, or
  // no such course. A 404 is the honest answer and stays one.
  if (!outline) notFound();

  /*
   * The 403, answered now that the outline is in hand.
   *
   * «شهر تاني» → `/library/:slug`, which is the one screen that draws this
   * lecture with the month padlock and a dialog offering the month itself.
   * Anything else → the public course page, which is the only page that sells
   * a renewal. Both are a redirect rather than a rendered explanation, because
   * both explanations already exist one route over and two copies of either
   * would drift.
   */
  if (result === FORBIDDEN) {
    redirect(
      ownsPartOfCourse(outline, lessonId)
        ? `/library/${encodeURIComponent(slug)}`
        : `/courses/${encodeURIComponent(slug)}`,
    );
  }

  const payload = result;

  /*
   * An outline WITHOUT a player payload: this student is enrolled, and asked
   * for a lesson the progression gate has not opened yet — every link built
   * from a stale outline, every bookmark. `/library/[slug]` renders the same
   * outline with each lesson in its real gate state and its locked rows open a
   * dialog naming the exact lesson standing in the way, so send them there
   * instead of to a not-found page that reads as the site being broken.
   */
  if (!payload) redirect(`/library/${encodeURIComponent(slug)}`);

  /*
   * The second sanitization pass, here rather than inside `<TextLesson>`.
   *
   * `TextLesson` is `'use client'`, so the `<RichText>` it used to render
   * dragged `isomorphic-dompurify` across the boundary and put 28,635 bytes of
   * it in this route's client bundle — on the page a student has open longest.
   * Same allowlist, same second pass, run once on the server. Full account in
   * `lib/sanitize-html.ts`. `payload.text` is null for every other `kind`, so
   * this is a no-op on the common path.
   */
  const lesson = payload.text
    ? { ...payload, text: { ...payload.text, bodyHtml: sanitizeRichText(payload.text.bodyHtml) } }
    : payload;

  const { place, unitDone, section } = placeOf(outline, lessonId);
  const unitLabel = copy.player.header.unit.replace('{n}', String(place.unitIndex));

  /*
   * Each watermark part only where the teacher switched it on for this
   * course: the name («اظهر اسم الطالب», on by default) and the phone («اظهر
   * رقم الطالب», off). Both off is no watermark at all — `null`, not an empty
   * string drawn moving across the picture.
   */
  const watermark =
    viewer === null
      ? null
      : [
          outline.course.watermarkName ? viewer.name : null,
          outline.course.watermarkPhone ? viewer.phoneNumber : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;

  /*
   * «اطلب الكتاب» — the same predicate the public course page and
   * `EnrolledCourseCard` read, so the linked book's `showOnCourse` cannot end
   * up honoured on two surfaces out of three. A row in the outline's footer
   * now, not a wide button in its head: a student watching a lesson is the
   * most "inside" this course they ever are, and the sales button was the
   * first thing in the rail.
   */
  const book = courseBookCtaVisible(outline.course)
    ? {
        courseId: outline.course.id,
        bookTitle: outline.course.bookTitle as string,
        bookPriceCents: outline.course.bookPriceCents as number,
        shippingRates,
        instapay: settings.contact.instapay,
        vodafoneCash: settings.contact.vodafoneCash,
      }
    : null;

  /*
   * ONE element, TWO slots. The desktop rail and the phone's bottom sheet draw
   * the same outline; React renders the element where each slot mounts it, and
   * `OutlineScrollToCurrent` inside it finds its own panel rather than the
   * first on the page.
   */
  const outlinePanel = (
    <CourseOutlineSidebar
      outline={outline}
      activeLessonId={payload.lesson.id}
      nextLessonId={payload.next?.id ?? null}
      footer={
        <CourseSideLinks
          groupUrl={outline.course.whatsappGroupUrl}
          whatsapp={settings.contact.whatsapp}
          book={book}
        />
      }
    />
  );

  return (
    /*
      Wider than `--w-shell` (1152px), and only here.

      The shell width is a READING measure — it exists so prose does not run to
      140 characters. This page's main object is a 16/9 video, and a video is
      the one thing on the platform that is better bigger. 1440 with a 380px
      rail puts the player at ~1012px — «عايز الفيديو أكبر من كده».
    */
    <main
      className={cn(
        'mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8',
        // Room under the content for the pinned «المحاضرة التالية» bar between
        // `md` (where `.shell main` stops reserving the tab bar's strip) and
        // `lg` (where the bar goes away) — see study.css.
        payload.next && 'lp-page--bar',
      )}
    >
      {/* Grid column order follows the writing mode: in RTL the content
          column starts at the inline start (the right) and the rail sits
          after it. No physical direction anywhere. `min-w-0` on both tracks is
          load-bearing — see the note on the rail column. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="min-w-0">
          <LessonPlayerView
            payload={lesson}
            jumpTo={jumpTo}
            watermark={watermark}
            place={place}
            panels={{
              /* الواجب — a tab, first and marked, when the lecture has one.
                 «لو في واجب قولي واجب، يبقى أظهره بشكل كويس وكبير.» */
              homework: payload.homework ? (
                <LessonHomework lessonId={payload.lesson.id} homework={payload.homework} />
              ) : null,
              /* الملخص — the thing to read once the video is finished. */
              summary: <LessonDescription description={payload.lesson.description} />,
              /* «ملاحظاتي» — not on a quiz lesson, which has nothing to take
                 notes on; `null` when the feature is off or the read failed. */
              notes:
                notes !== null && payload.lesson.kind !== 'quiz' ? (
                  <LessonNotesPanel
                    lessonId={payload.lesson.id}
                    initial={notes}
                    hasVideo={payload.lesson.kind === 'video' && payload.video !== null}
                  />
                ) : null,
              notesCount: notes?.length ?? 0,
            }}
            door={
              <OutlineSheet
                art={
                  <UnitArt coverKey={section?.coverKey ?? null} seed={section?.id ?? outline.course.id} />
                }
                unitLabel={unitLabel}
                unitTitle={place.unitTitle}
                unitDone={unitDone}
                unitCount={place.lectureCount}
                courseDone={outline.completedLessons}
                courseTotal={outline.totalLessons}
              >
                {outlinePanel}
              </OutlineSheet>
            }
          />
        </div>

        {/*
          `min-w-0` is load-bearing, and its absence is what made this page
          overflow its own viewport on a phone: an `auto` grid track's base
          size is the min-content of the widest item in it, and one long
          `nowrap` line in the rail sized the whole shared track. Measured at
          360px: a 328px column rendered 373px wide.
        */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* «شهور جديدة اتفتحت» — first in the column, above the outline: it
              is the only door to a month the student does not hold yet, and a
              door at the bottom of a long outline is a door nobody finds.
              Renders nothing when there is nothing to offer. */}
          <MonthOfferCard courseSlug={outline.course.slug} offer={outline.monthOffer} />
          <CourseExamsCard exams={courseExamDoors(studentExams.exams, outline.course.id)} />
          {/*
            The rail's copy of the outline — desktop only. Below `lg` the
            outline lives in the sheet behind the door under the title, so this
            slot is `hidden` there rather than a 60dvh scroller after the tabs.

            Sticky, capped at the viewport, and the unit list inside gives way:
            `.outline` is a flex column with `min-h-0`, so `.outline__units`
            becomes the scroller instead of the page.
          */}
          <div className="hidden w-full min-w-0 lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-3rem)] lg:flex-col">
            {outlinePanel}
          </div>
        </div>
      </div>

      {/* «المحاضرة التالية» pinned under the thumb — phones only, and never on
          the last lesson of a course. */}
      {payload.next ? <NextLessonBar courseSlug={payload.lesson.courseSlug} next={payload.next} /> : null}
    </main>
  );
}
