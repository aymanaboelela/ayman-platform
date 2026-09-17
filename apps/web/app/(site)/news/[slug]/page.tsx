import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { copy, formatCopy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { MarkdownBody } from '@/components/news/markdown-body';
import { JsonLd } from '@/components/seo/json-ld';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getNewsPost } from '@/lib/news';
import { parseMarkdown, tableOfContents } from '@/lib/news/markdown';
import { faqRowsFromBlocks, questionsFromBlocks, termsFromBlocks } from '@/lib/news/structured';
import {
  SITE_URL,
  articleJsonLd,
  breadcrumbJsonLd,
  definedTermSetJsonLd,
  faqPageJsonLd,
  quizJsonLd,
} from '@/lib/seo/jsonld';
import { formatArticleDate } from '@/lib/format';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * ⚠️ There is deliberately NO `generateStaticParams` here, and adding one back
 * will break the build the first time the section is empty.
 *
 * `cacheComponents: true` requires every `generateStaticParams` to return at
 * least one result — an empty array is `EmptyGenerateStaticParamsError`, not a
 * quiet no-op. This section legitimately starts empty and stays empty until
 * the instructor publishes his first article, and a brand-new database (CI,
 * a fresh clone, the first production deploy) has nothing in it at all. So the
 * one route that MUST tolerate zero rows is the one that cannot have this.
 *
 * `/courses/[slug]` gets away with it only because `seed-admin.ts` always
 * creates a demo course; nothing seeds news, and nothing should.
 *
 * Nothing is lost. `getNewsPost` is `'use cache'` with `cacheLife('hours')`
 * and tagged `TAG_NEWS`, so the second visitor to an article gets it from the
 * cache exactly as they would from a prerender — only the very first request
 * after a publish pays for the render.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPost(slug);

  /*
   * A draft and a missing article get the same metadata treatment as the same
   * 404 below — nothing here may confirm that an unpublished slug exists.
   *
   * ⚠️ NOT `buildMetadata`, and that is the whole point of this branch. It
   * sets `alternates.canonical` and no `robots`, so a guessed slug used to
   * answer with `index: true` (inherited from `rootMetadata`) AND a canonical
   * pointing at the guessed URL itself — the page asserting the junk URL was
   * the preferred one. Measured on production 2026-09-15:
   * `/news/does-not-exist-abc123` returned 200 carrying BOTH
   * `<meta name="robots" content="noindex">` from the not-found boundary and
   * `<meta name="robots" content="index, follow">` from here. Google resolves
   * a conflict by taking the most restrictive, so it was saved by a tie-break
   * rather than by this file; nothing says another engine or an assistant
   * applies the same rule, and the self-canonical was wrong under every rule.
   *
   * `/courses/[slug]` has always done it this way — see its own
   * `generateMetadata`. This is that shape, in the section that had missed it.
   */
  if (!post) return { title: copy.notFound.site.title, robots: { index: false, follow: false } };

  return buildMetadata({
    title: post.title,
    // `excerpt` IS the meta description — one field, capped at 160 in the
    // contract precisely so it can serve both jobs without a second field
    // that silently rots.
    description: post.excerpt,
    path: `/news/${post.slug}`,
    type: 'article',
    // The article's own cover becomes its share card. Without this every
    // article shares the platform's generic OG image, so twenty-six links
    // pasted into one WhatsApp group are twenty-six identical thumbnails.
    // `null` falls back to that generic image inside `buildMetadata`, which
    // is the right answer for an article with no cover.
    image: post.coverKey ? mediaUrl(post.coverKey) : null,
  });
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getNewsPost(slug);

  if (!post) notFound();

  const blocks = parseMarkdown(post.body);
  const toc = tableOfContents(blocks);

  /*
   * The three graphs an assistant can actually quote, read out of the body the
   * page is about to render — see `lib/news/structured.ts` for why they are
   * derived rather than authored, and for the thresholds that keep an ordinary
   * article from publishing an empty FAQ or a fake glossary. Both builders
   * return null for an empty list and `JsonLd` renders nothing for null, so an
   * article with neither shape emits neither script.
   */
  /*
   * The course this article was written for, resolved to the fields the
   * curriculum anchor needs — `relatedCourseSlug` travels on the post, the
   * subject/system/year do not.
   *
   * `getCatalogOrEmpty`, never `getCatalog`: this page renders where the API
   * can be unreachable by construction, and an article is allowed to lose its
   * anchor rather than fail to render. Same cached read the course grid uses,
   * so it costs nothing new.
   */
  const { courses } = await getCatalogOrEmpty();
  const relatedCourse =
    courses.find((candidate) => candidate.slug === post.relatedCourseSlug) ?? null;

  const faqRows = faqRowsFromBlocks(blocks);
  const terms = termsFromBlocks(blocks, `/news/${post.slug}`);
  const questions = questionsFromBlocks(blocks);
  const articleUrl = `${SITE_URL}/news/${post.slug}`;

  return (
    <main>
      <JsonLd
        data={articleJsonLd(
          { ...post, image: post.coverKey ? mediaUrl(post.coverKey) : null },
          relatedCourse,
        )}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.news.title, path: '/news' },
          { name: post.title, path: `/news/${post.slug}` },
        ])}
      />
      <JsonLd data={faqPageJsonLd(faqRows)} />
      {/* Its own `@id`, name and description — this is a different set from the
          twelve terms on `/essentials`, not a second copy of them. */}
      <JsonLd
        data={definedTermSetJsonLd(terms, (term) => `${SITE_URL}${term.url}`, {
          id: `${articleUrl}#glossary`,
          name: post.title,
          description: post.excerpt,
        })}
      />
      {/* `about` is the related course when the article declares one — the same
          field the CTA below already reads, so the quiz cannot claim a subject
          the page does not link to. */}
      <JsonLd
        data={quizJsonLd(questions, {
          id: `${articleUrl}#quiz`,
          name: post.title,
          about: post.relatedCourseTitle,
        })}
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
            <time dateTime={post.publishedAt}>
              {copy.news.published} {formatArticleDate(post.publishedAt)}
            </time>
            {' · '}
            {formatCopy(copy.news.readingTime, { n: String(post.readingMinutes) })}
          </p>
        </header>

        {/*
          The cover, BELOW the header rather than above it.

          Above the title it would push the `<h1>` under the fold on a phone
          and make the first thing a reader sees a decorative photograph. The
          title stays the first content; the image is the break between the
          lead and the body.

          Decorative — see the identical call on the index card.
        */}
        {post.coverKey ? (
          <div className="article__cover">
            <Image
              src={mediaUrl(post.coverKey)}
              alt=""
              aria-hidden="true"
              width={1200}
              height={630}
              sizes="(min-width: 64rem) 44rem, 94vw"
              className="article__cover-img"
              priority
            />
          </div>
        ) : null}

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
