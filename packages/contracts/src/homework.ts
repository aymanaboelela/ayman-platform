import { z } from '@ayman/contracts/zod';
import { HOMEWORK_KEY_PATTERN } from '@ayman/contracts/admin/media';

/**
 * الواجب — the exercise set on a lecture, the photographs of the answer, and
 * the instructor's verdict on them.
 *
 * ## No relative imports
 *
 * Same rule as `notifications.ts` and `activity.ts`: a leaf module both apps
 * reach through `@ayman/contracts/homework` without tripping Node's native ESM
 * loader on the root barrel. See `contracts-barrel.check.ts`.
 *
 * ## Where the WORDS are
 *
 * Nowhere here. Every Arabic string a student or the instructor reads lives in
 * `@ayman/contracts/copy` — the labels in `copy.homework`/`copy.admin.homework`,
 * and the reply POOLS he picks from in `@ayman/contracts/copy/homework`
 * (Global Constraint 4).
 */

/* ── the exercise ────────────────────────────────────────────────────── */

/**
 * The ceiling on `maxImages`, and therefore on one submission.
 *
 * Eight is the CHECK in the migration and it is a bound, not an expectation: a
 * worked solution is one or two photographs of a page. What it exists to stop
 * is the other direction — the student who photographs the same page from four
 * angles «عشان تبان» — because the pictures are the expensive half of this
 * whole feature and there is no per-account quota behind them.
 */
export const MAX_HOMEWORK_IMAGES = 8;

/**
 * The default a new exercise is created with.
 *
 * Four rather than one: a multi-part question («واحد اتنين تلاتة») is answered
 * across more than one page more often than not, and an instructor who has to
 * notice and raise a limit before a student can hand in their real answer will
 * find out about it from the student.
 */
export const DEFAULT_HOMEWORK_IMAGES = 4;

/**
 * What the instructor writes, and what the student is allowed to send back.
 *
 * `body` is PLAIN TEXT with newlines — never HTML. `LessonText` pays for rich
 * text with a sanitize-html pass on both ends because a written lesson needs
 * headings; a numbered list of three questions needs neither, and adding an
 * HTML sink to the one screen a student also uploads files to buys nothing.
 */
export const HomeworkWriteSchema = z
  .object({
    body: z.string().trim().min(3).max(4000),
    maxImages: z.number().int().min(1).max(MAX_HOMEWORK_IMAGES).default(DEFAULT_HOMEWORK_IMAGES),
    /**
     * `false` on create, deliberately.
     *
     * The editor AUTOSAVES — the questions are typed into a field that writes on
     * every pause — so "the row exists" would put half a sentence in front of
     * every enrolled student while he is still typing it. He turns it on when
     * the questions read the way he wants.
     */
    isPublished: z.boolean().default(false),
  })
  .strict();

export type HomeworkWriteInput = z.infer<typeof HomeworkWriteSchema>;

/** What the admin course editor holds for one lecture. */
export const AdminHomeworkSchema = z.object({
  body: z.string(),
  maxImages: z.number().int(),
  isPublished: z.boolean(),
  /** How many students are waiting on a decision. Drives the «فيه X مستنيين»
   *  line straight in the lesson panel, so he does not have to open the queue
   *  to find out whether there is anything there. */
  pendingCount: z.number().int().min(0),
});

export type AdminHomework = z.infer<typeof AdminHomeworkSchema>;

/* ── the submission ──────────────────────────────────────────────────── */

export const HOMEWORK_STATUSES = ['submitted', 'accepted', 'needs_work'] as const;
export const HomeworkStatusSchema = z.enum(HOMEWORK_STATUSES);
export type HomeworkStatus = z.infer<typeof HomeworkStatusSchema>;

/**
 * One uploaded page, as it comes back from `POST /api/homework/images`.
 *
 * The KEY crosses the wire and comes back — the same two-step shape every
 * other upload on this platform uses, and for the same reason: a Server Action
 * buffers its whole payload in the Next server's memory and is capped at 1 MB,
 * so bytes never travel this way. `HomeworkService.submit` re-checks every key
 * against the bucket before it writes a row, because a key that is merely
 * SHAPED right is not a key to anything.
 */
export const HomeworkImageInputSchema = z
  .object({
    // `hw/` keys ONLY. The bucket check in `submit` proves a key exists, not
    // that it is a homework photo — and a resubmit DELETES the previous
    // submission's keys, so any existing key (a course cover read off a public
    // page) sent here was a key a student could have the platform erase.
    storageKey: z.string().max(255).regex(HOMEWORK_KEY_PATTERN),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export type HomeworkImageInput = z.infer<typeof HomeworkImageInputSchema>;

export const HomeworkSubmitSchema = z
  .object({
    images: z.array(HomeworkImageInputSchema).min(1).max(MAX_HOMEWORK_IMAGES),
  })
  .strict();

export type HomeworkSubmitInput = z.infer<typeof HomeworkSubmitSchema>;

/* ── «اكتب الحل» — the typed answer, ministry tablet only ────────────── */

/**
 * The ceiling on a typed answer. Same number as the CHECK in the migration.
 *
 * Ten thousand characters is several pages of Arabic — far more than any
 * exercise here needs — and it exists for the same reason `maxImages` does:
 * so one submission cannot become something nobody can review.
 */
export const MAX_HOMEWORK_TEXT = 10_000;

/**
 * Whether a device model is the ministry tablet.
 *
 * The tablets the Ministry hands to secondary students are Samsung Galaxy Tabs
 * (made in Samsung's Beni Suef factory, Knox-managed), and the exact model has
 * changed from one cohort to the next — so this matches the Galaxy Tab FAMILY
 * rather than one model: `SM-T…` (Tab A / older Tab S), `SM-X…` (the newer
 * Tab A and Tab S lines) and `SM-P…` (Tab A with S Pen).
 *
 * ⚠️ A consumer Galaxy Tab bought in a shop matches too. That is accepted, not
 * missed: the model string is the only signal the browser gives, the ministry
 * builds carry no marker of their own, and a student on a Galaxy Tab of their
 * own is in exactly the same position — no separate camera, a sheet of paper
 * that is awkward to photograph with a 10-inch tablet.
 *
 * Phones are `SM-A…`, `SM-S…`, `SM-G…`, `SM-N…`, `SM-M…`, `SM-F…`, so none of
 * them match.
 */
export function isMinistryTabletModel(model: string | null | undefined): boolean {
  return typeof model === 'string' && /^SM-[TXP]\d{3}/i.test(model.trim());
}

/**
 * The typed answer, as it crosses to the API.
 *
 * `deviceModel` is what the browser reported. It is a CLAIM — anything on the
 * client can be edited — so the API re-checks it with `isMinistryTabletModel`
 * and stores it, which is what this gate can honestly do: keep the option off
 * every screen that is not a Galaxy Tab, and leave a record of where each
 * typed answer said it came from.
 */
export const HomeworkTextSubmitSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_HOMEWORK_TEXT),
    deviceModel: z.string().trim().min(1).max(64),
  })
  .strict();

export type HomeworkTextSubmitInput = z.infer<typeof HomeworkTextSubmitSchema>;

/**
 * The student's own view of where their answer stands.
 *
 * `imageCount` survives `imagesPurgedAt`, and that pair is the whole reason
 * this DTO is not just a status: «ما تبينوش إنها اتمسحت». A student who comes
 * back in November to an accepted submission reads «سلّمت ٣ صور · مقبول» with
 * the mark and the note still on it, rather than an empty card that looks like
 * the platform lost their work.
 */
export const MyHomeworkSubmissionSchema = z.object({
  id: z.uuid(),
  status: HomeworkStatusSchema,
  attempt: z.number().int().min(1),
  imageCount: z.number().int().min(0),
  /** Ids only — the bytes come from `GET /api/homework/images/:id`, which
   *  re-derives ownership per request. Empty once they have been cleaned up. */
  imageIds: z.array(z.uuid()),
  imagesPurged: z.boolean(),
  /** «اكتب الحل» — the typed answer, or `null` for a photographed one. */
  answerText: z.string().nullable().default(null),
  grade: z.number().min(0).max(100).nullable(),
  reviewNote: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

export type MyHomeworkSubmission = z.infer<typeof MyHomeworkSubmissionSchema>;

/**
 * The whole homework block on the player, or `null` for a lecture that has
 * none — which is most of them. «أوقات أصلاً فيه حاجات ماضفلهاش واجبات.»
 */
export const StudentHomeworkSchema = z.object({
  body: z.string(),
  maxImages: z.number().int(),
  /**
   * Whether «اكتب الحل» is switched on for this stack (`homework.typedAnswer`).
   *
   * Only half the gate: the card still offers it only when the device is a
   * Galaxy Tab (`isMinistryTabletModel`), which only the browser can tell.
   * Defaulted so an older API that does not send it reads as «off».
   */
  typedAnswer: z.boolean().default(false),
  submission: MyHomeworkSubmissionSchema.nullable(),
});

export type StudentHomework = z.infer<typeof StudentHomeworkSchema>;

/* ── the review queue ────────────────────────────────────────────────── */

/** Which pile the queue is showing. `pending` is the default and is the job. */
export const HOMEWORK_FILTERS = ['pending', 'accepted', 'needs_work', 'all'] as const;
export const HomeworkFilterSchema = z.enum(HOMEWORK_FILTERS).default('pending');
export type HomeworkFilter = z.infer<typeof HomeworkFilterSchema>;

export const AdminHomeworkRowSchema = z.object({
  id: z.uuid(),
  status: HomeworkStatusSchema,
  attempt: z.number().int(),
  imageCount: z.number().int(),
  /** A typed answer («اكتب الحل») rather than photographs — the queue says
   *  «مكتوب» instead of «٠ صورة». */
  typed: z.boolean().default(false),
  imagesPurged: z.boolean(),
  grade: z.number().nullable(),
  submittedAt: z.iso.datetime(),
  /** Resolved at READ time, never stored — same discipline every other admin
   *  list on this platform follows, so a renamed lecture reads as its current
   *  name in a queue written months ago. */
  studentId: z.string(),
  studentName: z.string(),
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
});

export type AdminHomeworkRow = z.infer<typeof AdminHomeworkRowSchema>;

/**
 * One lecture's line on the queue's overview: what came in on THAT exercise,
 * by status. «الدنيا ملخبطة… الدرس إيه واجباته إيه» — the queue used to be one
 * flat stream of every student on every lecture, so the overview is grouped
 * course → section → lecture, in the course's own outline order, and a lecture
 * opens its own list.
 */
export const AdminHomeworkLessonSummarySchema = z.object({
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  sectionTitle: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  pending: z.number().int(),
  accepted: z.number().int(),
  needsWork: z.number().int(),
  lastSubmittedAt: z.iso.datetime(),
});

export type AdminHomeworkLessonSummary = z.infer<typeof AdminHomeworkLessonSummarySchema>;

export const AdminHomeworkDetailSchema = AdminHomeworkRowSchema.extend({
  /** The questions he set, so the answer can be read against them without
   *  opening the course editor in a second tab. */
  prompt: z.string(),
  imageIds: z.array(z.uuid()),
  /** The typed answer («اكتب الحل»), or `null` for a photographed one. */
  answerText: z.string().nullable().default(null),
  /** The tablet it was typed on, as the browser reported it («SM-X205»). */
  deviceModel: z.string().nullable().default(null),
  reviewNote: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  /** The student's phone, for the «كلّمه» button — the same field the student
   *  record shows, and `null` for an account that has none. */
  studentPhone: z.string().nullable(),
  courseSlug: z.string(),
  /**
   * The three canned notes offered for each decision, ALREADY PICKED for this
   * submission.
   *
   * Composed server-side from the pools in `@ayman/contracts/copy/homework`
   * with the submission id as the seed, so the same screen re-rendered shows
   * the same three (a set that reshuffled under a half-made choice would be
   * unusable) and the NEXT submission shows different ones — «وطبعا كل مرة
   * تتغير». He is still free to type his own.
   */
  suggestions: z.object({
    accepted: z.array(z.string()),
    needsWork: z.array(z.string()),
  }),
});

export type AdminHomeworkDetail = z.infer<typeof AdminHomeworkDetailSchema>;

/**
 * The decision. `accepted` deletes the photographs in the same transaction —
 * that is not a side effect of this call, it is what he asked it to mean.
 *
 * `message` is what the student reads, and it is REQUIRED: a submission handed
 * back with no words on it is «اعملها تاني» with no reason, which is the one
 * outcome that guarantees the second attempt is the same as the first. The
 * screen fills it from a suggestion in one tap, so requiring it costs nothing.
 */
export const HomeworkReviewSchema = z
  .object({
    decision: z.enum(['accepted', 'needs_work']),
    /**
     * 0–100, or `null` for «مقبول من غير درجة».
     *
     * Refused on `needs_work` below: a mark on work that is coming back is a
     * mark on something that does not exist yet, and it would sit on the card
     * next to «ابعته تاني» contradicting it.
     */
    grade: z.number().min(0).max(100).nullable().default(null),
    message: z.string().trim().min(2).max(1000),
  })
  .strict()
  .refine((value) => value.decision === 'accepted' || value.grade === null, {
    message: 'الدرجة تتحط مع القبول بس',
    // `path` is not decoration — an issue at `path: []` cannot be attached to
    // any field, and react-hook-form would refuse to submit while showing no
    // error at all. Same trap `content.ts`'s stream refinement documents.
    path: ['grade'],
  });

export type HomeworkReviewInput = z.infer<typeof HomeworkReviewSchema>;

/**
 * The sidebar badge. Its own endpoint, not a field on the list, for the same
 * reason `payments-pending-count` is: the number is drawn on every admin page
 * and must not cost a page of rows to render.
 */
export const HomeworkPendingCountSchema = z.object({ pending: z.number().int().min(0) });
export type HomeworkPendingCount = z.infer<typeof HomeworkPendingCountSchema>;

/**
 * How long an un-accepted submission's photographs are kept.
 *
 * «برضه لو بعد ٣٠ يوم في صور شيلها.» A ceiling on the whole feature, not a
 * tidy-up: the accept path deletes them at once, and this is what happens to
 * everything else — the submissions nobody got to, and the ones handed back
 * and never redone. So no photograph of a student's exercise book is in the
 * bucket a month after it was taken, whatever anybody did or did not do about
 * it.
 */
export const HOMEWORK_IMAGE_RETENTION_DAYS = 30;
