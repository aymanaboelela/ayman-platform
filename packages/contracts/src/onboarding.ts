import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';

export const GenderSchema = z.enum(['male', 'female']);

/**
 * مدرسة عام ولا مدرسة لغات — the student's side of the split that
 * `courses.for_general` / `courses.for_languages` already describe on the
 * content side.
 *
 * TWO values where a course gets three (`StreamChoiceSchema` in `content.ts`
 * adds «الاتنين»). A course can serve both audiences at once; a student
 * attends one school. Making «both» unspellable here is the same move the
 * database enum makes one layer down.
 */
export const SchoolStreamSchema = z.enum(['general', 'languages']);
export type SchoolStream = z.infer<typeof SchoolStreamSchema>;

/**
 * The two education systems run in PARALLEL (§6.1) and are seeded with fixed,
 * stable slugs. `EducationSystem.id` in the database is a random uuid7 that
 * differs per environment/reseed, so it cannot drive a client-side
 * conditional rule (e.g. "elective required for بكالوريا") — the slug is the
 * only identifier stable enough for that. The server resolves this slug to
 * the real `systemId` FK (and re-validates everything else against the DB —
 * see the profile service's S10 checks; this schema only proves shape).
 */
export const OnboardingSystemSchema = z.enum(['bacalorya', 'thanaweya_amma']);

const OnboardingShapeSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
    gender: GenderSchema,
    phone: egyptianPhone('رقم الهاتف مطلوب'),
    governorateCode: z.string().length(2, 'اختر المحافظة'),
    /**
     * Required. It was optional, on the reasoning that the STREAM (عام/لغات)
     * is what filters content and the name is only ever read by a human — but
     * that is exactly what makes it worth having: when a parent rings about a
     * student, the school is how an admin tells two «أحمد محمد» apart, and an
     * empty column is no help at the one moment it is wanted.
     *
     * No `emptyToUndefined` on the form side for this field any more, so a
     * blank input arrives as `''` and earns the Arabic `.min(1)` message
     * rather than zod's English "expected string, received undefined".
     */
    schoolName: z.string().trim().min(1, 'اسم المدرسة مطلوب').max(200),
    /**
     * Required, and the reason it can be: the columns it will one day filter
     * against (`for_general` / `for_languages`) already exist on every course
     * and lesson. Asking is the cheap half; asking LATER means a population
     * split between students who answered and students who never did, and a
     * filter that cannot be turned on until that is resolved.
     */
    schoolStream: SchoolStreamSchema,
    /**
     * Required now, where both parent numbers used to be optional behind a
     * «سيبها دلوقتي» button. The mother's number is not asked for at all any
     * more — the column survives for the students who already gave one, but
     * nothing writes it, so it is deliberately absent from this payload and
     * `.strict()` rejects an attempt to send one.
     */
    fatherPhone: egyptianPhone('هاتف الأب مطلوب'),
    /**
     * Of the four section fields, the YEAR is the only one a student is still
     * asked for — the wizard fills the other three from the taxonomy, because
     * this platform is البكالوريا / مسار الهندسة وعلوم الحاسب / البرمجة and
     * nothing else. They stay on the schema (rather than becoming server-side
     * constants) so the server keeps re-checking real rows for them: see
     * `resolveSection`'s S10 notes.
     */
    system: OnboardingSystemSchema.optional(),
    /**
     * REQUIRED, and this is a reversal — it used to be walk-past-able, with
     * `/library` carrying a first-class "you haven't told us your year" state
     * for the students who did.
     *
     * The year is what decides which courses a student can see at all: it
     * resolves, with the system and track, to the `(year, track)` a course
     * carries. A student who skipped it reached a library that could not be
     * filtered for them — so the question that looked optional was in fact the
     * one answer the product needs before it can show anything.
     *
     * `z.number({ error })` rather than a bare `.min()` message because the
     * form's select yields `undefined` (not `''`) for "nothing chosen" — see
     * `emptyToUndefinedYear` — and an undefined fails the TYPE check, which
     * would otherwise surface as zod's English default.
     *
     * `max(3)` describes the education system, not what this term offers; the
     * UI's own cap lives in `apps/web/lib/section-defaults.ts`.
     *
     * ⚠️ Students onboarded BEFORE this change may still have a null year in
     * the database. Requiring it here governs what a NEW submission must
     * carry; it does not retroactively fill those rows, and `/library`'s
     * "no year" state is still what they see.
     */
    year: z.number({ error: 'اختر صفك الدراسي' }).int().min(1).max(3),
    trackId: z.string().min(1).optional(),
    electiveSubjectId: z.string().min(1).optional(),
  })
  // Reject unrecognized keys outright rather than silently stripping them —
  // this is what actually closes S11 (mass assignment). A payload carrying
  // `role`, `userId`, or `onboardingCompletedAt` fails validation here,
  // before the service layer ever sees it, because none of those are fields
  // this schema knows about.
  .strict();

/**
 * The four fields that decide WHICH COURSES a student sees: system, year,
 * track, elective. Split out of the onboarding shape so the "change my
 * section" screen can submit them alone, without round-tripping a name, a
 * gender and two parent phone numbers through a form that is not about any of
 * those — and, more importantly, without a second copy of the rules below.
 */
const SectionShapeSchema = z
  .object({
    system: OnboardingSystemSchema.optional(),
    /**
     * Required here too, and for a second reason beyond consistency with the
     * wizard: this form's ONLY field is the year, so an optional one would let
     * a student "save" the page having chosen nothing and be told it worked.
     *
     * It is also the migration path. A student onboarded before the year became
     * mandatory still has a null one, and this screen is where they fill it in
     * — requiring it is what makes saving here actually resolve their section
     * rather than leave it half-answered.
     */
    year: z.number({ error: 'اختر صفك الدراسي' }).int().min(1).max(3),
    trackId: z.string().min(1).optional(),
    electiveSubjectId: z.string().min(1).optional(),
  })
  // `.strict()` for the same S11 reason the onboarding shape gives: an
  // unrecognized key fails validation rather than being silently dropped.
  .strict();

type SectionFields = {
  system?: 'bacalorya' | 'thanaweya_amma';
  year?: number;
  trackId?: string;
  electiveSubjectId?: string;
};

/**
 * Every conditional rule from §5.2's "non-negotiable" list, expressed once and
 * shared by `OnboardingSchema` and `StudentSectionSchema` so the wizard and
 * the editor cannot disagree about what a legal section is.
 *
 * What this CANNOT do — because it only sees the payload, never the database —
 * is confirm that `trackId`/`electiveSubjectId` are real rows, or that they
 * belong together. That is S10, and it lives in the profile service.
 */
function refineSection(data: SectionFields, ctx: z.RefinementCtx): void {
  // Grade 1 is common and non-specialized across both systems — no track yet.
  if (data.year === 1 && data.trackId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['trackId'],
      message: 'الصف الأول لا يختار مسارًا بعد',
    });
  }

  // A track presupposes a chosen system.
  if (data.trackId !== undefined && data.system === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['system'],
      message: 'اختر النظام الدراسي أولًا',
    });
  }

  const electiveApplies = data.system === 'bacalorya' && data.year === 2;

  // Deliberately NOT "بكالوريا year 2 must carry an elective" any more. The
  // student is no longer asked — this platform teaches one subject, in one
  // track, in one system, so the client fills all three from the taxonomy
  // (`apps/web/lib/section-defaults.ts`) and the only question left on screen
  // is the year. A missing elective therefore stopped being a user error and
  // became a data one: it means the taxonomy has no البرمجة offering to
  // resolve. Requiring it here would turn that into a blocking error attached
  // to a field nobody can see, on a form with no way to satisfy it.
  //
  // What stays is the other direction — an elective that does NOT apply must
  // not ride along — because that one is still reachable from a payload.
  if (!electiveApplies && data.electiveSubjectId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['electiveSubjectId'],
      message: 'المادة الاختيارية غير متاحة في هذه الحالة',
    });
  }

  // An elective presupposes a chosen track.
  if (data.electiveSubjectId !== undefined && data.trackId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['trackId'],
      message: 'اختر المسار أولًا',
    });
  }
}

export const OnboardingSchema = OnboardingShapeSchema.superRefine(refineSection);

/**
 * `PATCH /api/profile/section` — the student changing their year/track after
 * onboarding, which they may do at any time.
 *
 * ## Why this does not reset anything
 *
 * Nothing here touches progress, and that is deliberate rather than an
 * oversight. Progress lives on the enrollment, per course, and courses carry
 * their own `(year, track)` — so a student who switches sections sees a course
 * list with no history against it (correctly reading as "zero"), and a student
 * who switches back sees every number they had, intact. Deleting on switch
 * would satisfy "reset to zero" and make "switch back and it's all there"
 * impossible. See `apps/web/lib/library.test.ts`.
 */
export const StudentSectionSchema = SectionShapeSchema.superRefine(refineSection);

export type Onboarding = z.infer<typeof OnboardingSchema>;
export type StudentSection = z.infer<typeof StudentSectionSchema>;
