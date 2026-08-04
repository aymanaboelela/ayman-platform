import { z } from 'zod';
import { egyptianPhone } from '@ayman/contracts/phone';

export const GenderSchema = z.enum(['male', 'female']);

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
    schoolName: z.string().trim().min(1).max(200).optional(),
    fatherPhone: egyptianPhone('هاتف الأب مطلوب').optional(),
    motherPhone: egyptianPhone('هاتف الأم مطلوب').optional(),
    /** Nullable on purpose — a grade-1 student legitimately has not chosen yet (§5.2). */
    system: OnboardingSystemSchema.optional(),
    year: z.number().int().min(1).max(3).optional(),
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
    year: z.number().int().min(1).max(3).optional(),
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

  if (electiveApplies && data.electiveSubjectId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['electiveSubjectId'],
      message: 'اختر المادة الاختيارية',
    });
  }

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
