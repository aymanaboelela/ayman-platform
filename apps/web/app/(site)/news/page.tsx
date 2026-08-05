import type { Metadata } from 'next';
import Link from 'next/link';
import { copy, formatCopy } from '@ayman/contracts';
import { JsonLd } from '@/components/seo/json-ld';
import { getNewsListOrEmpty } from '@/lib/news';
import { articleListJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: copy.news.title,
    description: copy.news.description,
    path: '/news',
  });
}

/**
 * «نيوز» — the article index.
 *
 * `getNewsListOrEmpty`, not `getNewsList`: this page is prerendered at build
 * time and the API is unreachable inside `docker build`. An empty section for
 * one build refills on the next request; a build that will not complete is a
 * deploy that does not happen. Same call the catalog page makes, for the same
 * reason.
 */
export default async function NewsIndexPage() {
  const { posts } = await getNewsListOrEmpty();

  return (
    <main>
      <JsonLd data={articleListJsonLd(posts)} />

      <header className="page-head site-shell">
        <p className="site-eyebrow">{copy.news.eyebrow}</p>
        {/* The `<h1>` is the section's strongest ranking signal, so it is the
            phrase people search — not the word «نيوز», which nobody types. */}
        <h1 className="page-title">{copy.news.heading}</h1>
        <p className="site-lead">{copy.news.subtitle}</p>
      </header>

      <div className="site-shell">
        {posts.length === 0 ? (
          <p className="page-empty">{copy.news.empty}</p>
        ) : (
          <ul className="news__grid" aria-label={copy.news.listLabel}>
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/news/${post.slug}`} className="news-card">
                  <h2 className="news-card__title">{post.title}</h2>
                  <p className="news-card__excerpt">{post.excerpt}</p>
                  <p className="news-card__meta">
                    {formatCopy(copy.news.readingTime, { n: String(post.readingMinutes) })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
