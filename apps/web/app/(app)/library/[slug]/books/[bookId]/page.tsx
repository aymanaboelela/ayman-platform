import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import { StudentExternalBookDetailSchema } from '@ayman/contracts/quiz/external-books';
import { apiGetAuthed } from '@/lib/api-server';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { ExternalBookDetailView } from '@/components/library/external-book-detail-view';

type Params = { slug: string; bookId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const book = await apiGetAuthed(
      `/api/me/external-books/${encodeURIComponent(bookId)}`,
      StudentExternalBookDetailSchema,
    );
    return { ...privateRouteMetadata, title: formatCopy(quizExperience.books.metaTitle, { title: book.title }) };
  } catch {
    return { ...privateRouteMetadata, title: quizExperience.books.metaFallback };
  }
}

export default async function ExternalBookHubPage({ params }: { params: Promise<Params> }) {
  const { slug, bookId } = await params;

  const book = await apiGetAuthed(
    `/api/me/external-books/${encodeURIComponent(bookId)}`,
    StudentExternalBookDetailSchema,
  ).catch(() => null);

  if (!book) {
    notFound();
  }

  return <ExternalBookDetailView book={book} courseSlug={slug} />;
}
