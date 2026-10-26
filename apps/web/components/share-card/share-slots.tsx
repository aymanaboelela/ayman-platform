import { CertificatesPayloadSchema, ResultCardPayloadSchema } from '@ayman/contracts/share-cards';
import { apiGetAuthed } from '@/lib/api-server';
import { shareBrand } from '@/lib/share-card/brand';
import { tierFor } from '@/lib/share-card/model';
import { CertificateShare } from './certificate-share';
import { ResultShare } from './result-share';

/**
 * The server halves of the two share buttons.
 *
 * Whether a button exists is the API's answer: `/api/me/share-cards/*` is
 * behind the `shareCards` entitlement and answers 404 on a stack without it,
 * for an attempt whose mark is not final, and for a course not finished. So
 * every failure here is «no button» — never an error boundary, because these
 * are a bonus on a result screen and must not take the score down with them.
 *
 * Host pages wrap them in `<Suspense>`, so the extra round trip never sits in
 * front of the page's own first paint.
 */

export async function ResultShareSlot({ attemptId }: { attemptId: string }) {
  const card = await apiGetAuthed(`/api/me/share-cards/attempts/${attemptId}`, ResultCardPayloadSchema).catch(
    () => null,
  );
  if (!card?.studentName) return null;
  const tier = tierFor(card.score, card.total);
  if (!tier) return null;

  return <ResultShare data={card} tier={tier} brand={shareBrand()} />;
}

export async function CertificateSlot({ courseId }: { courseId: string }) {
  const payload = await apiGetAuthed('/api/me/share-cards/certificates', CertificatesPayloadSchema).catch(() => null);
  const certificate = payload?.certificates.find((c) => c.courseId === courseId);
  if (!payload?.studentName || !certificate) return null;

  return (
    <CertificateShare
      data={{ studentName: payload.studentName, courseTitle: certificate.title, completedAt: certificate.completedAt }}
      brand={shareBrand()}
    />
  );
}
