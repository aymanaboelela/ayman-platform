import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { ArticleForm } from '../article-form';
import { loadCourseOptions } from '../course-options';

export const metadata = { title: copy.adminNews.create };

export default async function NewArticlePage() {
  const courses = await loadCourseOptions();

  return (
    <>
      <Link href="/admin/news" className="mb-4 inline-block text-fg-muted hover:text-fg">
        {copy.adminNews.backToList}
      </Link>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.adminNews.create}
      </h1>
      {/* `article={null}` is the create branch — there is no "publish on
          create" path, so a new article is always a draft first. */}
      <ArticleForm article={null} courses={courses} />
    </>
  );
}
