import Link from 'next/link';
import Image from 'next/image';
import { copy, formatCopy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { getNewsListOrEmpty } from '@/lib/news';

/**
 * The published articles written for one course, on that course's page.
 *
 * ## Why it exists
 *
 * A visitor who is not ready to pay used to leave a course page with nothing,
 * while the site had a written explanation of every lesson in that syllabus one
 * directory away. And the articles were reachable only from `/news` and the
 * sitemap: the pages that actually earn impressions linked to none of them.
 *
 * So this is one change doing two jobs — the reader gets the thing they came
 * for, and the pages that rank start pointing at the pages that should.
 *
 * ## The filter
 *
 * `relatedCourseSlug` is set when an article is published and already travels
 * on every news row, so no endpoint was added and an article belonging to
 * another course cannot appear here.
 *
 * ⚠️ `getNewsListOrEmpty`, never `getNewsList`. This renders inside a page that
 * is prerendered at build time, where the API is unreachable by construction —
 * the throwing variant would fail the build over a section that is allowed to
 * be empty. An empty list renders nothing at all rather than an empty heading.
 */
export async function CourseArticles({ courseSlug }: { courseSlug: string }) {
  const { posts } = await getNewsListOrEmpty();
  const forCourse = posts.filter((post) => post.relatedCourseSlug === courseSlug);

  if (forCourse.length === 0) return null;

  return (
    <section className="site-section site-section--tint">
      <div className="site-shell">
        <p className="site-eyebrow">{copy.course.articlesEyebrow}</p>
        <h2 className="site-h2">{copy.course.articlesTitle}</h2>
        <p className="site-lead">{copy.course.articlesLead}</p>

        {/* The same objects `/news` is built from — one card, defined once, so
            the two surfaces cannot drift into looking like different products. */}
        <ul className="news__grid" aria-label={copy.course.articlesTitle}>
          {forCourse.map((post) => (
            <li key={post.id}>
              <Link href={`/news/${post.slug}`} className="news-card">
                {/* Decorative: the `<h3>` on the next line already names the
                    article, so an alt describing the photo would make a screen
                    reader announce it twice. 1200×630 is the real size every
                    cover is produced at, so the box is reserved exactly. */}
                {post.coverKey ? (
                  <div className="news-card__cover">
                    <Image
                      src={mediaUrl(post.coverKey)}
                      alt=""
                      aria-hidden="true"
                      width={1200}
                      height={630}
                      sizes="(min-width: 48rem) 50vw, 94vw"
                      className="news-card__img"
                    />
                  </div>
                ) : null}
                <div className="news-card__body">
                  {/* `h3`, not the `h2` `/news` uses — there the card IS the
                      page's section; here it sits under this section's own h2. */}
                  <h3 className="news-card__title">{post.title}</h3>
                  <p className="news-card__excerpt">{post.excerpt}</p>
                  <p className="news-card__meta">
                    {formatCopy(copy.news.readingTime, { n: String(post.readingMinutes) })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
