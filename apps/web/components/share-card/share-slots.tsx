import { EnrollmentSchema, ProfileMeSchema, StudentQuizHistorySchema } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getSession } from '@/lib/session';
import { shareBrand, shareCardsEnabled } from '@/lib/share-card/brand';
import { tierFor } from '@/lib/share-card/model';
import { CertificateShare } from './certificate-share';
import { ResultShare } from './result-share';

/**
 * The server halves of the two share buttons. Each fetches what its image
 * needs that the host page does not already have, and renders nothing when
 * the card is not offered — so a host page wraps it in `<Suspense>` and pays
 * nothing for the extra round trips in its own first paint.
 *
 * Every failure is «no button», never an error boundary: these are a bonus on
 * a result screen, and a profile API hiccup must not take the score with it.
 */

/** The full name the student registered with, falling back to the session's. */
export async function studentName(): Promise<string | null> {
  const [profile, session] = await Promise.all([
    apiGetAuthed('/api/profile/me', ProfileMeSchema).catch(() => null),
    getSession(),
  ]);
  const name = profile?.profile?.fullName?.trim() || session?.name?.trim();
  return name || null;
}

export async function ResultShareSlot({
  lessonId,
  score,
  total,
}: {
  lessonId: string;
  /** `null` while nothing is graded yet — no card for that. */
  score: number | null;
  total: number;
}) {
  if (score === null) return null;
  const tier = tierFor(score, total);
  if (!tier || !(await shareCardsEnabled())) return null;

  const [name, history] = await Promise.all([
    studentName(),
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema).catch(() => null),
  ]);
  // The review payload carries no title; the history row for this lesson does.
  const row = history?.quizzes.find((r) => r.lessonId === lessonId);
  if (!name || !row) return null;

  return (
    <ResultShare
      data={{ studentName: name, examTitle: row.quizTitle, score, total }}
      tier={tier}
      brand={shareBrand()}
    />
  );
}

export async function CertificateSlot({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  if (!(await shareCardsEnabled())) return null;
  const [name, enrollments] = await Promise.all([
    studentName(),
    apiGetAuthed('/api/enrollments', EnrollmentSchema.array()).catch(() => null),
  ]);
  if (!name) return null;
  // `completedAt` is stamped once, on the heartbeat that finished the course.
  // A course completed before that column existed has none; today is the
  // honest stand-in — it is the day the certificate was issued.
  const completedAt = enrollments?.find((e) => e.courseId === courseId)?.completedAt ?? new Date().toISOString();

  return <CertificateShare data={{ studentName: name, courseTitle, completedAt }} brand={shareBrand()} />;
}
