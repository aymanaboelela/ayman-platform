import { z } from '@ayman/contracts/zod';

/**
 * لوحة الشرف من ناحية الأدمن — «حط حد بإيدك».
 *
 * ## ليه فيه شاشة أصلاً
 *
 * اللوحة كانت بتتولد من ورقة امتحان مثبّتة (`quiz_attempts.honor_board_at`)
 * وبس، والتثبيت بيحصل من شاشة التصحيح: تدخل على ورقة، تدوس «حطه في لوحة
 * الشرف». يعني عشان تكرّم حد لازم يكون امتحن، ولازم تلاقي ورقته.
 *
 * اللي اتطلب: تدوّر على الطالب بالاسم، تحط له تاريخ، تقول «ده الأول»،
 * وتحط صورته. من غير ورقة، وبتاريخ إنت اللي بتختاره.
 *
 * ## الشاشة بتعرض المصدرين مع بعض، وبتحرّر واحد
 *
 * كل دور على الشاشة فيه `manual` (صفوف `honor_board_pins`، بتتعدّل وتتمسح
 * من هنا) و`fromExams` (ورق مثبّت، للعرض — بيتفك من شاشة التصحيح). لو
 * الشاشة عرضت اليدوي بس كان المدرّس هيبص على «لوحة الشرف» ويلاقي نص اللي
 * على موقعه ناقص.
 *
 * ## ⚠️ الـids موجودة هنا وممنوعة على اللوحة العامة
 *
 * `HonorBoardEntrySchema` (في `admin/exams.ts`) مافيهوش ولا id عن قصد —
 * دي الحمولة الوحيدة اللي أي حد على النت بيقراها وبتسمّي قاصر. الشاشة دي
 * ورا `student:read`، فالـids هنا عادية ولازمة عشان تعدّل وتمسح.
 */

/** أربع خانات بتتعرض على الصفحة الرئيسية، والباقي في الأرشيف — ونفس السقف
 *  متكتوب CHECK على العمود. */
export const HONOR_PIN_MAX_RANK = 10;

/** `YYYY-MM-DD` بتوقيت القاهرة — نفس شكل مفتاح الدور على اللوحة. */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ لازم يكون YYYY-MM-DD');

/**
 * ⚠️ `userId` مش `z.uuid()`.
 *
 * better-auth بيولّد nanoid، مش UUID. كل فيكستشر في التستات بيعدّي على
 * `z.uuid()` وكل طالب حقيقي بيترفض بـ400 — ده حصل قبل كده.
 */
const userId = z.string().min(1).max(64);

const reason = z
  .string()
  .trim()
  .min(2, 'اكتب سبب التكريم')
  .max(120, 'السطر ده بيتطبع على كارت — خليه قصير');

export const AdminHonorPinCreateSchema = z
  .object({
    userId,
    /** اليوم اللي التكريم ده اتحسب عليه، بتوقيت القاهرة. المدرّس بيكتبه —
     *  «حطه على لوحة أول أكتوبر» جملة بتتقال بعدها بأسبوع. */
    day: dayString,
    /** المركز جوّه الكورس. رقم مكتوب، مش محسوب — مفيش درجة تترتّب هنا. */
    rank: z.number().int().min(1).max(HONOR_PIN_MAX_RANK),
    /** الكورس اللي السباق ده جرى فيه، أو null فبنرجع لسنة الطالب وشعبته. */
    courseId: z.uuid().nullable().default(null),
    reason,
    /** صورة للتكريم ده بالذات. null معناها «استعمل صورة لوحة الشرف بتاعته»
     *  اللي في بروفايله، ولو هي كمان فاضية بيظهر أول حرفين من اسمه. */
    photoKey: z.string().max(300).nullable().default(null),
  })
  .strict();
export type AdminHonorPinCreate = z.infer<typeof AdminHonorPinCreateSchema>;

/**
 * ⚠️ متكتوب بالإيد ومش `.partial()` على اللي فوق.
 *
 * `.partial()` بيسيب الـ`.default()` مكانه، فتعديل الاسم بس كان بيبعت
 * `courseId: null` و`photoKey: null` جوّاه من غير ما حد يكتبهم — وبيمسح
 * الصورة. ده حصل حرفيًا في PATCH تاني على المنصة دي.
 *
 * `userId` مش هنا: نقل تكريم من طالب لطالب مش تعديل، ده مسح وإضافة.
 */
export const AdminHonorPinPatchSchema = z
  .object({
    day: dayString.optional(),
    rank: z.number().int().min(1).max(HONOR_PIN_MAX_RANK).optional(),
    courseId: z.uuid().nullable().optional(),
    reason: reason.optional(),
    photoKey: z.string().max(300).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'مفيش حاجة تتغيّر' });
export type AdminHonorPinPatch = z.infer<typeof AdminHonorPinPatchSchema>;

/** صف يدوي على شاشة الأدمن. */
export const AdminHonorPinRowSchema = z.object({
  id: z.uuid(),
  userId,
  studentName: z.string(),
  /** بيتعرض تحت الاسم في القايمة عشان اتنين بنفس الاسم مايبقوش صف واحد
   *  مكرّر. مش بيوصل للوحة العامة خالص. */
  phone: z.string().nullable(),
  /** `YYYY-MM-DD` بتوقيت القاهرة — مفتاح الدور. */
  day: dayString,
  honoredAt: z.iso.datetime(),
  rank: z.number().int().min(1),
  courseId: z.uuid().nullable(),
  /** «تانية بكالوريا — لغات»، زي ما هيتطبع على الكارت بالظبط. فاضية لما
   *  مايكونش فيه كورس ولا سنة في البروفايل. */
  courseLabel: z.string(),
  reason: z.string(),
  /** صورة التكريم ده. */
  photoKey: z.string().nullable(),
  /** صورة لوحة الشرف اللي في بروفايل الطالب — اللي بتظهر لما اللي فوق فاضي.
   *  بتتبعت عشان الشاشة تعرض الصورة الحقيقية اللي هتتنشر، مش خانة فاضية. */
  profilePhotoKey: z.string().nullable(),
  /** The month-exam paper this place came from («الأوائل من امتحان الشهر»),
   *  or null for a pin added by hand. */
  attemptId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminHonorPinRow = z.infer<typeof AdminHonorPinRowSchema>;

/**
 * ورقة مثبّتة، للعرض بس.
 *
 * بتحمل `attemptId` عشان الشاشة توصّل على ورقتها في التصحيح — اللي هو
 * المكان الوحيد اللي بيتفك منه التثبيت. تكرار الزرار هنا كان هيعمل طريقتين
 * لنفس الحاجة على شاشتين.
 */
export const AdminHonorExamRowSchema = z.object({
  attemptId: z.uuid(),
  userId,
  studentName: z.string(),
  courseLabel: z.string(),
  rank: z.number().int().min(1),
  title: z.string(),
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number().nullable(),
  percent: z.number().min(0).max(100).nullable(),
  photoKey: z.string().nullable(),
  pinnedAt: z.iso.datetime(),
});
export type AdminHonorExamRow = z.infer<typeof AdminHonorExamRowSchema>;

export const AdminHonorRoundSchema = z.object({
  /** `YYYY-MM-DD` بتوقيت القاهرة. */
  key: dayString,
  /** أحدث حاجة في الدور — عشان الشاشة تطبع تاريخ حقيقي. */
  pinnedAt: z.iso.datetime(),
  manual: z.array(AdminHonorPinRowSchema),
  fromExams: z.array(AdminHonorExamRowSchema),
});
export type AdminHonorRound = z.infer<typeof AdminHonorRoundSchema>;

/** كورس في قايمة الاختيار — مش الكتالوج كله، الحقول اللي الشاشة بتعرضها بس. */
export const AdminHonorCourseSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** الشارة اللي هتتطبع على الكارت لو اتختار — «تانية بكالوريا — عربي». */
  label: z.string(),
});
export type AdminHonorCourse = z.infer<typeof AdminHonorCourseSchema>;

export const AdminHonorBoardSchema = z.object({
  rounds: z.array(AdminHonorRoundSchema),
  /** بتتبعت مع الأدوار عشان الديالوج مايعملش ريكويست تاني عشان قايمة كورسات. */
  courses: z.array(AdminHonorCourseSchema),
});
export type AdminHonorBoard = z.infer<typeof AdminHonorBoardSchema>;

/**
 * نتيجة البحث في ديالوج «ضيف طالب».
 *
 * أقل من `AdminStudentRow` بكتير عن قصد: الشاشة بتحتاج تفرّق بين اتنين
 * بنفس الاسم وتشوف صورة لوحة الشرف بتاعته لو موجودة، وخلاص.
 */
export const AdminHonorStudentSchema = z.object({
  userId,
  fullName: z.string(),
  phone: z.string().nullable(),
  governorateCode: z.string().nullable(),
  year: z.number().int().nullable(),
  /** `general` | `languages` | null — بتتعرض جنب الاسم عشان «عربي ولا لغات». */
  stream: z.string().nullable(),
  honorPhotoKey: z.string().nullable(),
  /** كام مرة اتكرّم قبل كده. صفر هو الحالة العادية؛ الرقم بيمنع تكرار نفس
   *  الطالب على نفس الدور من غير ما حد ياخد باله. */
  pinCount: z.number().int().nonnegative(),
});
export type AdminHonorStudent = z.infer<typeof AdminHonorStudentSchema>;

export const AdminHonorStudentsSchema = z.object({
  students: z.array(AdminHonorStudentSchema),
});
export type AdminHonorStudents = z.infer<typeof AdminHonorStudentsSchema>;

export const AdminHonorStudentQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
export type AdminHonorStudentQuery = z.infer<typeof AdminHonorStudentQuerySchema>;

/* ── «الأوائل من امتحان الشهر» ─────────────────────────────────────────────
 *
 * The instructor opens a month exam, sees its best papers, and says who is
 * first, second … tenth. The order is HIS — ten papers on 50/50 are not
 * ranked by the score — so each pick lands as an `honor_board_pins` row with
 * an explicit rank, tied back to its paper (`attempt_id`) so the card can
 * still print the mark and a re-publish updates instead of duplicating.
 */

/** How many papers the picker lists — the best sitting of each student. Ten
 *  are picked; the rest are there so a full-mark paper that sorted eleventh
 *  can still be moved up. */
export const HONOR_EXAM_CANDIDATES = 40;

/** One month exam in the picker's list. */
export const AdminHonorExamOptionSchema = z.object({
  lessonId: z.uuid(),
  title: z.string(),
  courseTitle: z.string(),
  /** «تانية بكالوريا — لغات» — the chip the cards will carry. */
  courseLabel: z.string(),
  /** When it opened, or null on an exam that was simply left open. */
  opensAt: z.iso.datetime().nullable(),
  /** Finished, on-time sittings — the papers that can go on the board. */
  sat: z.number().int().nonnegative(),
  /** How many of its papers are on the board right now. */
  pinned: z.number().int().nonnegative(),
});
export type AdminHonorExamOption = z.infer<typeof AdminHonorExamOptionSchema>;

export const AdminHonorExamListSchema = z.object({
  exams: z.array(AdminHonorExamOptionSchema),
});
export type AdminHonorExamList = z.infer<typeof AdminHonorExamListSchema>;

/** One paper in the picker — the student's best on-time sitting. */
export const AdminHonorCandidateSchema = z.object({
  attemptId: z.uuid(),
  userId,
  studentName: z.string(),
  /** Tells two students with the same name apart. Never reaches the board. */
  phone: z.string().nullable(),
  /** `student_profiles.honor_photo_key` — the photo the board will draw. */
  photoKey: z.string().nullable(),
  scaledScore: z.number().nullable(),
  gradeOutOf: z.number(),
  percent: z.number().min(0).max(100).nullable(),
  /** The grading screen's own star rating, if he gave one — shown, not used. */
  instructorRating: z.number().int().nullable(),
  /** The place this paper holds on the board now, or null. */
  pinnedRank: z.number().int().min(1).nullable(),
});
export type AdminHonorCandidate = z.infer<typeof AdminHonorCandidateSchema>;

export const AdminHonorExamBoardSchema = z.object({
  lessonId: z.uuid(),
  title: z.string(),
  courseLabel: z.string(),
  /** The day the board is filed under if it is already published, else null
   *  and the screen offers today. */
  day: dayString.nullable(),
  candidates: z.array(AdminHonorCandidateSchema),
});
export type AdminHonorExamBoard = z.infer<typeof AdminHonorExamBoardSchema>;

/**
 * Publish (or re-publish) one exam's top ten.
 *
 * The list is the WHOLE board for that exam: a paper that was on it and is
 * not in `picks` comes off, one that is moves to its new place, one that is
 * new goes up and its student is notified. An empty list takes the exam off
 * the board entirely.
 */
export const AdminHonorExamPublishSchema = z
  .object({
    day: dayString,
    picks: z
      .array(
        z
          .object({
            attemptId: z.uuid(),
            rank: z.number().int().min(1).max(HONOR_PIN_MAX_RANK),
            /** A new board photo for this student, written to their profile so
             *  every later round shows it too. Absent = leave it alone. */
            photoKey: z.string().max(300).nullable().optional(),
          })
          .strict(),
      )
      .max(HONOR_PIN_MAX_RANK),
  })
  .strict()
  .refine((value) => new Set(value.picks.map((p) => p.rank)).size === value.picks.length, {
    message: 'كل مركز لواحد بس',
    path: ['picks'],
  })
  .refine((value) => new Set(value.picks.map((p) => p.attemptId)).size === value.picks.length, {
    message: 'نفس الورقة اتختارت مرتين',
    path: ['picks'],
  });
export type AdminHonorExamPublish = z.infer<typeof AdminHonorExamPublishSchema>;

export const AdminHonorExamPublishResultSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
export type AdminHonorExamPublishResult = z.infer<typeof AdminHonorExamPublishResultSchema>;
