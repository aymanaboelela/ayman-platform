import { z } from '@ayman/contracts/zod';

/**
 * «كارت النتيجة» و«شهاداتي» — what the two share images print, read from the
 * API behind the `shareCards` entitlement.
 *
 * The images are drawn in the browser, but WHETHER a student gets one is the
 * API's answer, not the page's: a stack without `shareCards` answers 404 here,
 * so the feature is closed, not merely hidden (see
 * `apps/api/src/common/entitlements-coverage.spec.ts`).
 */

/** `GET /api/me/share-cards/attempts/:attemptId` — a FINAL mark only; anything else is 404. */
export const ResultCardPayloadSchema = z.object({
  studentName: z.string(),
  examTitle: z.string(),
  score: z.number(),
  total: z.number(),
});

/** `GET /api/me/share-cards/certificates` — the courses this student has finished. */
export const CertificatesPayloadSchema = z.object({
  studentName: z.string(),
  certificates: z.array(
    z.object({
      courseId: z.string(),
      slug: z.string(),
      title: z.string(),
      completedAt: z.iso.datetime(),
    }),
  ),
});

export type ResultCardPayload = z.infer<typeof ResultCardPayloadSchema>;
export type CertificatesPayload = z.infer<typeof CertificatesPayloadSchema>;
