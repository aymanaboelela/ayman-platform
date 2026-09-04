import type { Dashboard } from '@ayman/contracts/progress';
import { formatCopy } from '@ayman/contracts/format';
import { enrolledCourseHref } from './course-href';
import { quizHref } from './quiz-links';
import { copy } from '@ayman/contracts/copy';

/**
 * «ناقصك كذا وكذا» — the dashboard's percentage, turned into a to-do list.
 *
 * ## Why this exists
 *
 * The band at the top of `/dashboard` prints «80% إجمالي تقدّمك» and stops
 * there. A percentage is a VERDICT, not an instruction: it tells a student
 * how far off they are and says nothing at all about what to press. Ayman's
 * ask was exactly that gap — «عاوز يبقى فيه حاجة تحت، إن أنا أعرف اللي ناقصني
 * وأضبطها… ولما أضغط عليها توديه ليها عشان يخلصها».
 *
 * So every entry this returns carries an `href` that goes somewhere real. A
 * chip that names a gap without closing it is worse than the percentage was,
 * because it also implies a control that is not there.
 *
 * ## What it may and may not read
 *
 * ONLY `Dashboard` (`@ayman/contracts/progress`). No second endpoint, no new
 * column — same rule `dashboard-view.ts` set for slice 1 and for the same
 * reason: this is a re-reading of a payload the page has already paid for.
 *
 * Which is also why there is no «كويز لسه ماتحلّش» entry here, and that is a
 * gap rather than an omission. `Dashboard` carries `recentScores` — quizzes
 * the student HAS sat — and nothing that enumerates the quizzes they have
 * not. `EnrolledCourse.totalLessons`/`completedLessons` count lessons, and a
 * quiz attached to a video lecture is not one of them (see
 * `LessonPlayerSchema.quiz`, which is 1:1 with a lesson of ANY kind). Deriving
 * "unattempted quizzes" would need a field the API does not send; inventing
 * one from `recentScores` would produce a list that is wrong for exactly the
 * students who have never opened a quiz. It is left out and reported.
 *
 * ## One entry per COURSE, and the exam wins
 *
 * A course with a ready exam would otherwise produce two entries — «فاضلك درس
 * واحد» (the exam lesson, uncleared) and «فاضل امتحان الكورس» — which is one
 * obligation printed twice with two different verbs on it. `PendingExamSchema`
 * already guarantees every published lecture is cleared and the exam's own
 * gate is `available`, so for such a course the exam IS the remainder, and it
 * is the more specific of the two destinations. It replaces the count.
 */

/**
 * Three, and the cap is the feature.
 *
 * Eleven things a student is behind on is not a plan, it is the same
 * "you are 80% done" restated as a wall — «لستة من حداشر حاجة زي مافيش لستة».
 * Three fits under the ring without scrolling, and the rest of the list is one
 * click away in «كورساتي» and `/path`, both of which exist and neither of
 * which claims to be a shortlist.
 */
export const MAX_NEXT_UP = 3;

/**
 * `lessons` — published lectures still outstanding in a course.
 * `exam`    — the course's final exam, open and never sat.
 *
 * Carried on the item rather than sniffed from the `href` at render time,
 * because the row's CTA word differs («يلا نكمّل» vs «ادخل الامتحان») and a
 * component deciding that from a URL shape is how the two drift.
 */
export type NextUpKind = 'lessons' | 'exam';

export interface NextUpItem {
  /** React key. The course id — one entry per course, so it is unique. */
  id: string;
  kind: NextUpKind;
  /** «فاضلك 3 دروس» — the obligation, in words and a real count. */
  label: string;
  /** Where pressing it lands. Never the public marketing page, never `#`. */
  href: string;
  /** Which course the obligation belongs to. Rendered as the row's second line. */
  courseTitle: string;
  /** What `label` counts: lectures outstanding, or `1` for an exam. */
  count: number;
}

/**
 * ⚠️ TEMPORARY HOME. These belong in `packages/contracts/src/copy/ar.ts` under
 * `copy.dashboard.nextUp.*` like every other user-facing string on this
 * screen — Global Constraint 4 admits no exception, and this const is one only
 * because `ar.ts` was owned by another change while this landed and a
 * conflict in the copy table is the worst possible place to take one.
 *
 * When the keys land: delete this object, `import { copy } from
 * '@ayman/contracts'`, and point `lessonsLeftLabel` at `copy.dashboard.nextUp`.
 * Nothing else moves — the shapes are identical on purpose.
 *
 * ## Why four forms and not «فاضلك {n} درس» for everything
 *
 * Arabic counts 1, 2, 3–10 and 11+ differently, and the platform speaks to a
 * student the way a person would. «فاضلك 1 درس» is not a sentence anybody
 * says; «فاضلك درس واحد» is. The one place this genuinely matters is `n === 1`
 * and `n === 2`, which is also the range a student is in at the exact moment
 * this list is most worth reading.
 *
 * Western digits throughout, matching §4.1 and the `{remaining} من {total}`
 * strings already in the copy table.
 */
const NEXT_UP_COPY = copy.dashboard.nextUp;

/** «فاضلك درسين» / «فاضلك 7 دروس» — see `NEXT_UP_COPY` for why four forms. */
export function lessonsLeftLabel(n: number): string {
  if (n === 1) return NEXT_UP_COPY.lessonsOne;
  if (n === 2) return NEXT_UP_COPY.lessonsTwo;
  if (n <= 10) return formatCopy(NEXT_UP_COPY.lessonsFew, { n });
  return formatCopy(NEXT_UP_COPY.lessonsMany, { n });
}

/**
 * The sort key, kept beside the item rather than recomputed in the comparator
 * so the two orderings (lectures, exams) are provably the same one ordering.
 */
interface Ranked {
  item: NextUpItem;
  /** How many things are left. The primary key, ascending. */
  remaining: number;
  /** Tie-break. The course's own percentage, descending. */
  progressPercent: number;
  /** Final tie-break: the payload's own order, so the list never shuffles
   *  between two renders of identical data. */
  order: number;
}

/**
 * At most `MAX_NEXT_UP` concrete, pressable things standing between this
 * student and 100%.
 *
 * ## The ordering, and what "unblocks the most" means here
 *
 * Fewest remaining first — the course CLOSEST to done, not the course with the
 * highest percentage. Those are different questions and the difference is the
 * whole point: a 90%-complete 40-lesson course has four lectures left, a
 * 50%-complete 2-lesson one has one. Finishing the second takes one sitting,
 * moves the overall figure by the same one lesson, and removes an entire
 * course from this list. Ordering by percentage would put the four-evening job
 * first and bury the one that is genuinely nearly over.
 *
 * Percentage is the FIRST tie-break, for two courses with the same number left
 * — there, "more of it is already behind you" is the honest separator.
 *
 * ## What is excluded, and why each one is not a hidden obligation
 *
 * · `published: false` — the instructor has pulled the course to edit it. The
 *   student cannot act on it at any price, so listing it under «ناقصك» would
 *   be blaming them for the instructor's afternoon. `EnrolledCourseCard` still
 *   shows it, and still says «مقفول مؤقتاً», which is the right screen for that.
 * · `totalLessons === 0` — a course with nothing published yet («لسه هننزل
 *   قريبًا»). Zero remaining falls out of the arithmetic on its own.
 * · `remaining <= 0` — done. This is what makes the list go empty at 100%,
 *   which is what the celebration keys off.
 *
 * Note what is NOT excluded: `contentComplete === false`. A course still being
 * uploaded has real outstanding lectures and they are real work; the word
 * «خلصت الكورس» is the thing that flag gates, and this list never says it.
 */
export function nextUp(dashboard: Dashboard): NextUpItem[] {
  const orderOf = new Map(dashboard.enrolledCourses.map((course, index) => [course.id, index]));
  const courseById = new Map(dashboard.enrolledCourses.map((course) => [course.id, course]));

  /* A ready exam replaces its course's lecture count entirely — see the
     "one entry per COURSE" note at the top of this file. */
  const examCourseIds = new Set(dashboard.pendingExams.map((exam) => exam.courseId));

  const ranked: Ranked[] = [];

  for (const exam of dashboard.pendingExams) {
    const course = courseById.get(exam.courseId);
    /* An exam whose course is closed is not something the student can sit
       either — same reasoning as the lecture branch, and `PendingExam` carries
       no `published` of its own to check, so the enrolment row is the only
       place the answer lives. Absent from `enrolledCourses` at all is treated
       as open: the payload is then telling us about a course it did not list,
       and refusing to show the exam would lose the obligation silently. */
    if (course && !course.published) continue;

    ranked.push({
      item: {
        id: exam.courseId,
        kind: 'exam',
        label: NEXT_UP_COPY.exam,
        href: quizHref(exam.lessonId),
        courseTitle: exam.courseTitle,
        count: 1,
      },
      /* One thing to do, and `PendingExamSchema` guarantees it is genuinely
         the last one — every published lecture is already cleared. So an exam
         always ranks at the top of the "closest to done" order, alongside a
         course with a single lecture left. */
      remaining: 1,
      progressPercent: course?.progressPercent ?? 100,
      order: orderOf.get(exam.courseId) ?? dashboard.enrolledCourses.length,
    });
  }

  for (const course of dashboard.enrolledCourses) {
    if (!course.published) continue;
    if (examCourseIds.has(course.id)) continue;

    const remaining = course.totalLessons - course.completedLessons;
    if (remaining <= 0) continue;

    ranked.push({
      item: {
        id: course.id,
        kind: 'lessons',
        label: lessonsLeftLabel(remaining),
        /* `enrolledCourseHref` resumes at the last opened lesson and otherwise
           lands on the IN-SHELL course page, which picks the first open lesson
           itself. The one thing it never does is throw an enrolled student out
           onto the public sales page — see that file for the bug it exists to
           make unrepeatable. */
        href: enrolledCourseHref(course),
        courseTitle: course.title,
        count: remaining,
      },
      remaining,
      progressPercent: course.progressPercent,
      order: orderOf.get(course.id) ?? dashboard.enrolledCourses.length,
    });
  }

  ranked.sort(
    (a, b) =>
      a.remaining - b.remaining ||
      b.progressPercent - a.progressPercent ||
      a.order - b.order,
  );

  return ranked.slice(0, MAX_NEXT_UP).map((entry) => entry.item);
}

/**
 * The courses this student has genuinely finished — what the celebration NAMES.
 *
 * «مبروك» with nothing after it is a grey «تم» with an exclamation mark. The
 * one thing that makes a congratulation land is that it knows what was
 * achieved, so the card says the course titles out loud.
 *
 * `totalLessons > 0` guards the empty course: a course with nothing published
 * satisfies `completedLessons >= totalLessons` trivially at 0 ≥ 0, and
 * congratulating someone for finishing a course that does not exist yet is the
 * exact species of false claim `contentComplete` was added to prevent.
 */
export function finishedCourseTitles(dashboard: Dashboard): string[] {
  return dashboard.enrolledCourses
    .filter((course) => course.totalLessons > 0 && course.completedLessons >= course.totalLessons)
    .map((course) => course.title);
}
