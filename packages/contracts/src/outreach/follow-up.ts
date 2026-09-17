import { z } from '@ayman/contracts/zod';
import { SchoolStreamSchema } from '@ayman/contracts/onboarding';

/**
 * `/admin/follow-up` — «مين وقف، ومين دخل ومشترَكش».
 *
 * ## Two segments, one screen, and why they are not two screens
 *
 * They answer the same question at two different points of a student's life:
 * somebody is on the platform and not moving. The first segment is a student
 * who has a seat and stopped using it; the second is a student who never took
 * one. The action is identical in both — read the row, open the record, send
 * one message — and splitting that across two routes would mean two tables,
 * two send buttons and two places to look before a morning's chasing is done.
 *
 * ## Why this is not a filter on `/admin/analytics/students`
 *
 * That screen RANKS: it sorts a whole cohort by mean score, pass rate, watch
 * hours. This one SELECTS, and the selection is the product — «آخر محاضرتين»
 * and «آخر كويزين» are a rule about the tail of a course outline, not a
 * threshold on a column, and no sort order over the roster expresses it.
 * `StudentAnalyticsService`'s own comment says sorting has to happen in SQL or
 * page one is wrong; the same argument applies here to the SELECTION, which is
 * why both queries in `FollowUpService` are single statements.
 */

/**
 * How many lessons from the END of the outline count as «الأخيرة».
 *
 * Two by default, because that is the question that was asked. Bounded at five
 * because this number multiplies the join in `FollowUpService.atRisk` and lands
 * in a `row_number() <= $n`; unbounded from the URL bar it is a free
 * full-outline scan per course.
 */
export const FOLLOW_UP_WINDOW_DEFAULT = 2;
export const FOLLOW_UP_WINDOW_MAX = 5;

export const FollowUpWindowSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(FOLLOW_UP_WINDOW_MAX)
  .default(FOLLOW_UP_WINDOW_DEFAULT);

/** One lecture or one quiz the student went past. */
export const FollowUpItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
});

/**
 * A student who has a seat in a course and has not touched the end of it.
 *
 * `missedLessons` and `missedQuizzes` are never BOTH empty — the query only
 * emits a row when the student missed EVERY lesson in the window for at least
 * one of the two kinds, which is the literal reading of «ما شافش آخر
 * محاضرتين». A row with nothing in it would compose a message that names
 * nothing, and the composer would happily send it.
 */
export const FollowUpRowSchema = z.object({
  userId: z.string(),
  studentName: z.string(),
  /** E.164, so the admin can reach them outside the platform if the message fails. */
  phone: z.string(),
  year: z.number().int().nullable(),
  schoolStream: SchoolStreamSchema.nullable(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  missedLessons: z.array(FollowUpItemSchema),
  missedQuizzes: z.array(FollowUpItemSchema),
  /**
   * The last heartbeat or attempt this student produced ANYWHERE, not only in
   * this course. `null` for an account that has never opened a lesson.
   *
   * Platform-wide on purpose: the question the admin is answering is «ده لسه
   * بيدخل؟», and somebody who is deep in another course is a completely
   * different conversation from somebody who has not signed in since March.
   */
  lastActiveAt: z.iso.datetime().nullable(),
  /**
   * When «إزاي الأخبار؟» last went to this student, about anything.
   *
   * Drives the «اتبعتله» chip, and `sendAll` skips anyone inside
   * `FOLLOW_UP_COOLDOWN_DAYS` of it — see that constant. A single send from the
   * row's own button deliberately does NOT check it.
   */
  lastMessagedAt: z.iso.datetime().nullable(),
});

/**
 * Why a student is in the second segment.
 *
 * `never` — no enrollment at all, anywhere. They made an account and stopped.
 * `elsewhere` — they have a seat, just not in a course their own year and
 *   stream point at: the تأسيسي case Ayman named, and also the student who
 *   moved up a year and never moved course.
 */
export const IdleReasonSchema = z.enum(['never', 'elsewhere']);
export type IdleReason = z.infer<typeof IdleReasonSchema>;

export const IdleRowSchema = z.object({
  userId: z.string(),
  studentName: z.string(),
  /**
   * `null` for an account that signed up and never onboarded — the number is
   * captured at sign-up on `users.phone_number`, but an account created before
   * that was, or by a provider that gave none, genuinely has no number to show.
   */
  phone: z.string().nullable(),
  /**
   * Whether `/admin/students/{userId}` will open.
   *
   * ⚠️ The one field on this row that is about the ADMIN screen rather than
   * about the student, and it is here because the alternative is a link that
   * 404s. `StudentsService.detail` reads `student_profiles` and throws when
   * there is no row, and «دخل المنصة ومعملش حاجة» — the segment this list
   * exists for — is precisely the population that has none. Dropping them to
   * keep every row clickable would hide the largest group Ayman asked to see;
   * listing them without a link shows them and tells the truth about why.
   */
  hasProfile: z.boolean(),
  year: z.number().int().nullable(),
  schoolStream: SchoolStreamSchema.nullable(),
  reason: IdleReasonSchema,
  /** Active seats they DO hold. Zero exactly when `reason` is `never`. */
  enrolledCount: z.number().int().min(0),
  /**
   * The course their year and stream point at, already picked.
   *
   * `null` when the profile cannot answer — no year, or no stream, which is
   * the majority state on a platform where onboarding is not enforced
   * retroactively. The message then sends them to the catalog and says so;
   * see `SUBSCRIBE_BODIES_UNKNOWN` for why that is different copy and not the
   * same sentence with a blank in it.
   */
  suggestedCourseId: z.uuid().nullable(),
  suggestedCourseTitle: z.string().nullable(),
  suggestedCourseSlug: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastMessagedAt: z.iso.datetime().nullable(),
});

export const FollowUpQuerySchema = z.object({
  /** One course, or every course the student has a seat in. */
  courseId: z.uuid().optional(),
  year: z.coerce.number().int().min(1).max(3).optional(),
  window: FollowUpWindowSchema,
});

export const IdleQuerySchema = z.object({
  year: z.coerce.number().int().min(1).max(3).optional(),
  reason: IdleReasonSchema.optional(),
});

/**
 * One student, one press.
 *
 * `courseId` is required and is not a convenience: the message names the
 * lectures of ONE course, and a student enrolled in three can be behind in two
 * of them. Without it the server would have to choose, and «إزاي الأخبار؟» is
 * the one message that must not be about the wrong course.
 */
export const FollowUpSendSchema = z.object({
  userId: z.string().min(1),
  courseId: z.uuid(),
  /**
   * The window the TABLE was showing when the button was pressed.
   *
   * Carried rather than assumed, because the message names what it found: a
   * server that re-resolved at the maximum would write about five lectures
   * under a screen that said two, and the instructor's name is on the result.
   */
  window: FollowUpWindowSchema,
});

export const SubscribeSendSchema = z.object({
  userId: z.string().min(1),
});

/**
 * «ابعت للكل» — the same filter the screen is showing, re-resolved server-side.
 *
 * NOT a list of ids from the client, which was the first shape and is wrong in
 * the direction that matters: the admin is looking at page one of a filtered
 * table and means «كل دول», not «الخمسة وعشرين اللي قدامي». Re-resolving also
 * means a student who caught up between the read and the press is no longer in
 * the set, so the message is never about something that stopped being true.
 */
export const FollowUpSendAllSchema = FollowUpQuerySchema;
export const SubscribeSendAllSchema = IdleQuerySchema;

/**
 * What one press did.
 *
 * Four numbers rather than one, because every one of them is a different thing
 * the admin needs to be told and «اتبعت ٣٠» would hide three of them: a
 * duplicate is the same message already sent, `capped` is the per-student daily
 * ceiling in `OutreachService`, and `cooled` is the follow-up cooldown. All
 * three are silent successes, and a screen that reports them as sends is a
 * screen that lies about what the students received.
 */
export const OutreachSendResultSchema = z.object({
  sent: z.number().int().min(0),
  duplicate: z.number().int().min(0),
  capped: z.number().int().min(0),
  /** Skipped by `FOLLOW_UP_COOLDOWN_DAYS`. Always 0 for a single-row send. */
  cooled: z.number().int().min(0),
});

/**
 * A student messaged inside this many days is skipped by «ابعت للكل».
 *
 * Seven, so a weekly sweep of the screen never writes to the same person
 * twice. It is deliberately NOT enforced on the per-row button: that is a
 * human looking at one named student and deciding, and a guard that silently
 * swallows a press he watched himself make is the exact failure
 * `OutreachService.sendManual`'s own comment argues against.
 */
export const FOLLOW_UP_COOLDOWN_DAYS = 7;

/** Per press. Bounds one transaction burst on a pool of ten connections. */
export const OUTREACH_SEND_ALL_MAX = 200;

export type FollowUpItem = z.infer<typeof FollowUpItemSchema>;
export type FollowUpRow = z.infer<typeof FollowUpRowSchema>;
export type IdleRow = z.infer<typeof IdleRowSchema>;
export type FollowUpQuery = z.infer<typeof FollowUpQuerySchema>;
export type IdleQuery = z.infer<typeof IdleQuerySchema>;
export type OutreachSendResult = z.infer<typeof OutreachSendResultSchema>;
