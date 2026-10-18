import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ZodType } from 'zod';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import {
  ExternalBookPracticeResultSchema,
  ExternalBookPracticeSessionSchema,
} from '@ayman/contracts/quiz/external-books';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { practiceReview } from '@/lib/practice-review';
import { sanitizePracticeSession, sanitizeReview } from '@/lib/practice-sanitize';
import { bookHref } from '@/lib/practice-links';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { ExternalBookPracticeRunner } from '@/components/library/external-book-practice-runner';
import { PracticeResultView } from '@/components/library/practice-result';

type Params = { slug: string; bookId: string; sessionId: string };

export async function generateMetadata(): Promise<Metadata> {
  return { ...privateRouteMetadata, title: quizExperience.practice.metaTitle };
}

/**
 * One book practice: the runner while it is open, its result once it has
 * been handed in (a reload, or a link opened later — results are kept a
 * week), and a 404 once the session itself has expired.
 *
 * Everything that reaches `<SafeHtml>` is sanitized HERE (`practice-sanitize`)
 * — this page used to hand the bank's markup straight to the runner, the one
 * quiz screen that skipped the second pass.
 *
 * Not cached: both reads are per-student and change the moment the practice
 * is submitted.
 */
export default async function ExternalBookPracticePage({ params }: { params: Promise<Params> }) {
  const { slug, bookId, sessionId } = await params;
  const back = bookHref(slug, bookId);

  // A result means the practice is over — the runner never opens again.
  const result = await readOrNull(
    `/api/me/external-books/practice/${encodeURIComponent(sessionId)}/result`,
    ExternalBookPracticeResultSchema,
  );
  if (result) {
    const { review: _review, ...summary } = result;
    return <PracticeResultView summary={summary} review={sanitizeReview(practiceReview(result))} bookHref={back} />;
  }

  const session = await readOrNull(
    `/api/me/external-books/practice/${encodeURIComponent(sessionId)}`,
    ExternalBookPracticeSessionSchema,
  );
  if (!session) notFound();

  return <ExternalBookPracticeRunner session={sanitizePracticeSession(session)} bookId={bookId} courseSlug={slug} />;
}

/**
 * A 404 or 403 is an ordinary answer on both routes — no result yet, a
 * session past its 24 hours, or someone else's — so it is `null`. Anything
 * else still throws: dressing an outage up as "no result yet" would reopen a
 * practice that was already handed in. (It used to swallow EVERY error.)
 */
async function readOrNull<T>(path: string, schema: ZodType<T>): Promise<T | null> {
  try {
    return await apiGetAuthed(path, schema);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
