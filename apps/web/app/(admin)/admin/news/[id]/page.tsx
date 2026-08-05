import Link from 'next/link';
import { AdminNewsDetailSchema } from '@ayman/contracts/news';
import { copy } from '@ayman/contracts';
import { Badge } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { ArticleForm } from '../article-form';
import { loadCourseOptions } from '../course-options';

export const metadata = { title: copy.adminNews.edit };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, courses] = await Promise.all([
    adminGet(`/api/admin/news/${encodeURIComponent(id)}`, AdminNewsDetailSchema),
    loadCourseOptions(),
  ]);

  const isPublished = article.status === 'published';

  return (
    <>
      <Link href="/admin/news" className="mb-4 inline-block text-fg-muted hover:text-fg">
        {copy.adminNews.backToList}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{article.title}</h1>
        <Badge tone={isPublished ? 'ok' : 'neutral'}>
          {isPublished ? copy.adminNews.statusPublished : copy.adminNews.statusDraft}
        </Badge>
        {/* A published article gets a link to its live page — the fastest way
            to check that what was saved is what the world actually sees. */}
        {isPublished ? (
          <Link
            href={`/news/${article.slug}`}
            className="text-[length:var(--fs-text-sm)] text-accent-text underline underline-offset-2"
          >
            {copy.adminNews.previewTitle}
          </Link>
        ) : null}
      </div>

      <ArticleForm article={article} courses={courses} />
    </>
  );
}
