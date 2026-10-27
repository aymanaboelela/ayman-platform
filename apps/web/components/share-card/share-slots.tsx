import { CertificatesPayloadSchema, ResultCardPayloadSchema } from '@ayman/contracts/share-cards';
import { apiGetAuthed } from '@/lib/api-server';
import { shareBrand } from '@/lib/share-card/brand';
import { tierFor } from '@/lib/share-card/model';
import { ExamCertificateShare, UnitCertificateShare } from './certificate-share';
import { ResultShare } from './result-share';

/**
 * The server halves of the share buttons.
 *
 * Whether a button exists is the API's answer: `/api/me/share-cards/*` is
 * behind the `shareCards` entitlement and answers 404 on a stack without it
 * and for an attempt whose mark is not final. So every failure here is «no
 * button» — never an error boundary, because these are a bonus on a result
 * screen and must not take the score down with them.
 *
 * Host pages wrap them in `<Suspense>`, so the extra round trip never sits in
 * front of the page's own first paint.
 */

/** Under the score: the story card, and — for an exam at 85%+ — the exam certificate beside it. */
export async function ResultShareSlot({ attemptId }: { attemptId: string }) {
  const card = await apiGetAuthed(`/api/me/share-cards/attempts/${attemptId}`, ResultCardPayloadSchema).catch(
    () => null,
  );
  if (!card?.studentName) return null;
  const tier = tierFor(card.score, card.total);
  if (!tier && !card.examCertificate) return null;
  const brand = shareBrand();

  return (
    <div className="grid gap-3">
      {card.examCertificate ? (
        <ExamCertificateShare
          data={{
            studentName: card.studentName,
            examTitle: card.examTitle,
            courseTitle: card.courseTitle,
            score: card.score,
            total: card.total,
            earnedAt: card.submittedAt,
          }}
          brand={brand}
        />
      ) : null}
      {tier ? <ResultShare data={card} tier={tier} brand={brand} /> : null}
    </div>
  );
}

/** On the course page: the certificates this student already holds in this course. */
export async function CourseCertificatesSlot({ courseId }: { courseId: string }) {
  const payload = await apiGetAuthed('/api/me/share-cards/certificates', CertificatesPayloadSchema).catch(() => null);
  if (!payload?.studentName) return null;
  const units = payload.units.filter((unit) => unit.courseId === courseId && unit.earned);
  const exams = payload.exams.filter((exam) => exam.courseId === courseId);
  if (units.length === 0 && exams.length === 0) return null;
  const brand = shareBrand();

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {exams.map((exam) => (
        <ExamCertificateShare
          key={exam.id}
          data={{
            studentName: payload.studentName,
            examTitle: exam.title,
            courseTitle: exam.courseTitle,
            score: exam.score,
            total: exam.total,
            earnedAt: exam.earnedAt,
          }}
          brand={brand}
        />
      ))}
      {units.map((unit) => (
        <UnitCertificateShare
          key={unit.id}
          data={{
            studentName: payload.studentName,
            unitTitle: unit.title,
            courseTitle: unit.courseTitle,
            averagePercent: unit.averagePercent ?? 0,
            earnedAt: unit.earnedAt ?? new Date().toISOString(),
          }}
          brand={brand}
        />
      ))}
    </div>
  );
}
