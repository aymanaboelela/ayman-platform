import { Injectable } from '@nestjs/common';
import { SiteSettingsSchema, type Contact } from '@ayman/contracts/admin/settings';
import { DEFAULT_BOOK_SHIPPING_RATES, type BookShippingRates } from '@ayman/contracts/books';
import { GRADES } from '@ayman/contracts/grades';
import type { YearOption } from '@ayman/contracts/wa-bot/intents';
import { PrismaService } from '../../prisma/prisma.service';
import { loadEnv } from '../../config/env';
import { isFeatureEnabled } from '../../common/entitlements';
import { SITE_SETTINGS_ID } from '../admin/admin.constants';
import { monthlyPlanOnSale } from '../payments/month-grants';
import type { BookFact, CourseFact, PersonalLine } from './render';

/**
 * Everything a reply may state, read at the moment the reply is composed.
 *
 * ## No cache, on purpose
 *
 * «الكورس بكام» answered from a snapshot is the bug the checkout already had
 * once (memory: checkout-must-read-live-prices): a price changed an hour ago,
 * a cached page quoted the old one, and the student was told something the
 * checkout then refused. A reply here is a handful of indexed reads a few
 * times a minute at most — cheaper than being wrong — so each one reads the
 * rows fresh.
 *
 * ## The catalogue is the PUBLIC one
 *
 * Published courses only, and only the plans the checkout itself would sell:
 * the monthly plan while a month is open (`monthlyPlanOnSale`, the same
 * function `CatalogService` uses), open priced terms, the yearly plan. The
 * quarterly plan is off the shelf (`copy.subscribe.planQuarterlyLabel`) and
 * `priceCents` is the reserved column that is always zero, so neither is read.
 */
@Injectable()
export class WaBotFactsService {
  readonly appUrl: string;

  constructor(private readonly prisma: PrismaService) {
    this.appUrl = loadEnv(process.env).APP_URL.replace(/\/+$/u, '');
  }

  async catalog(): Promise<{ courses: CourseFact[]; options: YearOption[] }> {
    const rows = await this.prisma.course.findMany({
      where: { status: 'published' },
      orderBy: [{ position: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      select: {
        slug: true,
        title: true,
        year: true,
        systemId: true,
        requiresGrant: true,
        monthlyPriceCents: true,
        yearlyPriceCents: true,
        scheduleNote: true,
        system: { select: { slug: true, nameAr: true } },
        months: { select: { isOpen: true } },
        terms: {
          where: { isOpen: true, priceCents: { not: null } },
          orderBy: { position: 'asc' },
          select: { title: true, priceCents: true },
        },
        _count: { select: { lessons: { where: { isPublished: true, isFreePreview: true } } } },
      },
    });

    const courses: CourseFact[] = rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      system: row.system.slug,
      year: row.year,
      requiresGrant: row.requiresGrant,
      monthlyPriceCents: row.monthlyPriceCents,
      monthlyOnSale: monthlyPlanOnSale(row.monthlyPriceCents, {
        total: row.months.length,
        open: row.months.filter((month) => month.isOpen).length,
      }),
      yearlyPriceCents: row.yearlyPriceCents,
      terms: row.terms.map((term) => ({ title: term.title, priceCents: term.priceCents as number })),
      freeLessons: row._count.lessons,
      scheduleNote: row.scheduleNote?.trim() || null,
    }));

    // The year options are the (system, year) pairs that actually have a
    // published course — a year with nothing to sell is not an option to
    // offer. Labels come from the stack's own `academic_years` rows (which the
    // seed keeps in step with the rest of the site), then the grade table.
    const pairs = new Map<string, { systemId: string; system: string; nameAr: string; year: number }>();
    for (const row of rows) {
      const key = `${row.system.slug}:${row.year}`;
      if (!pairs.has(key)) {
        pairs.set(key, { systemId: row.systemId, system: row.system.slug, nameAr: row.system.nameAr, year: row.year });
      }
    }
    const labels = await this.prisma.academicYear.findMany({
      where: { OR: [...pairs.values()].map((p) => ({ systemId: p.systemId, year: p.year })) },
      select: { systemId: true, year: true, labelAr: true, sortOrder: true },
    });
    const options: (YearOption & { order: number })[] = [...pairs.values()].map((p) => {
      const stored = labels.find((l) => l.systemId === p.systemId && l.year === p.year);
      const grade = GRADES.find((g) => g.system === p.system && g.year === p.year);
      return {
        system: p.system,
        year: p.year,
        label: stored?.labelAr ?? grade?.labelAr ?? `${p.nameAr} ${p.year}`,
        order: stored?.sortOrder ?? p.year,
      };
    });
    options.sort((a, b) => a.system.localeCompare(b.system) || a.order - b.order || a.year - b.year);

    return { courses, options: options.map(({ order: _order, ...option }) => option) };
  }

  async site(): Promise<{ contact: Contact; rates: BookShippingRates }> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { data: true },
    });
    const settings = SiteSettingsSchema.parse(row?.data ?? {});
    // The same expression `BooksService.shippingRates()` returns, so the bot
    // quotes the delivery fee the cart will charge.
    return { contact: settings.contact, rates: settings.store?.shippingRates ?? DEFAULT_BOOK_SHIPPING_RATES };
  }

  /** `null` on a stack without the shop — the bot then hands book questions to a person. */
  async books(): Promise<BookFact[] | null> {
    if (!isFeatureEnabled('books')) return null;
    const rows = await this.prisma.book.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { year: 'asc' }, { titleAr: 'asc' }],
      select: { titleAr: true, priceCents: true, stock: true },
      take: 12,
    });
    return rows.map((row) => ({ title: row.titleAr, priceCents: row.priceCents, inStock: row.stock !== 0 }));
  }

  /**
   * One student's own subscriptions, for «اشتراكك» — what is live, what
   * lapsed recently, and any payment still waiting on review.
   *
   * Read from the grants, never from `enrollments.status`: nothing ever writes
   * `expired` there (pitfalls: enrollment is not access).
   */
  async personal(userId: string, now = new Date()): Promise<PersonalLine[]> {
    const [grants, submissions] = await Promise.all([
      this.prisma.accessGrant.findMany({
        where: {
          userId,
          scope: { in: ['course', 'term', 'course_month', 'subject_teacher'] },
          courseId: { not: null },
          validFrom: { lte: now },
        },
        orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
        take: 40,
        select: {
          validUntil: true,
          revokedAt: true,
          course: { select: { title: true, slug: true, status: true } },
        },
      }),
      this.prisma.paymentSubmission.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { status: true, createdAt: true, course: { select: { title: true, slug: true } } },
      }),
    ]);

    const lines: PersonalLine[] = [];
    const seen = new Set<string>();
    const live = new Map<string, { title: string; slug: string; until: Date | null }>();
    const lapsed = new Map<string, { title: string; slug: string }>();
    for (const grant of grants) {
      if (!grant.course || grant.course.status !== 'published') continue;
      const slug = grant.course.slug;
      const isLive = grant.revokedAt === null && (grant.validUntil === null || grant.validUntil > now);
      if (isLive) {
        const prev = live.get(slug);
        // Open-ended beats dated; a later date beats an earlier one.
        const until =
          prev === undefined
            ? grant.validUntil
            : prev.until === null || grant.validUntil === null
              ? null
              : prev.until > grant.validUntil
                ? prev.until
                : grant.validUntil;
        live.set(slug, { title: grant.course.title, slug, until });
      } else if (grant.validUntil && now.getTime() - grant.validUntil.getTime() < 60 * 86_400_000) {
        lapsed.set(slug, { title: grant.course.title, slug });
      }
    }

    for (const submission of submissions) {
      const slug = submission.course.slug;
      if (seen.has(`pay:${slug}`)) continue;
      seen.add(`pay:${slug}`);
      if (submission.status === 'pending') {
        lines.push({ kind: 'pending', course: submission.course.title, slug, until: null, since: submission.createdAt });
      } else if (submission.status === 'rejected' && !live.has(slug)) {
        lines.push({ kind: 'rejected', course: submission.course.title, slug, until: null, since: submission.createdAt });
      }
    }
    for (const entry of live.values()) {
      lines.push({ kind: 'active', course: entry.title, slug: entry.slug, until: entry.until, since: null });
    }
    for (const entry of lapsed.values()) {
      if (live.has(entry.slug)) continue;
      lines.push({ kind: 'expired', course: entry.title, slug: entry.slug, until: null, since: null });
    }
    return lines.slice(0, 4);
  }
}
