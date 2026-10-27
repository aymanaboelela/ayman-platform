import { z } from '@ayman/contracts/zod';

/**
 * «كارت النتيجة» و«شهاداتي» — what the share images print, read from the API
 * behind the `shareCards` entitlement.
 *
 * The images are drawn in the browser, but WHETHER a student gets one is the
 * API's answer, not the page's: a stack without `shareCards` answers 404 here,
 * so the feature is closed, not merely hidden (see
 * `apps/api/src/common/entitlements-coverage.spec.ts`).
 *
 * ## Two certificates, two looks
 *
 * Ayman, 2026-10-26: not one certificate for finishing a course — one per
 * UNIT, earned on that unit's quizzes, and one per EXAM, earned on the exam
 * itself, «وشهادة الكويز تبقى شكلها مختلف عن شهادة الامتحان».
 *
 * · **Unit** — a course section with published quizzes (the solutions and
 *   workshop sections have none, so they are not units). Earned when every
 *   one of its quizzes has a final mark and the average of the student's
 *   best marks is at least `CERTIFICATE_MIN_PERCENT`.
 * · **Exam** — a monthly exam (the «امتحانات الشهر» shelf) or the course's
 *   final exam. Earned by a best final mark of at least the same percent.
 *
 * Exam quizzes never count toward a unit: they are their own certificate.
 */
export const CERTIFICATE_MIN_PERCENT = 85;

/** `GET /api/me/share-cards/attempts/:attemptId` — a FINAL mark only; anything else is 404. */
export const ResultCardPayloadSchema = z.object({
  studentName: z.string(),
  examTitle: z.string(),
  courseTitle: z.string(),
  score: z.number(),
  total: z.number(),
  /** This attempt is an exam AND its mark earns the exam certificate. */
  examCertificate: z.boolean(),
  submittedAt: z.iso.datetime(),
});

export const UnitCertificateSchema = z.object({
  /** The course section's id. */
  id: z.string(),
  courseId: z.string(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  title: z.string(),
  quizzesTotal: z.number().int().min(1),
  /** Quizzes with a final mark. */
  quizzesTaken: z.number().int().min(0),
  /** Average of the best final marks so far, 0–100; `null` before the first. */
  averagePercent: z.number().min(0).max(100).nullable(),
  earned: z.boolean(),
  /** The submission that completed the set, when earned. */
  earnedAt: z.iso.datetime().nullable(),
});

export const ExamCertificateSchema = z.object({
  /** The exam's lesson id. */
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  title: z.string(),
  score: z.number(),
  total: z.number(),
  percent: z.number().min(0).max(100),
  earnedAt: z.iso.datetime(),
});

/** `GET /api/me/share-cards/certificates` — every unit (earned or not) and every earned exam. */
export const CertificatesPayloadSchema = z.object({
  studentName: z.string(),
  minPercent: z.number(),
  units: z.array(UnitCertificateSchema),
  exams: z.array(ExamCertificateSchema),
});

export type ResultCardPayload = z.infer<typeof ResultCardPayloadSchema>;
export type UnitCertificate = z.infer<typeof UnitCertificateSchema>;
export type ExamCertificate = z.infer<typeof ExamCertificateSchema>;
export type CertificatesPayload = z.infer<typeof CertificatesPayloadSchema>;
