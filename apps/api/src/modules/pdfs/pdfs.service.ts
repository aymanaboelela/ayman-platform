import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminPdfDetail,
  AdminPdfRow,
  PdfCategory,
  PdfCreate,
  PdfDetail,
  PdfList,
  PdfListItem,
  PdfPatch,
  PdfYear,
} from '@ayman/contracts/pdfs';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';

/**
 * «ملفات PDF» — see `packages/contracts/src/pdfs.ts`.
 *
 * Same one rule as `NewsService`: a draft is invisible, and the filter that
 * makes it so is in the WHERE clause of every public read, never in code after
 * the fetch.
 */

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  category: true,
  year: true,
  coverKey: true,
  sizeBytes: true,
  pageCount: true,
  downloads: true,
  publishedAt: true,
  updatedAt: true,
} as const;

interface ListRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  year: number | null;
  coverKey: string | null;
  sizeBytes: number;
  pageCount: number | null;
  downloads: number;
  publishedAt: Date | null;
  updatedAt: Date;
}

/** `publishedAt!` only on rows already filtered to `published` — the CHECK
 *  `pdf_files_published_has_date` guarantees it. */
function toListItem(row: ListRow): PdfListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category as PdfCategory,
    year: row.year as PdfYear,
    coverKey: row.coverKey,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    downloads: row.downloads,
    publishedAt: (row.publishedAt as Date).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminRow(row: ListRow & { status: 'draft' | 'published' }): AdminPdfRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category as PdfCategory,
    year: row.year as PdfYear,
    status: row.status,
    sizeBytes: row.sizeBytes,
    downloads: row.downloads,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface PdfDownload {
  fileKey: string;
  slug: string;
  title: string;
  sizeBytes: number;
}

@Injectable()
export class PdfsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPublic(): Promise<PdfList> {
    const rows = await this.prisma.pdfFile.findMany({
      where: { status: 'published' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: LIST_SELECT,
    });
    return { pdfs: rows.map(toListItem) };
  }

  async findPublicBySlug(slug: string): Promise<PdfDetail | null> {
    const row = await this.prisma.pdfFile.findFirst({
      where: { slug, status: 'published' },
      select: { ...LIST_SELECT, body: true },
    });
    if (!row) return null;

    // «كمان ملفات» — same year first, then the newest. Four is a row of
    // cards, and the page is about ONE file.
    const others = await this.prisma.pdfFile.findMany({
      where: { status: 'published', NOT: { id: row.id } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 24,
      select: LIST_SELECT,
    });
    const related = [
      ...others.filter((other) => row.year !== null && other.year === row.year),
      ...others.filter((other) => row.year === null || other.year !== row.year),
    ].slice(0, 4);

    return { ...toListItem(row), body: row.body, related: related.map(toListItem) };
  }

  /**
   * The download: the published row's storage key, and the counter bumped.
   *
   * The bump is one atomic `UPDATE … SET download_count = download_count + 1`
   * filtered on `published`, so a draft cannot be downloaded by guessing its
   * slug and two simultaneous downloads cannot lose a count.
   */
  async startDownload(slug: string): Promise<PdfDownload | null> {
    const updated = await this.prisma.pdfFile.updateManyAndReturn({
      where: { slug, status: 'published' },
      data: { downloads: { increment: 1 } },
      select: { fileKey: true, slug: true, title: true, sizeBytes: true },
    });
    return updated[0] ?? null;
  }

  async listAdmin(): Promise<AdminPdfRow[]> {
    const rows = await this.prisma.pdfFile.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { ...LIST_SELECT, status: true },
    });
    return rows.map(toAdminRow);
  }

  async findAdminById(id: string): Promise<AdminPdfDetail> {
    const row = await this.prisma.pdfFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return {
      ...toAdminRow(row),
      description: row.description,
      body: row.body,
      coverKey: row.coverKey,
      fileKey: row.fileKey,
      fileName: row.fileName,
      pageCount: row.pageCount,
    };
  }

  async create(input: PdfCreate, actorId: string): Promise<AdminPdfRow> {
    await this.assertSlugFree(input.slug, null);

    const row = await this.prisma.pdfFile.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        body: input.body,
        category: input.category,
        year: input.year,
        coverKey: input.coverKey,
        fileKey: input.fileKey,
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        pageCount: input.pageCount,
        authorId: actorId,
        // Always a draft, like an article: publishing is its own act.
        status: 'draft',
      },
      select: { ...LIST_SELECT, status: true },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'pdf:create',
      resourceType: AUDIT_RESOURCES.pdfFile,
      resourceId: row.id,
      outcome: 'success',
      metadata: { slug: row.slug },
    });

    return toAdminRow(row);
  }

  async patch(id: string, input: PdfPatch, actorId: string): Promise<AdminPdfDetail> {
    const existing = await this.prisma.pdfFile.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException();
    if (input.slug && input.slug !== existing.slug) await this.assertSlugFree(input.slug, id);

    // Absent = untouched. Spelled field by field so an `undefined` can never
    // reach Prisma as "set to null".
    const data: Record<string, unknown> = {};
    for (const key of [
      'slug',
      'title',
      'description',
      'body',
      'category',
      'year',
      'coverKey',
      'fileKey',
      'fileName',
      'sizeBytes',
      'pageCount',
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    await this.prisma.pdfFile.update({ where: { id }, data });

    await this.audit.record({
      actorUserId: actorId,
      action: 'pdf:update',
      resourceType: AUDIT_RESOURCES.pdfFile,
      resourceId: id,
      outcome: 'success',
      metadata: { fields: Object.keys(data) },
    });

    return this.findAdminById(id);
  }

  async setPublished(id: string, isPublished: boolean, actorId: string): Promise<AdminPdfRow> {
    const existing = await this.prisma.pdfFile.findUnique({ where: { id }, select: { publishedAt: true } });
    if (!existing) throw new NotFoundException();

    const row = await this.prisma.pdfFile.update({
      where: { id },
      data: {
        status: isPublished ? 'published' : 'draft',
        ...(isPublished && existing.publishedAt === null ? { publishedAt: new Date() } : {}),
      },
      select: { ...LIST_SELECT, status: true },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: isPublished ? 'pdf:publish' : 'pdf:unpublish',
      resourceType: AUDIT_RESOURCES.pdfFile,
      resourceId: id,
      outcome: 'success',
    });

    return toAdminRow(row);
  }

  /**
   * The row only. The stored bytes stay: the same key may be referenced by a
   * lesson resource that was made from the same upload, and an orphaned file
   * costs megabytes where a wrongly deleted one costs a lesson.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.pdfFile.findUnique({ where: { id }, select: { slug: true } });
    if (!existing) throw new NotFoundException();
    await this.prisma.pdfFile.delete({ where: { id } });

    await this.audit.record({
      actorUserId: actorId,
      action: 'pdf:delete',
      resourceType: AUDIT_RESOURCES.pdfFile,
      resourceId: id,
      outcome: 'success',
      metadata: { slug: existing.slug },
    });
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.pdfFile.findFirst({
      where: { slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException('slug_taken');
  }
}
