import { parsePhoneNumberWithError } from 'libphonenumber-js';
import { z } from 'zod';

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

/**
 * Normalises an Egyptian phone number to E.164, rejecting anything that
 * libphonenumber-js can't parse as a valid +20 number. `+20` numbers not
 * length 10 you'd normally write with a leading 0 (e.g. 01012345678) are
 * accepted, since that's the format Egyptian users actually type.
 */
function egyptianPhone(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .transform((value, ctx) => {
      try {
        const parsed = parsePhoneNumberWithError(value, 'EG');
        if (!parsed.isValid() || parsed.country !== 'EG') {
          ctx.addIssue({ code: 'custom', message: 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا' });
          return z.NEVER;
        }
        return parsed.number;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'رقم الهاتف يجب أن يكون رقمًا مصريًا صحيحًا' });
        return z.NEVER;
      }
    });
}

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
 * Every conditional rule from §5.2's "non-negotiable" list, expressed as
 * refinements so the exact same object drives the client form (Task 6) and
 * the server. What this schema CANNOT do — because it only sees the payload,
 * never the database — is confirm that `trackId`/`electiveSubjectId` are
 * legitimate for the claimed `system`/`year`. That's S10, and it lives in the
 * profile service, not here.
 */
export const OnboardingSchema = OnboardingShapeSchema.superRefine((data, ctx) => {
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
});

export type Onboarding = z.infer<typeof OnboardingSchema>;
