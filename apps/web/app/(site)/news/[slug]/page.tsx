import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { copy, formatCopy } from '@ayman/contracts';
import { MarkdownBody } from '@/components/news/markdown-body';
import { JsonLd } from '@/components/seo/json-ld';
import { getNewsListOrEmpty, getNewsPost } from '@/lib/news';
import { parseMarkdown, tableOfContents } from '@/lib/news/markdown';
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Prerenders every published article at build time.
 *
 * `getNewsListOrEmpty` so a build survives an unreachable API — the articles
 * then render on demand instead, which is correct rather than merely tolerable
 * (the route is still dynamic; only the head start is lost).
 */
export async function generateStaticParams() {
  const { posts } = await getNewsListOrEmpty();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPost(slug);

  // A draft and a missing article get the same metadata treatment as the same
  // 404 below — nothing here may confirm that an unpublished slug exists.
  if (!post) return buildMetadata({ title: copy.news.title, path: `/news/${slug}` });

  return buildMetadata({
    title: post.title,
    // `excerpt` IS the meta description — one field, capped at 160 in the
    // contract precisely so it can serve both jobs without a second field
    // that silently rots.
    description: post.excerpt,
    path: `/news/${post.slug}`,
    type: 'article',
  });
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getNewsPost(slug);

  if (!post) notFound();

  const blocks = parseMarkdown(post.body);
  const toc = tableOfContents(blocks);

  return (
    <main>
      <JsonLd data={articleJsonLd(post)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.news.title, path: '/news' },
          { name: post.title, path: `/news/${post.slug}` },
        ])}
      />

      <article className="site-shell article">
        <header className="article__head">
          <Link href="/news" className="article__back">
            {copy.news.backToList}
          </Link>
          {/* The article title is the page's ONLY h1 — the markdown parser
              refuses to emit another one from the body. */}
          <h1 className="article__title">{post.title}</h1>
          <p className="article__lead">{post.excerpt}</p>
          <p className="article__meta">
            <time dateTime={post.publishedAt}>{copy.news.published}</time>
            {' · '}
            {formatCopy(copy.news.readingTime, { n: String(post.readingMinutes) })}
          </p>
        </header>

        {/* Only worth rendering for an article long enough to navigate. Two
            headings is a list that costs more attention than it saves. */}
        {toc.length >= 3 ? (
          <nav className="article__toc" aria-label={copy.news.listLabel}>
            <ol>
              {toc.map((entry) => (
                <li key={entry.id} data-level={entry.level}>
                  <a href={`#${entry.id}`}>{entry.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <MarkdownBody blocks={blocks} />

        {/*
          The conversion path, and the reason this section earns its keep. An
          article that ranks and then dead-ends is traffic the platform paid to
          acquire and gave away.
        */}
        <aside className="article__cta">
          {post.relatedCourseSlug && post.relatedCourseTitle ? (
            <>
              <p className="article__cta-title">{copy.news.relatedTitle}</p>
              <p className="article__cta-body">
                {formatCopy(copy.news.relatedBody, { course: post.relatedCourseTitle })}
              </p>
              <Link href={`/courses/${post.relatedCourseSlug}`} className="site-btn site-btn--primary">
                {copy.news.relatedCta}
              </Link>
            </>
          ) : (
            <>
              <p className="article__cta-title">{copy.news.fallbackTitle}</p>
              <p className="article__cta-body">{copy.news.fallbackBody}</p>
              <Link href="/courses" className="site-btn site-btn--primary">
                {copy.news.fallbackCta}
              </Link>
            </>
          )}
        </aside>
      </article>
    </main>
  );
}
