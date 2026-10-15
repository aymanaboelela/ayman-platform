import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ExternalBookPracticeResultSchema,
  ExternalBookPracticeSessionSchema,
  type ExternalBookPracticeResult,
  type ExternalBookPracticeSession,
} from '@ayman/contracts/quiz/external-books';
import { apiGetAuthed } from '@/lib/api-server';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { ExternalBookPracticeRunner } from '@/components/library/external-book-practice-runner';

type Params = { slug: string; bookId: string; sessionId: string };

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...privateRouteMetadata,
    title: 'اختبار أسئلة الكتاب الخارجي — تدريب وتقييم',
  };
}

export default async function ExternalBookPracticePage({ params }: { params: Promise<Params> }) {
  const { slug, bookId, sessionId } = await params;

  // فحص ما إذا كانت النتيجة مسجلة بالفعل
  let result: ExternalBookPracticeResult | null = null;
  try {
    result = await apiGetAuthed(
      `/api/me/external-books/practice/${encodeURIComponent(sessionId)}/result`,
      ExternalBookPracticeResultSchema,
    );
  } catch {
    result = null;
  }

  // فحص جلسة الاختبار النشطة
  let session: ExternalBookPracticeSession | null = null;
  if (!result) {
    try {
      session = await apiGetAuthed(
        `/api/me/external-books/practice/${encodeURIComponent(sessionId)}`,
        ExternalBookPracticeSessionSchema,
      );
    } catch {
      session = null;
    }
  } else {
    // إذا كانت هناك نتيجة سابقة، نصنع جلسة شكلية من بيانات النتيجة لعرض المراجعة
    session = {
      sessionId: result.sessionId,
      bookId: result.bookId,
      bookTitle: result.bookTitle,
      courseSlug: result.courseSlug,
      scope: result.scope,
      scopeTitle: result.scopeTitle,
      totalQuestions: result.review.length,
      questions: result.review.map((r) => ({
        slotPosition: r.slotPosition,
        questionId: r.attemptQuestionId,
        type: r.type,
        stemHtml: r.stemHtml,
        maxMark: r.maxMark,
        options: r.options,
        flagged: false,
      })),
    };
  }

  if (!session) {
    notFound();
  }

  return (
    <ExternalBookPracticeRunner
      session={session}
      initialResult={result}
      bookId={bookId}
      courseSlug={slug}
    />
  );
}
