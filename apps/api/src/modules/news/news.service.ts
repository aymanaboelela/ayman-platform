import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  readingMinutes,
  type AdminNewsDetail,
  type AdminNewsRow,
  type NewsCreate,
  type NewsList,
  type NewsListItem,
  type NewsPatch,
  type NewsPostDetail,
} from '@ayman/contracts/news';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';

/**
 * «نيوز» — the public articles section.
 *
 * ## The one rule this file exists to enforce
 *
 * A draft must be invisible. Every public read below filters
 * `status: 'published'` in the WHERE clause, never in application code after
 * the fetch — because a filter in JavaScript is one early `return` away from
 * being skipped, and the failure mode is an unpublished article on the public
 * internet with no error anywhere.
 *
 * ## Why the public reads do not select `body` for the list
 *
 * `listPublic` renders cards. Selecting forty article bodies to compute forty
 * reading times would move most of a page's weight over the wire for data that
 * is never displayed — so `readingMinutes` is stored nowhere and computed from
 * the body only on the detail read, and the list computes it from a length the
 * database returns instead. See `LIST_SELECT`.
 */

/**
 * ⚠️ `body` is selected here, and it is not a mistake — `readingMinutes` needs
 * it and Prisma cannot compute `length(body)` in a select.
 *
 * The alternative was a stored `reading_minutes` column, rejected because it
 * is derived data that would silently go stale on every edit that forgot to
 * recompute it. The list is a handful of articles on a `'use cache'`d page,
 * not a hot path; correctness wins over the bytes.
 */
const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverKey: true,
  publishedAt: true,
  updatedAt: true,
  body: true,
} as const;

interface ListRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverKey: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  body: string;
}

/**
 * `publishedAt!` is safe ONLY on rows already filtered to `published`, which
 * the database guarantees has a date (`news_posts_published_has_date`). Every
 * caller of this helper filters on status first.
 */
function toListItem(row: ListRow): NewsListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverKey: row.coverKey,
    publishedAt: (row.publishedAt as Date).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: readingMinutes(row.body),
  };
}

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Public: published only, newest first — served by the index page's cached loader. */
  async listPublic(): Promise<NewsList> {
    const rows = await this.prisma.newsPost.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
      select: LIST_SELECT,
    });

    return { posts: rows.map(toListItem), total: rows.length };
  }

  /**
   * Public: one published article by slug, or `null`.
   *
   * ⚠️ `null` rather than a throw, and the caller turns it into a 404. A draft
   * and a slug that never existed must be indistinguishable from outside —
   * otherwise the difference between 404 and 403 tells a stranger which
   * unpublished articles exist.
   */
  async findPublicBySlug(slug: string): Promise<NewsPostDetail | null> {
    const row = await this.prisma.newsPost.findFirst({
      where: { slug, status: 'published' },
      select: {
        ...LIST_SELECT,
        // The CTA. Only a PUBLISHED course may be named: an article pointing
        // at a draft course would send a reader to a 404 on our own site.
        relatedCourse: { select: { slug: true, title: true, status: true } },
      },
    });

    if (!row) return null;

    const course = row.relatedCourse?.status === 'published' ? row.relatedCourse : null;

    return {
      ...toListItem(row),
      body: row.body,
      relatedCourseSlug: course?.slug ?? null,
      relatedCourseTitle: course?.title ?? null,
    };
  }

  /** Admin: every post, drafts included, newest activity first. */
  async listAdmin(): Promise<AdminNewsRow[]> {
    const rows = await this.prisma.newsPost.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, slug: true, title: true, status: true, publishedAt: true, updatedAt: true },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async findAdminById(id: string): Promise<AdminNewsDetail> {
    const row = await this.prisma.newsPost.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      excerpt: row.excerpt,
      body: row.body,
      coverKey: row.coverKey,
      relatedCourseId: row.relatedCourseId,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async create(input: NewsCreate, actorId: string): Promise<AdminNewsRow> {
    await this.assertSlugFree(input.slug, null);

    const row = await this.prisma.newsPost.create({
      data: {
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        body: input.body,
        coverKey: input.coverKey ?? null,
        relatedCourseId: input.relatedCourseId ?? null,
        authorId: actorId,
        // Always a draft. There is no "create and publish" path on purpose —
        // publishing is a separate permission and a separate, auditable act.
        status: 'draft',
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'news:create',
      resourceType: AUDIT_RESOURCES.newsPost,
      resourceId: row.id,
      outcome: 'success',
      metadata: { slug: row.slug },
    });

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async patch(id: string, input: NewsPatch, actorId: string): Promise<AdminNewsDetail> {
    const existing = await this.prisma.newsPost.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException();

    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugFree(input.slug, id);
    }

    await this.prisma.newsPost.update({
      where: { id },
      data: {
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.excerpt === undefined ? {} : { excerpt: input.excerpt }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.coverKey === undefined ? {} : { coverKey: input.coverKey }),
        ...(input.relatedCourseId === undefined ? {} : { relatedCourseId: input.relatedCourseId }),
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'news:update',
      resourceType: AUDIT_RESOURCES.newsPost,
      resourceId: id,
      outcome: 'success',
      metadata: input.slug ? { slug: input.slug } : undefined,
    });

    return this.findAdminById(id);
  }

  /**
   * Publish / unpublish.
   *
   * ⚠️ `publishedAt` is set ONCE, on the first publish, and never moved by a
   * later republish. It is `datePublished` in the article's JSON-LD and the
   * sort key of the index; bumping it on every unpublish/republish cycle would
   * tell crawlers an old article is new every time a typo is fixed, and would
   * silently reorder the whole section.
   */
  async setPublished(id: string, isPublished: boolean, actorId: string): Promise<AdminNewsRow> {
    const existing = await this.prisma.newsPost.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    if (!existing) throw new NotFoundException();

    const row = await this.prisma.newsPost.update({
      where: { id },
      data: {
        status: isPublished ? 'published' : 'draft',
        // The CHECK constraint refuses a published row with no date, so this
        // fills it on the first publish only.
        ...(isPublished && existing.publishedAt === null ? { publishedAt: new Date() } : {}),
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: isPublished ? 'news:publish' : 'news:unpublish',
      resourceType: AUDIT_RESOURCES.newsPost,
      resourceId: id,
      outcome: 'success',
    });

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.newsPost.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException();

    await this.prisma.newsPost.delete({ where: { id } });

    await this.audit.record({
      actorUserId: actorId,
      action: 'news:delete',
      resourceType: AUDIT_RESOURCES.newsPost,
      resourceId: id,
      outcome: 'success',
      metadata: { slug: existing.slug },
    });
  }

  /**
   * A duplicate slug is a 409, not a 500.
   *
   * The unique index is the real guarantee; this exists so the admin gets a
   * usable message instead of a Prisma error, and it is checked case-insensitively
   * by the column's own CITEXT type rather than by lowercasing here.
   */
  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.newsPost.findFirst({
      where: { slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException('slug_taken');
  }
}
