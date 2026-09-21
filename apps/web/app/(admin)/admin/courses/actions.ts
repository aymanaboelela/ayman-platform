'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import {
  CourseCreateSchema,
  type CourseEmphasis,
  CourseEmphasisSchema,
  CourseExamPatchSchema,
  CourseStatusPatchSchema,
  CourseTermSchema,
  CourseUpdateSchema,
  CourseVideoCheckSchema,
  type CourseVideoCheck,
  ExamScaffoldResultSchema,
  PublishAllResultSchema,
  type PublishAllResult,
  ReorderSchema,
  StreamChoiceSchema,
  streamFlagsOf,
  TermSetOpenResultSchema,
} from '@ayman/contracts';
import { VideoEmbedStatusSchema, type VideoEmbedStatus } from '@ayman/contracts/video';
import {
  AdminCourseMonthSchema,
  CourseMonthWriteSchema,
  LessonMonthsSchema,
  type CourseMonthWriteInput,
  type LessonMonthsWriteInput,
} from '@ayman/contracts/months';
import {
  CourseMonthPatchSchema,
  MONTH_OPEN_BLOCKED_CODE,
  type CourseMonthPatchInput,
  AdoptUntaggedLessonsResultSchema,
  LegacyMonthBackfillResultSchema,
  type LegacyMonthBackfillResult,
} from '@ayman/contracts/admin/content-months';
import { formatCopy } from '@ayman/contracts/format';
import {
  VideoUploadSessionSchema,
  VideoUploadStatusSchema,
  type VideoUploadSession,
  type VideoUploadStatus,
} from '@ayman/contracts/admin/video-upload';
import { copy } from '@ayman/contracts/copy/admin';
import { ApiRequestError } from '@/lib/api';
import { apiCommand, apiGetAuthed, apiSend } from '@/lib/api-server';
import { TAG_COURSES, courseTag } from '@/lib/cache-tags';
import { submitToIndexNow } from '@/lib/seo/indexnow';

/** The API's course row, as much of it as the admin UI needs back. */
const CourseRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

function readTrackId(formData: FormData): string | null {
  const value = formData.get('trackId');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `CourseForm` already converts EGP pounds to cents before setting this key. */
function readOptionalPriceCents(formData: FormData, key: string): number | null {
  const value = formData.get(key);
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The «المدارس» radios arrive as one of three words; the columns are a pair of
 * booleans. `streamFlagsOf` in the contracts package owns that expansion so
 * the form and this action cannot disagree about what «الاتنين» means.
 *
 * An absent or unrecognised value falls back to `both`, not to a throw: a
 * course reachable by everyone is the same thing every row meant before this
 * field existed, and the schema's own default says the same.
 */
function readStream(formData: FormData): { forGeneral: boolean; forLanguages: boolean } {
  const parsed = StreamChoiceSchema.safeParse(formData.get('stream'));
  return streamFlagsOf(parsed.success ? parsed.data : 'both');
}

/**
 * The «مقفول» checkbox.
 *
 * `getAll`, not `get`: the form submits a hidden `false` and, when ticked, a
 * `true` after it — the standard way to make an unchecked box mean something
 * rather than vanish. So the LAST value is the answer, and a form that somehow
 * sends neither falls back to `false`.
 *
 * Open is the safe fallback in a way `true` would not be: a bug that opened a
 * course wrongly is embarrassing, and one that closed every course would lock
 * every student out of everything.
 */
function readRequiresGrant(formData: FormData): boolean {
  const values = formData.getAll('requiresGrant');
  return values[values.length - 1] === 'true';
}

/**
 * اكتمل نزول المحتوى. Same hidden-false pair as `requiresGrant` above, and
 * `false` is the safe fallback for the same shape of reason: a course wrongly
 * marked unfinished understates itself, where one wrongly marked finished
 * tells a student they are done with a course that is still being uploaded.
 */
function readContentComplete(formData: FormData): boolean {
  const values = formData.getAll('contentComplete');
  return values[values.length - 1] === 'true';
}

/**
 * The card's badge, or `null` for «من غير شارة».
 *
 * Parsed against the enum rather than cast, because this string arrives from a
 * `<select>` and an unrecognised value should be "no badge" — the state every
 * course is already in — instead of reaching Prisma as an invalid enum member
 * and 500ing the save.
 */
function readEmphasis(formData: FormData): CourseEmphasis | null {
  const parsed = CourseEmphasisSchema.safeParse(formData.get('emphasis'));
  return parsed.success ? parsed.data : null;
}

/**
 * Invalidates BOTH the course and the catalog list. Every write below uses it.
 *
 * ## Why the list, every time
 *
 * `updateCourseAction` used to invalidate only `courseTag(courseId)`, on the
 * reasoning that "editing a title must not evict the other 40 courses". That is
 * exactly backwards: the catalog card RENDERS the title. It also renders the
 * cover, the subtitle, the subject, the year, the track, both stream flags, the
 * lesson count and the total duration — `CatalogCourseSchema` has thirteen
 * public fields and the admin can write eleven of them.
 *
 * So the list was only ever refreshed by publish/unpublish, and every other
 * edit stayed invisible on the public site until the entry aged out on its own:
 * `cacheLife('minutes')` for the landing strip, `cacheLife('hours')` for
 * `/courses`. Reported as «لما بغير صورة الكورس من الداشبورد برضه مش بتتغير برا
 * في الهوم بيدج واللاندينج» — the admin saved, the admin page showed the new
 * cover, and the landing page kept the old one for the rest of the afternoon.
 *
 * ## Why not tag the list per course instead
 *
 * `getCatalog()` explains it: one `cacheTag` call accepts at most 128 tags and
 * silently DROPS the excess with a console warning, so a per-course tag on the
 * list becomes a silent correctness hole the day the catalog passes 128 rows.
 * The coarse tag is the safe shape; the bug was never tagging it.
 *
 * ## What it costs
 *
 * The next visitor after an admin edit re-fetches `/api/catalog/courses` once —
 * one small query, on a page whose edits happen a handful of times a day. That
 * is the entire price of the public site agreeing with what was just saved.
 */
function invalidateCourse(courseId: string): void {
  updateTag(courseTag(courseId));
  updateTag(TAG_COURSES);
}

export async function createCourseAction(formData: FormData): Promise<void> {
  const emphasis = readEmphasis(formData);
  const parsed = CourseCreateSchema.parse({
    slug: formData.get('slug'),
    title: formData.get('title'),
    subtitle: readOptionalText(formData, 'subtitle'),
    description: readOptionalText(formData, 'description'),
    systemId: formData.get('systemId'),
    year: Number(formData.get('year')),
    trackId: readTrackId(formData),
    subjectId: formData.get('subjectId'),
    emphasis,
    // Cleared with the badge: the CHECK forbids a note without one, and the
    // form already blanks the input, so this only guards a hand-built POST.
    emphasisNote: emphasis === null ? null : readOptionalText(formData, 'emphasisNote'),
    // Independent of `emphasis` — unlike `emphasisNote` there is no badge to
    // clear it alongside.
    comingSoonNote: readOptionalText(formData, 'comingSoonNote'),
    // «ميعاد المحاضرة». `readOptionalText` is what makes a cleared input mean
    // «مفيش ميعاد معلن»: it turns `''` into `null`, and `null` is the only
    // value that removes the line from the student's band. Sending `''` would
    // be a 400 — the schema trims and refuses an empty string.
    scheduleNote: readOptionalText(formData, 'scheduleNote'),
    whatsappGroupUrl: readOptionalText(formData, 'whatsappGroupUrl'),
    contentComplete: readContentComplete(formData),
    coverKey: readOptionalText(formData, 'coverKey'),
    requiresGrant: readRequiresGrant(formData),
    monthlyPriceCents: readOptionalPriceCents(formData, 'monthlyPriceCents'),
    /*
     * NO `quarterlyPriceCents`, here or in the update below.
     *
     * «٣ شهور» is off the shelf: the field is gone from `course-form.tsx`, and
     * `CourseService.assertQuarterlyRetired` answers 400 to any non-null
     * value — so sending one is a save the instructor cannot act on.
     *
     * ABSENT rather than an explicit `null`, which is the difference that
     * matters. On create the schema's own `.default(null)` fills it. On update
     * `CourseUpdateSchema` is built with `partialWithoutDefaults`, so an
     * absent key leaves the column exactly where it is — and a price a past
     * subscription was sold at stays readable to the finance screens instead
     * of being wiped by the next rename of the course.
     */
    yearlyPriceCents: readOptionalPriceCents(formData, 'yearlyPriceCents'),
    bookTitle: readOptionalText(formData, 'bookTitle'),
    bookPriceCents: readOptionalPriceCents(formData, 'bookPriceCents'),
    ...readStream(formData),
  });

  const course = await apiSend('POST', '/api/admin/courses', CourseRowSchema, parsed);

  /*
   * A new course arrives with somewhere to put the first lecture, and a first
   * lecture already in it.
   *
   * It used to arrive empty, so the instructor's next two acts were always the
   * same two: make a section, then make a lecture inside it — and a course
   * whose only visible control was «قسم جديد» invited the reading that a
   * section is the unit of the course. It is not; the lecture is. «الكورس
   * بيضاف وجواه المحاضرة. مش بيضاف له section لوحده.»
   *
   * Both are ordinary draft rows with editable names, so this is a starting
   * point rather than a decision — and it is deliberately NOT fatal. A course
   * that exists with no section is recoverable in one click; a `redirect` the
   * instructor never reaches because the scaffold 500'd is not.
   */
  await scaffoldFirstLesson(course.id);

  // A new draft is not in the public catalog, so no cache tag changes — only
  // the admin list, which is not cached.
  revalidatePath('/admin/courses');
  redirect(`/admin/courses/${course.id}`);
}

/**
 * The section-and-lecture a new course opens with. Swallows its own failures:
 * see `createCourseAction`.
 */
async function scaffoldFirstLesson(courseId: string): Promise<void> {
  try {
    const section = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/sections`,
      z.object({ id: z.uuid() }),
      { title: copy.admin.course.firstSectionTitle, summary: null, isPublished: false },
    );
    await createLessonAction(courseId, section.id, {
      title: copy.admin.course.firstLessonTitle,
      kind: 'video',
    });
  } catch {
    // The course itself is saved and the editor offers «قسم جديد» — nothing
    // here is worth failing the creation over.
  }
}

export async function updateCourseAction(
  courseId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const emphasis = readEmphasis(formData);
    const parsed = CourseUpdateSchema.parse({
      slug: formData.get('slug'),
      title: formData.get('title'),
      subtitle: readOptionalText(formData, 'subtitle'),
      description: readOptionalText(formData, 'description'),
      systemId: formData.get('systemId'),
      year: Number(formData.get('year')),
      trackId: readTrackId(formData),
      subjectId: formData.get('subjectId'),
      emphasis,
      // Cleared with the badge: the CHECK forbids a note without one, and the
      // form already blanks the input, so this only guards a hand-built POST.
      emphasisNote: emphasis === null ? null : readOptionalText(formData, 'emphasisNote'),
      // Independent of `emphasis` — unlike `emphasisNote` there is no badge to
      // clear it alongside.
      comingSoonNote: readOptionalText(formData, 'comingSoonNote'),
      // Same as the create above — `''` becomes `null`, which is how the
      // instructor clears a schedule that no longer applies.
      scheduleNote: readOptionalText(formData, 'scheduleNote'),
      whatsappGroupUrl: readOptionalText(formData, 'whatsappGroupUrl'),
      contentComplete: readContentComplete(formData),
      coverKey: readOptionalText(formData, 'coverKey'),
      requiresGrant: readRequiresGrant(formData),
      monthlyPriceCents: readOptionalPriceCents(formData, 'monthlyPriceCents'),
      // No `quarterlyPriceCents` — see the note in `createCourseAction` above.
      yearlyPriceCents: readOptionalPriceCents(formData, 'yearlyPriceCents'),
      bookTitle: readOptionalText(formData, 'bookTitle'),
      bookPriceCents: readOptionalPriceCents(formData, 'bookPriceCents'),
      ...readStream(formData),
    });

    await apiSend('PATCH', `/api/admin/courses/${courseId}`, CourseRowSchema, parsed);

    // `updateTag`, not `revalidateTag`, so the editor's next read is their own
    // write — and the LIST too, because this endpoint writes eleven of the
    // thirteen fields the catalog card renders. See `invalidateCourse`.
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    /*
     * Arabic, because this one is now SHOWN — `<CourseForm>` reads the result
     * and toasts it, where before it dropped it. A Zod issue path or a
     * `PATCH … failed with 409` in the middle of an Arabic screen tells the
     * instructor nothing they can act on.
     *
     * Two failures have a specific cause worth naming, and both are fixable by
     * changing one field: a 409 is always the slug, and a 400 is effectively
     * always `assertOfferingExists` — the taxonomy tuple has no offering row,
     * which is otherwise invisible and makes every save fail forever.
     *
     * The fallback is `autosave.error` rather than `common.saveFailed`. This
     * form saves itself now, and `saveFailed` reads «التغييرات اترجعت زي ما
     * كانت» — which was true of a submit that rolled back and is simply untrue
     * here: the value stays on screen, unsaved, waiting for a retry.
     */
    const message = (): string => {
      if (!(error instanceof Error)) return copy.admin.autosave.error;
      if (error.message.includes('failed with 409')) return copy.admin.course.slugTaken;
      if (error.message.includes('failed with 400')) return copy.admin.course.offeringMissing;
      return copy.admin.autosave.error;
    };
    return { ok: false, message: message() };
  }
}

export async function setCourseStatusAction(
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionResult> {
  try {
    const body = CourseStatusPatchSchema.parse({ status });
    const row = await apiSend(
      'PATCH',
      `/api/admin/courses/${courseId}/status`,
      CourseRowSchema,
      body,
    );

    /*
     * Push the new URL to Bing rather than waiting for a crawl — this is the
     * press that puts a course on the public internet, and `/courses` changes
     * with it because the catalog is a list this course just joined.
     *
     * ⚠️ Only on the way IN. Unpublishing must not submit: IndexNow is an
     * assertion that a URL belongs in an index, and announcing one that now
     * 404s is the fastest way to get a host's submissions distrusted. The
     * removal happens through the sitemap, which no longer lists it.
     *
     * `row.slug`, from the API's response — the action is handed an id, and
     * the slug is the only thing either URL can be built from. See
     * `submitToIndexNow` for why this can never fail the publish.
     */
    if (row.status === 'published') {
      after(() => submitToIndexNow([`/courses/${row.slug}`, '/courses']));
    }

    // Publishing changes LIST MEMBERSHIP rather than a field on the card. It
    // was once the only operation that touched the catalog tag; it is now one
    // of many, because every other write turned out to change the card too.
    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    // A 400 here means the API's "at least one published lesson" rule
    // fired. The admin never sees the raw API string — only the Arabic copy
    // for that exact failure — and a non-400 failure still surfaces as a
    // real (non-silent) error, just the generic one.
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? copy.admin.course.publishBlocked
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

/**
 * The one press that makes a course visible: publishes it AND every lecture in
 * it that a student could actually do.
 *
 * Distinct from `setCourseStatusAction`, which flips the course's own flag and
 * leaves the section and lesson flags exactly where they were — the shape that
 * produced a published course showing students nothing.
 *
 * Returns the report rather than a bare ok, because the useful half is what did
 * NOT go live: «ليه المحاضرة دي مش ظاهرة» is the next question, and this is the
 * only moment anything knows the answer.
 */
export async function publishCourseAction(
  courseId: string,
): Promise<{ ok: true; result: PublishAllResult } | { ok: false; message: string }> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/publish-all`,
      PublishAllResultSchema,
      {},
    );

    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, result };
  } catch (error) {
    // A 400 is the "nothing in here can be shown" refusal — the only failure
    // with a cause the instructor can act on.
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? copy.admin.course.publishBlocked
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

/**
 * Asks YouTube about every video in the course, in one press.
 *
 * `apiGetAuthed` and not `apiSend`: it writes nothing. It is slow by nature —
 * one round trip per video, in series on the API so YouTube does not throttle
 * a burst from one IP — so the button that calls it says it is working.
 */
export async function checkCourseVideosAction(
  courseId: string,
): Promise<{ ok: true; result: CourseVideoCheck } | { ok: false; message: string }> {
  try {
    const result = await apiGetAuthed(
      `/api/admin/courses/${courseId}/video-check`,
      CourseVideoCheckSchema,
    );
    return { ok: true, result };
  } catch {
    return { ok: false, message: copy.admin.course.videoCheckFailed };
  }
}

const DeleteCourseResultSchema = z.object({ id: z.uuid() });

/**
 * I4 (audit): the API refuses with a 409 when the course has student quiz
 * attempts — attempt_events is append-only at the DB level, so a course with
 * any attempt can NEVER be hard-deleted, not even after unpublishing. The
 * admin gets that fact, in Arabic, pointing at archiving — never a raw
 * stack trace. A course with no attempts still hard-deletes normally.
 */
export async function deleteCourseAction(courseId: string): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/courses/${courseId}`, DeleteCourseResultSchema);
    // This invalidated NOTHING. A deleted course kept its card on the public
    // catalog — and its detail page kept answering — until the cache entry
    // aged out on its own, which for `/courses` is `cacheLife('hours')`. Of
    // every stale-list case this was the worst: the others showed old data,
    // this one advertised a course that no longer existed.
    invalidateCourse(courseId);
    revalidatePath('/admin/courses');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.course.deleteBlockedAttempts
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}

/** Called once per drag session, after the client-side debounce settles. */
export async function reorderLessonsAction(
  courseId: string,
  sectionId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/sections/${sectionId}/lessons/order`,
      z.object({ updated: z.number().int() }),
      body,
    );
    invalidateCourse(courseId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** Called once per drag session on the section list of a course. */
export async function reorderSectionsAction(
  courseId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/courses/${courseId}/sections/order`,
      z.object({ updated: z.number().int() }),
      body,
    );
    invalidateCourse(courseId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

const CreateSectionResultSchema = z.object({ id: z.uuid() });

export async function createSectionAction(courseId: string, title: string): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/sections`,
      CreateSectionResultSchema,
      { title, summary: null, isPublished: false },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setSectionPublishedAction(
  courseId: string,
  sectionId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    await apiSend(
      'PATCH',
      `/api/admin/sections/${sectionId}`,
      z.object({ id: z.uuid() }),
      { isPublished },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function updateSectionAction(
  courseId: string,
  sectionId: string,
  input: { title?: string; summary?: string | null; termId?: string | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }), input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The API 409s when the section holds a lesson with student attempts.
 *
 * That refusal is PERMANENT — `attempt_events` is append-only at the database
 * level, so no later admin action makes this delete succeed. The Arabic copy
 * therefore names the real constraint and points at unpublishing, which
 * achieves what the admin actually wanted (the section gone from every
 * student's view) without destroying anything.
 *
 * `TAG_COURSES` as well as the per-course tag: deleting a section can remove
 * the last published lesson, which changes the course's own membership of the
 * public catalog.
 */
export async function deleteSectionAction(
  courseId: string,
  sectionId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/sections/${sectionId}`, z.object({ id: z.uuid() }));
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.section.deleteBlockedAttempts
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

// ── الترم الأول / الترم الثاني ────────────────────────────────────────────

export async function createTermAction(
  courseId: string,
  input: { title: string; priceCents: number | null },
): Promise<ActionResult> {
  try {
    await apiSend('POST', `/api/admin/courses/${courseId}/terms`, CourseTermSchema, input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function updateTermAction(
  courseId: string,
  termId: string,
  input: { title?: string; priceCents?: number | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/terms/${termId}`, CourseTermSchema, input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The open/close switch. Returns `revokedGrantCount` so the caller can tell
 * the admin, in the moment, exactly what closing just did — see
 * `TermService.setOpen`'s own note on why that number matters.
 */
export async function setTermOpenAction(
  courseId: string,
  termId: string,
  isOpen: boolean,
): Promise<ActionResult & { revokedGrantCount?: number }> {
  try {
    const result = await apiSend(
      'PATCH',
      `/api/admin/terms/${termId}/open`,
      TermSetOpenResultSchema,
      { isOpen },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, revokedGrantCount: result.revokedGrantCount };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

// ── شهور المنهج ─────────────────────────────────────────────────

/**
 * `ActionResult`, plus the one number a month refusal carries.
 *
 * `untaggedLessonCount` is PRESENT — even as `0` — exactly when the API
 * refused to open a month because the course still has published lectures in
 * no month at all. The panel branches on its presence, not on its value: see
 * `monthOpenBlocked` below for the case where the number itself is lost.
 */
export type MonthActionResult = ActionResult & {
  untaggedLessonCount?: number;
  /** The month that was just created, on `createMonthAction` alone.
   *  `<StartByMonth>` chains straight into `adoptUntaggedLessonsAction` with
   *  it — the alternative is re-reading the list to find the row it just made,
   *  which is a round trip to learn something the response already knew. */
  month?: { id: string };
};

/**
 * Was this the «فيه محاضرات من غير شهر» refusal, and how many?
 *
 * ⚠️ Read out of the thrown error's TEXT by regex, not by parsing it as JSON.
 * `apiSend` folds the response body into the message and slices it to 300
 * characters — and this 409's body carries the whole Arabic sentence, so its
 * tail (with the closing brace) is routinely cut off and `JSON.parse` would
 * throw on a body that was perfectly well formed on the wire. The two fields
 * this needs sit before the cut.
 *
 * `null` means «مش الرفض ده»: a duplicate `monthIndex` is a 409 too, and it has to
 * keep reading as the generic failure. `0` means the code was there and the
 * number was not — the caller falls back to the count it already holds on the
 * month row, which is why that count is repeated on every row.
 */
function monthOpenBlocked(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  if (!error.message.includes(`"code":"${MONTH_OPEN_BLOCKED_CODE}"`)) return null;
  const match = /"untaggedLessonCount":\s*(\d+)/.exec(error.message);
  return match ? Number(match[1]) : 0;
}

/** The two refusals the month panel renders, and the generic failure for
 *  everything else — a duplicate month number included, which the panel shows
 *  as a plain error because the admin can read the numbers on screen. */
function monthFailure(error: unknown): MonthActionResult {
  const blocked = monthOpenBlocked(error);
  // `month.actionFailed` («مااتنفّذش») and not `common.saveFailed» («التغييرات
  // اترجعت زي ما كانت»): a refused open or a refused rename rolled nothing
  // back, it simply did not happen, and telling an instructor his work was
  // reverted when it was not sends him looking for changes to redo.
  if (blocked === null) return { ok: false, message: copy.admin.month.actionFailed };
  return {
    ok: false,
    // `blocked || …` is not possible here — nothing in this file knows the
    // month row. At `0` the sentence would read «فيه 0 محاضرة», so the generic
    // message goes in the toast and the panel renders the real sentence from
    // its own `untaggedLessonCount`, which arrives on every row for this.
    message:
      blocked > 0
        ? formatCopy(copy.admin.month.blockedByUntagged, { n: blocked })
        : copy.admin.month.actionFailed,
    untaggedLessonCount: blocked,
  };
}

export async function createMonthAction(
  courseId: string,
  input: CourseMonthWriteInput,
): Promise<MonthActionResult> {
  try {
    const body = CourseMonthWriteSchema.parse(input);
    const month = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/months`,
      AdminCourseMonthSchema,
      body,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, month: { id: month.id } };
  } catch (error) {
    return monthFailure(error);
  }
}

/**
 * Rename, renumber, move the date, open or close — all four ride the one PATCH.
 *
 * `CourseMonthPatchSchema` and never `CourseMonthWriteSchema.partial()`: a
 * rename that carried `isOpen: true` underneath it would put a month on sale
 * that the instructor had deliberately closed. The schema's own note has the
 * production incident that rule comes from.
 */
export async function updateMonthAction(
  courseId: string,
  monthId: string,
  input: CourseMonthPatchInput,
): Promise<MonthActionResult> {
  try {
    const body = CourseMonthPatchSchema.parse(input);
    await apiSend(
      'PATCH',
      `/api/admin/courses/${courseId}/months/${monthId}`,
      AdminCourseMonthSchema,
      body,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return monthFailure(error);
  }
}

/**
 * 204 and no body, so `apiCommand` rather than `apiSend` — which would try to
 * parse a response that does not exist.
 *
 * The 409 is PERMANENT: `payment_submission_months` is the record of what a
 * transfer bought, and its month side is `ON DELETE RESTRICT` so the row can
 * never be orphaned into an unexplainable payment. `deleteBlockedPaid` says so
 * and points at closing the month instead, which is what the instructor
 * actually wants.
 */
export async function deleteMonthAction(
  courseId: string,
  monthId: string,
): Promise<ActionResult> {
  try {
    await apiCommand('DELETE', `/api/admin/courses/${courseId}/months/${monthId}`);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof ApiRequestError && error.status === 409
        ? copy.admin.month.deleteBlockedPaid
        : copy.admin.month.actionFailed;
    return { ok: false, message };
  }
}

/**
 * «حط كل المحاضرات اللي من غير شهر في الشهر ده» — step one of turning an
 * existing course over.
 */
export async function adoptUntaggedLessonsAction(
  courseId: string,
  monthId: string,
): Promise<{ ok: true; adopted: number } | { ok: false; message: string }> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/months/${monthId}/adopt-untagged`,
      AdoptUntaggedLessonsResultSchema,
      undefined,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, adopted: result.adopted };
  } catch {
    return { ok: false, message: copy.admin.month.actionFailed };
  }
}

/**
 * «الي حد اشترك دلوقتي أو قبل كده حطه في الشهر ده» — step two.
 *
 * Two presses by design. The first runs with `dryRun` and answers with a
 * COUNT; the second writes. The instructor is handing out access to students
 * he cannot see from this screen, so the number goes in front of him before he
 * commits, the same way «اتقفل الترم، وسحبنا الوصول من {n} طالب» reports the
 * cascade a term close already caused.
 */
export async function openMonthForSubscribersAction(
  courseId: string,
  monthId: string,
  dryRun: boolean,
): Promise<{ ok: true; result: LegacyMonthBackfillResult } | { ok: false; message: string }> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/months/open-for-subscribers`,
      LegacyMonthBackfillResultSchema,
      { monthId, dryRun },
    );
    if (!dryRun) {
      invalidateCourse(courseId);
      revalidatePath(`/admin/courses/${courseId}`);
    }
    return { ok: true, result };
  } catch {
    return { ok: false, message: copy.admin.month.actionFailed };
  }
}

/**
 * «الشهر: ٢ — وكمان لشهر ٣» — the whole set, rewritten at once.
 *
 * A PUT and not two calls: `LessonMonthsWriteSchema`'s own note says why a
 * half-applied set is a state nobody chose. The contract also refuses extras
 * with no primary, so the picker disables them rather than letting a 400
 * explain it.
 */
export async function setLessonMonthsAction(
  courseId: string,
  lessonId: string,
  input: LessonMonthsWriteInput,
): Promise<ActionResult> {
  try {
    await apiSend('PUT', `/api/admin/lessons/${lessonId}/months`, LessonMonthsSchema, input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: copy.admin.month.actionFailed };
  }
}

const CreateLessonResultSchema = z.object({ id: z.uuid() });

export type CreateLessonInput = {
  title: string;
  kind: 'video' | 'quiz' | 'attachment' | 'text';
  /**
   * «الشهر», answered while the lecture is being written rather than after it.
   *
   * Optional, and absent everywhere a course has no months — `scaffoldFirstLesson`
   * included, which runs before the instructor has configured any.
   */
  months?: LessonMonthsWriteInput;
};

/**
 * Creates the lecture, then tags it — two calls, because the id the tag hangs
 * off does not exist until the first one answers.
 *
 * The order is the safe one. A lecture created and left untagged is a DRAFT
 * with no month, which is the state every lecture starts in and which
 * `CourseMonthService.assertNothingUntagged` already refuses to sell around.
 * The reverse — reporting success on an untagged lecture — is the one outcome
 * that must not happen silently, so the months half has its own failure.
 */
export async function createLessonAction(
  courseId: string,
  sectionId: string,
  input: CreateLessonInput,
): Promise<ActionResult> {
  let lessonId: string;
  try {
    const lesson = await apiSend(
      'POST',
      `/api/admin/sections/${sectionId}/lessons`,
      CreateLessonResultSchema,
      {
        title: input.title,
        kind: input.kind,
        isPublished: false,
        isFreePreview: false,
        estimatedSeconds: 0,
        completionMode: 'manual',
        completionMinViewSeconds: null,
        completionPassGrade: null,
      },
    );
    lessonId = lesson.id;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }

  // No month picked is not a write. `primaryMonthId: null` with no extras is
  // what the endpoint already means by «مش متحطلها شهر», and a brand-new
  // lecture is in exactly that state — the PUT would be a round trip that
  // changes nothing.
  const months = input.months;
  const tagged =
    months === undefined || months.primaryMonthId === null
      ? true
      : await apiSend('PUT', `/api/admin/lessons/${lessonId}/months`, LessonMonthsSchema, months)
          .then(() => true)
          .catch(() => false);

  invalidateCourse(courseId);
  revalidatePath(`/admin/courses/${courseId}`);

  /*
   * ⚠️ `autosave.error` («مااتحفظش»), never `common.saveFailed`.
   *
   * `saveFailed` reads «التغييرات اترجعت زي ما كانت», and here nothing was
   * rolled back: the lecture exists, it is in the outline, and the only thing
   * missing is its month. Sending the instructor looking for a lecture that is
   * on the page in front of them is worse than the terse sentence. Same
   * distinction `updateCourseAction` draws for its own fallback.
   */
  return tagged ? { ok: true } : { ok: false, message: copy.admin.autosave.error };
}

export async function setLessonPublishedAction(
  courseId: string,
  lessonId: string,
  isPublished: boolean,
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }), {
      isPublished,
    });
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Mirrors `LessonUpdateSchema`'s partial shape, minus `kind`.
 *
 * `kind` is deliberately absent: changing a video lesson into a quiz lesson
 * would orphan its `LessonVideo` row and leave a quiz lesson with no quiz, and
 * the UI offers delete-and-recreate instead — the same reasoning that keeps a
 * resource's kind uneditable.
 *
 * The completion rule is a COUPLED pair. `LessonUpdateSchema.refine` requires
 * `completionMinViewSeconds` with `on_view`, and `completionPassGrade` with
 * `on_grade`/`on_pass`. Callers must send the mode and its dependent value in
 * the SAME payload; a mode sent alone is a 400 the admin cannot act on.
 */
export type UpdateLessonInput = {
  title?: string;
  isPublished?: boolean;
  isFreePreview?: boolean;
  estimatedSeconds?: number;
  completionMode?: 'none' | 'manual' | 'on_view' | 'on_grade' | 'on_pass';
  completionMinViewSeconds?: number | null;
  completionPassGrade?: number | null;
  /**
   * «ينزل الساعة ٨» — an ISO instant WITH an offset, or `null` to cancel.
   *
   * An instant, never the `2026-09-12T20:00` a `datetime-local` input hands
   * back: a zoneless string is read as UTC by every parser downstream, which
   * publishes a Cairo 8pm lecture at 11pm. `lesson-settings-form.tsx`'s
   * `toInstant` is where that conversion happens and why.
   */
  publishAt?: string | null;
  description?: string | null;
};

export async function updateLessonAction(
  courseId: string,
  lessonId: string,
  input: UpdateLessonInput,
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }), input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** 409 when the lesson has student attempts — see `deleteSectionAction`. */
export async function deleteLessonAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/lessons/${lessonId}`, z.object({ id: z.uuid() }));
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? copy.admin.lesson.deleteBlockedAttempts
        : copy.admin.common.saveFailed;
    return { ok: false, message };
  }
}

/**
 * Detaches the video, leaving the lesson itself in place. The API asserts the
 * lesson is a video lesson first, so this cannot silently no-op on a quiz.
 */
export async function removeLessonVideoAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend(
      'DELETE',
      `/api/admin/lessons/${lessonId}/video`,
      z.object({ lessonId: z.uuid() }),
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * How long the pasted video runs, AND whether YouTube will let it play inside
 * our page — asked of the API the moment a complete id appears in the field, so
 * the admin sees both before saving rather than hearing the second one from a
 * student.
 *
 * Never throws: a probe that fails is a line of text under the field, not a
 * broken form. The save re-asks server-side anyway.
 */
export async function probeVideoDurationAction(
  url: string,
): Promise<{ durationSeconds: number | null; embed: VideoEmbedStatus }> {
  try {
    return await apiGetAuthed(
      `/api/admin/lessons/video-duration?url=${encodeURIComponent(url)}`,
      z.object({
        durationSeconds: z.number().int().positive().nullable(),
        embed: VideoEmbedStatusSchema,
      }),
    );
  } catch {
    // `unknown`, never `ok`. Reporting a check we could not run as a pass is
    // the same silent pass that let unplayable videos reach students already.
    return { durationSeconds: null, embed: 'unknown' };
  }
}

/* ── الرفع المباشر ─────────────────────────────────────────────────────────
 *
 * Three actions around a transfer that goes NOWHERE NEAR a Server Action.
 *
 * ⚠️ That is the whole design and it is worth stating loudly, because the
 * obvious implementation is the broken one: a Server Action body is capped at
 * 1 MB by default, silently, and this platform has already spent a session
 * discovering that every upload died at exactly that size with a small test
 * file passing happily. A two-hour lecture is three thousand times the cap.
 *
 * So these actions carry JSON only. The bytes go from the browser straight to
 * the bucket with pre-signed URLs the API signs — see
 * `video-upload.service.ts`.
 */

export async function startVideoUploadAction(
  lessonId: string,
  input: { fileName: string; sizeBytes: number; contentType: string },
): Promise<{ ok: true; session: VideoUploadSession } | { ok: false; message: string }> {
  try {
    const session = await apiSend(
      'POST',
      `/api/admin/lessons/${lessonId}/video/upload`,
      VideoUploadSessionSchema,
      input,
    );
    return { ok: true, session };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function completeVideoUploadAction(
  courseId: string,
  lessonId: string,
  input: { videoId: string; uploadId: string; parts: { partNumber: number; etag: string }[] },
): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/lessons/${lessonId}/video/upload/complete`,
      z.object({ status: z.string() }),
      input,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function abortVideoUploadAction(
  courseId: string,
  lessonId: string,
  input: { videoId: string; uploadId: string },
): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/lessons/${lessonId}/video/upload/abort`,
      z.object({ status: z.string() }),
      input,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Polled while the encoder works.
 *
 * Returns `null` rather than throwing on any failure: this runs on a timer
 * behind a progress bar, and one bad poll must not replace a working screen
 * with an error. The next tick is a second away.
 */
export async function videoUploadStatusAction(
  lessonId: string,
): Promise<VideoUploadStatus | null> {
  try {
    return await apiGetAuthed(
      `/api/admin/lessons/${lessonId}/video/upload/status`,
      VideoUploadStatusSchema,
    );
  } catch {
    return null;
  }
}

export async function setLessonVideoAction(
  courseId: string,
  lessonId: string,
  /**
   * `durationSeconds` is OPTIONAL and normally absent — the API asks YouTube.
   * It is sent only when the browser already knows the number (its own probe
   * succeeded) or the admin typed one because nothing else could find it.
   */
  input: { url: string; durationSeconds?: number; posterKey: string | null },
): Promise<ActionResult> {
  try {
    await apiSend(
      'PUT',
      `/api/admin/lessons/${lessonId}/video`,
      z.object({ lessonId: z.uuid() }),
      {
        provider: 'youtube',
        url: input.url,
        durationSeconds: input.durationSeconds,
        // Was a hardcoded `null`. The column, the DTO and the player's
        // `posterUrl` all existed; this line is the whole reason a lesson
        // could never have a thumbnail.
        posterKey: input.posterKey,
      },
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    // 422 is the ONE refusal with a human cause: the save carried no duration
    // and the API's own probe came back empty. Surfacing `apiSend`'s message
    // here would print "PUT /api/… failed with 422: {…}" at an instructor.
    if (error instanceof Error && error.message.includes('failed with 422')) {
      return { ok: false, message: copy.admin.lesson.durationUnavailable };
    }
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setLessonTextAction(
  courseId: string,
  lessonId: string,
  bodyHtml: string,
): Promise<ActionResult> {
  try {
    await apiSend('PUT', `/api/admin/lessons/${lessonId}/text`, z.object({ lessonId: z.uuid() }), {
      bodyHtml,
    });
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * الواجب — the exercise on a lecture.
 *
 * `lesson:write`, like the video and the text: this is authoring the lecture's
 * own content. Reading and DECIDING what students hand back is `homework:*`,
 * at `/admin/homework`, and deliberately a different permission.
 *
 * Autosaved from the panel, which is why the whole triple is sent on every
 * write: a PUT that carried only the changed field would need the endpoint to
 * be a PATCH, and `HomeworkWriteSchema`'s defaults would then fill the two it
 * did not mention — the exact failure `partialWithoutDefaults` exists to stop
 * elsewhere in this codebase.
 */
export async function setLessonHomeworkAction(
  courseId: string,
  lessonId: string,
  input: { body: string; maxImages: number; isPublished: boolean },
): Promise<ActionResult> {
  try {
    await apiSend(
      'PUT',
      `/api/admin/lessons/${lessonId}/homework`,
      z.object({ lessonId: z.uuid() }),
      input,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** «شيل الواجب». Submissions already handed in are untouched — see
 *  `LessonService.removeHomework`. */
export async function removeLessonHomeworkAction(
  courseId: string,
  lessonId: string,
): Promise<ActionResult> {
  try {
    await apiSend(
      'DELETE',
      `/api/admin/lessons/${lessonId}/homework`,
      z.object({ lessonId: z.uuid() }),
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/* ── lesson resources ───────────────────────────────────────────────────
 * Materials hang off ANY lesson kind, so these take a lessonId and never
 * inspect the lesson's kind — see `LessonService.addResource` for why the
 * predecessor's `assertKind` gate was the bug, not the safeguard.
 * ─────────────────────────────────────────────────────────────────────── */

const ResourceRowSchema = z.object({ id: z.uuid() });

/**
 * Mirrors `LessonResourceInputSchema`'s INPUT shape (a video carries `url`,
 * not `videoExternalId`). The API's Zod transform is what turns it into
 * columns, so nothing here reconstructs or parses a URL.
 */
export type AddResourceInput =
  | {
      kind: 'presentation' | 'document';
      title: string;
      description: string | null;
      storageKey: string;
      filename: string;
      mime: string;
      sizeBytes: number;
    }
  | { kind: 'video'; title: string; description: string | null; provider: 'youtube'; url: string }
  | { kind: 'link'; title: string; description: string | null; linkUrl: string };

export async function addResourceAction(
  courseId: string,
  lessonId: string,
  input: AddResourceInput,
): Promise<ActionResult> {
  try {
    await apiSend(
      'POST',
      `/api/admin/lessons/${lessonId}/resources`,
      ResourceRowSchema,
      input,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    /*
     * NEVER the transport's own message here.
     *
     * `apiSend` builds it as the method, the internal API path, the status and
     * 300 characters of raw response body — and it was rendered verbatim into
     * an RTL panel: «POST /api/admin/lessons/…/resources failed with 500:
     * {"statusCode":500,…}», which reorders into something close to unreadable
     * and tells an instructor nothing they can act on.
     *
     * 409 is the one refusal with a cause worth naming, and it is always the
     * same one: a lecture may hold a single «بريزنتيشن أساسي».
     */
    const conflict = error instanceof Error && error.message.includes('failed with 409');
    return {
      ok: false,
      message: conflict ? copy.admin.resource.presentationExists : copy.admin.resource.addFailed,
    };
  }
}

export async function updateResourceAction(
  courseId: string,
  resourceId: string,
  input: { title?: string; description?: string | null },
): Promise<ActionResult> {
  try {
    await apiSend('PATCH', `/api/admin/resources/${resourceId}`, ResourceRowSchema, input);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function removeResourceAction(
  courseId: string,
  resourceId: string,
): Promise<ActionResult> {
  try {
    await apiSend('DELETE', `/api/admin/resources/${resourceId}`, ResourceRowSchema);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function reorderResourcesAction(
  courseId: string,
  lessonId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    // Parsed here as well as on the server: a duplicate id in the array is a
    // client bug worth catching before it becomes a 400.
    const body = ReorderSchema.parse({ orderedIds });
    await apiSend(
      'PATCH',
      `/api/admin/lessons/${lessonId}/resources/order`,
      z.object({ updated: z.number() }),
      body,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Designates (or clears, with `null`) the course's final exam. The API
 * validates that the lesson belongs to this course and is a quiz lesson; the
 * composite FK behind it is what holds against a direct write.
 */
export type ScaffoldExamResult = { ok: true; quizId: string } | { ok: false; message: string };

/**
 * One press builds the course's exam and hands back the quiz to open.
 *
 * Safe to press twice — the API returns the existing exam rather than making a
 * second one — which is why the button never needs disabling on a course that
 * already has one, and why a double-click cannot produce two exams.
 */
export async function scaffoldExamAction(courseId: string): Promise<ScaffoldExamResult> {
  try {
    const result = await apiSend(
      'POST',
      `/api/admin/courses/${courseId}/exam/scaffold`,
      ExamScaffoldResultSchema,
    );
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true, quizId: result.quizId };
  } catch {
    return { ok: false, message: copy.admin.exam.scaffoldFailed };
  }
}

export async function setCourseExamAction(
  courseId: string,
  examLessonId: string | null,
): Promise<ActionResult> {
  try {
    const body = CourseExamPatchSchema.parse({ examLessonId });
    await apiSend('PUT', `/api/admin/courses/${courseId}/exam`, CourseRowSchema, body);
    invalidateCourse(courseId);
    revalidatePath(`/admin/courses/${courseId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
