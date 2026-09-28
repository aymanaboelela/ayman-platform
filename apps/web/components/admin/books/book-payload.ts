import type { AdminBookCreateInput } from '@ayman/contracts/admin/books';
import type { BookTerm } from '@ayman/contracts/books';
import { streamFlagsOf, type StreamChoice } from '@ayman/contracts/content';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const c = copy.admin.books;

/**
 * A course this book may be linked to.
 *
 * `year` and the stream pair ride along because the label needs them — see
 * `courseOptionLabel` for why a picker without them is a picker whose wrong
 * answer cannot be corrected. `status` is optional because the course editor
 * mounts the form with a LOCKED course and no list at all.
 */
export interface CourseOption {
  id: string;
  title: string;
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
  status?: string;
}

/**
 * «توحدلي المكان اللي أضيف فيه الكتاب» — the ONE add-book form's logic, pulled
 * out of the dialog that renders it.
 *
 * ## Why a plain function and not `useState` inside the component
 *
 * Two of the rules this form enforces are the kind that used to be enforced by
 * a database CHECK answering 400 to a screen that had no field to blame:
 *
 *   · «المدارس» is THREE radios on screen and TWO booleans in the column. The
 *     expansion is `streamFlagsOf`'s and always was — what was missing is that
 *     the book form never did it at all, so every book created here was written
 *     with the schema's `forGeneral: true, forLanguages: true` default and the
 *     لغات edition of a title was indistinguishable from the عربي one.
 *   · `showOnCourse` is meaningless with no `courseId`. The service clears it
 *     server-side rather than rejecting it, so a form that sent `true` anyway
 *     would silently disagree with the row it just wrote — the checkbox would
 *     come back unticked on the next open and read as a lost save.
 *
 * Both are decisions about VALUES, not about rendering, and they are the two
 * pieces of this dialog worth a test. Keeping them in a module a test can call
 * without a DOM is what makes that test cheap enough to actually exist.
 */

/** The dialog's draft — every money/count field is the raw string as typed. */
export interface BookFormValues {
  slug: string;
  titleAr: string;
  subtitleAr: string;
  subjectId: string;
  /** `''` = «من غير صف». */
  year: string;
  term: BookTerm;
  /** `''` = «من غير كورس». See `showOnCourse` below. */
  courseId: string;
  /** One of three radios; expanded into the boolean pair on the way out. */
  stream: StreamChoice;
  showOnLanding: boolean;
  showOnCourse: boolean;
  /** EGP POUNDS as typed. Nobody types 25000 for a 250-pound book. */
  price: string;
  comparePrice: string;
  unitCost: string;
  coverKey: string | null;
  descriptionAr: string;
  pageCount: string;
  stock: string;
  sortOrder: string;
  isActive: boolean;
}

/**
 * Pounds → piastres. `''` is "not set", which is not the same as zero, and
 * `Math.round` is what keeps a typed `250.5` from arriving as a float — every
 * money column in this database is an integer precisely so no amount is ever
 * the result of a binary fraction.
 */
export function centsOf(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function intOf(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * The draft as the create/patch endpoints want it, or `null` when the price is
 * not a number — the one field with no sane fallback. Everything else has a
 * documented empty meaning, so «مش معروف» travels as `null` rather than as a
 * zero that would report the whole cover price as profit.
 */
export function bookFormPayload(values: BookFormValues): AdminBookCreateInput | null {
  const priceCents = centsOf(values.price);
  if (priceCents === null) return null;

  const courseId = values.courseId === '' ? null : values.courseId;
  const { forGeneral, forLanguages } = streamFlagsOf(values.stream);

  return {
    slug: values.slug.trim(),
    titleAr: values.titleAr.trim(),
    subtitleAr: values.subtitleAr.trim() === '' ? null : values.subtitleAr.trim(),
    subjectId: values.subjectId === '' ? null : values.subjectId,
    year: intOf(values.year),
    term: values.term,
    courseId,
    forGeneral,
    forLanguages,
    showOnLanding: values.showOnLanding,
    /* Not `values.showOnCourse`. A book with no course has no course page to
       appear on, and the checkbox that would have said otherwise is disabled —
       this is the same answer stated where a direct caller can also reach it. */
    showOnCourse: courseId === null ? false : values.showOnCourse,
    priceCents,
    comparePriceCents: centsOf(values.comparePrice),
    unitCostCents: centsOf(values.unitCost),
    coverKey: values.coverKey,
    descriptionAr: values.descriptionAr.trim() === '' ? null : values.descriptionAr.trim(),
    pageCount: intOf(values.pageCount),
    isActive: values.isActive,
    stock: intOf(values.stock),
    sortOrder: intOf(values.sortOrder) ?? 0,
  };
}

/**
 * One option in «الكورس المرتبط».
 *
 * ⚠️ The stream half is not decoration. `books.course_id` is UNIQUE, so a
 * picker that offers «الرياضيات — أولى بكالوريا» twice — once for عربي, once
 * for لغات — with nothing to tell the pair apart is a picker where the wrong
 * choice cannot be fixed by adding a second row: the admin has to find and
 * unlink the first one. A `<select>` cannot hold a `<StreamBadge>`, so this is
 * the badge's text said in one line, from the same `copy.stream` words.
 */
export function courseOptionLabel(course: {
  title: string;
  year: number;
  forGeneral: boolean;
  forLanguages: boolean;
}): string {
  const year =
    course.year === 1
      ? copy.years.year1
      : course.year === 2
        ? copy.years.year2
        : copy.years.year3;
  const stream =
    course.forGeneral && course.forLanguages
      ? copy.stream.both
      : course.forLanguages
        ? copy.stream.languages
        : copy.stream.general;
  return `${year} · ${course.title} — ${stream}`;
}

/**
 * «يظهر فين», as the words the catalogue column prints.
 *
 * Placement is not permission — `isActive` is still what decides whether the
 * book can be bought — so "nowhere" is a real and useful answer and it is
 * spelled out («قسم الكتب بس») rather than left as an empty cell. An empty cell
 * in a placement column reads as a row that failed to load.
 */
export function bookPlacementLabels(book: {
  showOnLanding: boolean;
  showOnCourse: boolean;
  courseId: string | null;
}): string[] {
  const labels: string[] = [];
  if (book.showOnLanding) labels.push(c.placementLanding);
  /* The course link is what makes the flag mean anything; a stale `true` on a
     book whose course was unlinked would otherwise print a place it is not. */
  if (book.showOnCourse && book.courseId !== null) labels.push(c.placementCourse);
  return labels.length === 0 ? [c.placementShopOnly] : labels;
}

/**
 * A URL handle from the title, for a NEW book — «كتاب أولى بكالوريا برمجة
 * عربي» → «كتاب-أولى-بكالوريا-برمجة-عربي».
 *
 * The slug was a required, empty field at the top of the create form, and the
 * first thing it asked of someone adding a book was a URL rule
 * (`BookSlugSchema`: no spaces, dots or slashes). It still exists and can
 * still be edited — `/books#book-{slug}` links are shared on WhatsApp, so it
 * has to be stable once published — but on create it now follows the title
 * until the admin types into it.
 *
 * Letters and digits of ANY script survive; every other run becomes one `-`.
 * That is stricter than the schema needs (it forbids only `/`, `.` and
 * whitespace), and on purpose: `#`, `?` and `%` are legal there and still turn
 * a pasted link into a different URL.
 */
export function slugFromTitle(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** One `<option>` in «الكورس المرتبط». */
export interface CourseChoice {
  id: string;
  label: string;
  /** Held by ANOTHER book — shown, greyed, and saying which one. */
  disabled: boolean;
}

/**
 * The course picker's options for one book.
 *
 * ## One book per course, one course per book — and why that is still right
 *
 * `books.course_id` is UNIQUE, and this picker keeps it that way rather than
 * asking for a join table. Every surface that shows a course's book reads ONE:
 * the course page's «اطلب الكتاب», the dashboard card, the player outline, and
 * `BookOrdersService.priceCourseBook`, which CHARGES a course-page order from
 * that single row (`courseBook()` in the API). A course holding two books would
 * need a rule for which one that button sells — a pricing decision, not a
 * schema one — and a book in two courses is not a real object here: the عربي
 * and لغات editions are different printed books with different rows.
 *
 * A second-term volume therefore takes the course over from the first-term one
 * when the term turns — unlink, then link — and `fieldCourseHint` says so.
 *
 * ## What this function adds on top of the list
 *
 *   · A course another book already holds is DISABLED and names that book. It
 *     used to be pickable, and the save came back with a generic «مقدرناش
 *     نحفظ» from the API's 409 — the admin had no way to learn why.
 *   · Only published courses are offered (a draft's book has nothing to point
 *     at yet), EXCEPT the one this book is already linked to. Dropping that one
 *     made the `<select>` show «من غير كورس» over a link that exists — and a
 *     save from that screen would have looked like it unlinked the book.
 */
export function courseChoices(
  courses: readonly CourseOption[],
  currentCourseId: string | null,
  takenBy: Readonly<Record<string, string>>,
): CourseChoice[] {
  return courses
    .filter(
      (course) =>
        course.status === undefined ||
        course.status === 'published' ||
        course.id === currentCourseId,
    )
    .map((course) => {
      const holder = course.id === currentCourseId ? undefined : takenBy[course.id];
      const draft = course.status !== undefined && course.status !== 'published';
      const suffix = [
        draft ? c.fieldCourseDraft : null,
        holder !== undefined ? formatCopy(c.fieldCourseTaken, { title: holder }) : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');
      return {
        id: course.id,
        label:
          suffix === ''
            ? courseOptionLabel(course)
            : formatCopy(c.fieldCourseWithNote, { label: courseOptionLabel(course), note: suffix }),
        disabled: holder !== undefined,
      };
    });
}
