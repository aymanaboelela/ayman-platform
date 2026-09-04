import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminBookCreateInput,
  AdminBookPatchInput,
  AdminBookRow,
} from '@ayman/contracts/admin/books';
import type { BookCard, BookCatalog, BookShelf, BookTerm } from '@ayman/contracts/books';
import { BOOK_SHIPPING_CENTS } from '@ayman/contracts/books';
import { copy } from '@ayman/contracts/copy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { SettingsService } from '../admin/settings/settings.service';

/**
 * «قسم الكتب» — the catalogue behind `/books` and `/admin/books`.
 *
 * ## Why the shop is a separate service from the orders
 *
 * `BookOrdersService` is about one customer: an address, a payment, a parcel.
 * This is about the shelf — what is on sale, at what price, in what order. They
 * share only `BookOrderItem`, and the direction of that dependency is one-way:
 * the order service reads the catalogue to price a cart, and nothing here ever
 * reads an order except the one COUNT that makes the admin list worth sorting.
 *
 * ## The catalogue does not filter by year, and that is not an oversight
 *
 * Every visitor sees every subject and every year, exactly as the course
 * catalogue does. A first-year student buying next year's book early is a sale,
 * not a mistake to prevent — and the year label on each card is what tells the
 * two apart. What IS filtered: `isActive`. A book taken off the shelf leaves
 * the shop entirely rather than rendering as an un-buyable card.
 */

/**
 * The shelf a book with no subject sits on.
 *
 * A book that belongs to no one subject is a real product — a revision booklet
 * spanning three of them, a past-papers collection. Dropping it because the
 * grouping key is null would silently hide stock; giving it a heading of its
 * own says what it is. Sorted last, always, because it is the miscellaneous
 * pile and a named subject should never appear below it.
 */
const GENERAL_SHELF_ID = null;

/**
 * «شيلت الكتاب من الكورس» ⇒ the course button goes with it.
 *
 * `showOnCourse` says "put a buy-this-book button on the course page", and a
 * book with no `courseId` has no course page to put it on. A row carrying
 * `courseId: null, showOnCourse: true` is not merely untidy: nothing renders
 * it, so the admin screen would keep reporting a placement the student can
 * never see, and re-linking the book months later would silently republish it
 * somewhere nobody meant.
 *
 * ⚠️ This is deliberately NOT a database CHECK, and the migration says so at
 * length. The admin PATCH is partial: `{ courseId: null }` and
 * `{ showOnCourse: false }` legitimately arrive in different requests, so a
 * constraint spanning the two columns would turn unlinking a book into a 500
 * with a constraint name in it. Normalising in the service makes it an EFFECT
 * instead — one a test can assert by patching `courseId` to null and reading
 * `showOnCourse` back, which is exactly what `books.service.spec.ts` does.
 *
 * Only ever clears. Re-linking a book does not re-tick the box: `courseId`
 * arriving with no `showOnCourse` beside it means the admin said where the book
 * belongs, not that they asked to advertise it there.
 */
function withPlacementNormalised<T extends { showOnCourse?: boolean }>(
  data: T,
  courseIdAfter: string | null,
): T {
  return courseIdAfter === null ? { ...data, showOnCourse: false } : data;
}

interface CatalogRow {
  id: string;
  slug: string;
  titleAr: string;
  subtitleAr: string | null;
  coverKey: string | null;
  descriptionAr: string | null;
  priceCents: number;
  comparePriceCents: number | null;
  pageCount: number | null;
  term: BookTerm;
  year: number | null;
  stock: number | null;
  forGeneral: boolean;
  forLanguages: boolean;
  showOnLanding: boolean;
  subjectId: string | null;
  subject: { nameAr: string; slug: string } | null;
}

function toCard(row: CatalogRow): BookCard {
  return {
    id: row.id,
    slug: row.slug,
    titleAr: row.titleAr,
    subtitleAr: row.subtitleAr,
    coverKey: row.coverKey,
    descriptionAr: row.descriptionAr,
    priceCents: row.priceCents,
    comparePriceCents: row.comparePriceCents,
    pageCount: row.pageCount,
    term: row.term,
    year: row.year,
    /* `null` stock means «مش بنعد» and is the normal case — only a hard zero is
       out of stock. Writing this as `row.stock !== 0` rather than
       `(row.stock ?? 1) > 0` keeps that distinction visible at the one place it
       is decided. */
    inStock: row.stock !== 0,
    forGeneral: row.forGeneral,
    forLanguages: row.forLanguages,
    /* Placement, carried on the card rather than filtered out of the list:
       `<BooksStrip>` and `/books` read ONE cached payload between them, so the
       strip filters on this field client-side and the shop ignores it. Filtering
       here would mean two fetches that can disagree for a cache window. */
    showOnLanding: row.showOnLanding,
  };
}

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The public shop — active books only, grouped «المادة ← الترم».
   *
   * ⚠️ A subject with no books never appears. «لو المادة مفيش ليها كتاب مش
   * هضيفه» — and the shape of this method is what guarantees it: shelves are
   * built FROM the books rather than from the subject list, so an empty shelf
   * is not something that can be constructed. Iterating subjects and asking
   * "does it have books" would have produced the same page today and an empty
   * heading the first time someone deactivated the last book on a shelf.
   */
  async catalog(): Promise<BookCatalog> {
    const rows = await this.prisma.book.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { year: 'asc' }, { titleAr: 'asc' }],
      select: {
        id: true,
        slug: true,
        titleAr: true,
        subtitleAr: true,
        coverKey: true,
        descriptionAr: true,
        priceCents: true,
        comparePriceCents: true,
        pageCount: true,
        term: true,
        year: true,
        stock: true,
        forGeneral: true,
        forLanguages: true,
        showOnLanding: true,
        subjectId: true,
        subject: { select: { nameAr: true, slug: true } },
      },
    });

    const shelves = new Map<string, BookShelf>();
    for (const row of rows) {
      const key = row.subjectId ?? 'general';
      let shelf = shelves.get(key);
      if (!shelf) {
        shelf = {
          subjectId: row.subjectId ?? GENERAL_SHELF_ID,
          subjectNameAr: row.subject?.nameAr ?? copy.books.generalShelf,
          subjectSlug: row.subject?.slug ?? null,
          first: [],
          second: [],
          full: [],
        };
        shelves.set(key, shelf);
      }
      shelf[row.term].push(toCard(row));
    }

    /* Subjects alphabetically, «كتب عامة» last. `localeCompare` with an Arabic
       locale, not the default: the default sorts Arabic by code point, which
       puts «إحصاء» after «رياضيات» because of the hamza. */
    const ordered = [...shelves.values()].sort((a, b) => {
      if (a.subjectId === null) return 1;
      if (b.subjectId === null) return -1;
      return a.subjectNameAr.localeCompare(b.subjectNameAr, 'ar');
    });

    return {
      shelves: ordered,
      shippingCents: await this.shippingCents(),
      total: rows.length,
    };
  }

  /**
   * The delivery fee currently in force, in piastres.
   *
   * Read from settings on every call rather than cached: it is one jsonb column
   * on a singleton row that every page already loads, and a cached shipping fee
   * is a fee that keeps being charged for minutes after it was changed — the
   * exact failure `build-bakes-empty-settings-cache` describes, on a number
   * people pay.
   */
  async shippingCents(): Promise<number> {
    const settings = await this.settings.read();
    return settings.store?.shippingCents ?? BOOK_SHIPPING_CENTS;
  }

  // ── admin ───────────────────────────────────────────────────────────────

  /**
   * The whole catalogue, inactive rows included, with the one derived number
   * that makes it worth reading: how many copies of each title have been
   * ordered. Not paginated — a shop with more titles than a single screen is a
   * different product, and pagination here would cost a page control on a list
   * of twelve.
   */
  async adminList(): Promise<AdminBookRow[]> {
    const rows = await this.prisma.book.findMany({
      orderBy: [{ sortOrder: 'asc' }, { titleAr: 'asc' }],
      select: {
        id: true,
        slug: true,
        titleAr: true,
        subtitleAr: true,
        subjectId: true,
        subject: { select: { nameAr: true } },
        year: true,
        term: true,
        courseId: true,
        course: { select: { title: true } },
        forGeneral: true,
        forLanguages: true,
        showOnLanding: true,
        showOnCourse: true,
        priceCents: true,
        comparePriceCents: true,
        unitCostCents: true,
        coverKey: true,
        descriptionAr: true,
        pageCount: true,
        isActive: true,
        stock: true,
        sortOrder: true,
        updatedAt: true,
      },
    });

    /* One grouped COUNT for the whole list rather than a `_count` on each row:
       the relation count would be a correlated subquery per book, and this
       screen is opened to compare titles against each other. */
    const ordered = await this.prisma.bookOrderItem.groupBy({
      by: ['bookId'],
      _sum: { quantity: true },
    });
    const orderedByBook = new Map(
      ordered
        .filter((entry): entry is typeof entry & { bookId: string } => entry.bookId !== null)
        .map((entry) => [entry.bookId, entry._sum.quantity ?? 0]),
    );

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleAr: row.titleAr,
      subtitleAr: row.subtitleAr,
      subjectId: row.subjectId,
      subjectNameAr: row.subject?.nameAr ?? null,
      year: row.year,
      term: row.term,
      courseId: row.courseId,
      courseTitle: row.course?.title ?? null,
      forGeneral: row.forGeneral,
      forLanguages: row.forLanguages,
      showOnLanding: row.showOnLanding,
      showOnCourse: row.showOnCourse,
      priceCents: row.priceCents,
      comparePriceCents: row.comparePriceCents,
      unitCostCents: row.unitCostCents,
      coverKey: row.coverKey,
      descriptionAr: row.descriptionAr,
      pageCount: row.pageCount,
      isActive: row.isActive,
      stock: row.stock,
      sortOrder: row.sortOrder,
      orderedCount: orderedByBook.get(row.id) ?? 0,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async create(adminId: string, input: AdminBookCreateInput): Promise<AdminBookRow> {
    await this.assertRelationsExist(input.subjectId ?? null, input.courseId ?? null);

    /* The two unique columns, checked before the write so each gets its own
       sentence. A raw P2002 would tell the admin "something is duplicated" and
       leave them to guess which of the slug and the course it was. */
    await this.assertSlugFree(input.slug, null);
    await this.assertCourseFree(input.courseId ?? null, null);

    const book = await this.prisma.book.create({
      /* A create carries every field — `AdminBookCreateSchema` defaults them —
         so the resulting `courseId` is simply the one that was sent. */
      data: withPlacementNormalised(input, input.courseId ?? null),
      select: { id: true },
    });

    await this.audit.record({
      action: 'book:create',
      resourceType: AUDIT_RESOURCES.book,
      resourceId: book.id,
      outcome: 'success',
      metadata: { adminId, slug: input.slug, priceCents: input.priceCents },
    });

    return this.adminOne(book.id);
  }

  async patch(adminId: string, id: string, input: AdminBookPatchInput): Promise<AdminBookRow> {
    const existing = await this.prisma.book.findUnique({
      where: { id },
      select: { id: true, priceCents: true, comparePriceCents: true, courseId: true },
    });
    if (!existing) throw new NotFoundException();

    /*
     * The compare-price rule needs BOTH numbers, and a patch may carry either,
     * both or neither — so it is re-checked here against the row as it will BE,
     * not as it was sent. Dropping a price below an existing "before" price
     * without mentioning that column is the case the contract's own refinement
     * cannot see, and the database would reject it as a 500.
     */
    const priceCents = input.priceCents ?? existing.priceCents;
    const comparePriceCents =
      input.comparePriceCents !== undefined ? input.comparePriceCents : existing.comparePriceCents;
    if (comparePriceCents !== null && comparePriceCents <= priceCents) {
      throw new ConflictException('السعر قبل الخصم لازم يكون أعلى من السعر الحالي');
    }

    if (input.subjectId !== undefined || input.courseId !== undefined) {
      await this.assertRelationsExist(input.subjectId ?? null, input.courseId ?? null);
    }
    if (input.slug !== undefined) await this.assertSlugFree(input.slug, id);
    if (input.courseId !== undefined) await this.assertCourseFree(input.courseId, id);

    /* The row as it WILL BE, not as it was sent — `courseId` may be absent from
       this patch entirely, in which case the stored link is what decides
       whether `showOnCourse` still has anywhere to render. */
    const courseIdAfter = input.courseId !== undefined ? input.courseId : existing.courseId;
    const data = withPlacementNormalised(input, courseIdAfter);

    await this.prisma.book.update({ where: { id }, data });

    await this.audit.record({
      action: 'book:update',
      resourceType: AUDIT_RESOURCES.book,
      resourceId: id,
      outcome: 'success',
      /* The FIELD NAMES, never the values. A price change is worth knowing
         about; a description's full text in an audit row is noise that also
         makes the table grow with the content. Read off `data` rather than
         `input` so a `showOnCourse` the service cleared by itself shows up as
         something this write touched — the audit is a record of the UPDATE. */
      metadata: { adminId, fields: Object.keys(data) },
    });

    return this.adminOne(id);
  }

  /**
   * Deleting a book does NOT delete the orders that bought it —
   * `book_order_items.book_id` is `ON DELETE SET NULL` and the line keeps its
   * own `title_ar` and `unit_price_cents`. So this is safe in a way "delete a
   * product" usually is not, and the admin screen still leads with «اخفيه»
   * (`isActive: false`), because a title that comes back next term should not
   * have to be retyped.
   */
  async remove(adminId: string, id: string): Promise<void> {
    const existing = await this.prisma.book.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) throw new NotFoundException();

    await this.prisma.book.delete({ where: { id } });

    await this.audit.record({
      action: 'book:delete',
      resourceType: AUDIT_RESOURCES.book,
      resourceId: id,
      outcome: 'success',
      metadata: { adminId, slug: existing.slug },
    });
  }

  /**
   * One row in the admin's own shape — what every mutation above returns.
   *
   * Re-reads the WHOLE list and picks the row out of it, which is two queries
   * to return one record and is deliberate: `AdminBookRow` carries
   * `orderedCount`, a grouped aggregate over `book_order_items`, so a
   * single-row version would need its own query and its own mapper — a second
   * shape that drifts from `adminList`'s the first time a column is added. The
   * cost is bounded by a catalogue small enough not to paginate (see
   * `adminList`), and it is paid on a write, not on a read.
   */
  private async adminOne(id: string): Promise<AdminBookRow> {
    const rows = await this.adminList();
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) throw new NotFoundException();
    return row;
  }

  private async assertSlugFree(slug: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.book.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException('في كتاب تاني بنفس الرابط');
  }

  private async assertCourseFree(courseId: string | null, exceptId: string | null): Promise<void> {
    if (courseId === null) return;
    const clash = await this.prisma.book.findFirst({
      where: { courseId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException('الكورس ده مربوط بكتاب تاني بالفعل');
  }

  /**
   * A subject or course id that names nothing would otherwise surface as a raw
   * foreign-key violation — a 500 with a constraint name in it. Same check
   * `BookOrdersService.create` runs on `governorateCode`, for the same reason.
   */
  private async assertRelationsExist(
    subjectId: string | null,
    courseId: string | null,
  ): Promise<void> {
    if (subjectId !== null) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true },
      });
      if (!subject) throw new NotFoundException('المادة دي مش موجودة');
    }
    if (courseId !== null) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });
      if (!course) throw new NotFoundException('الكورس ده مش موجود');
    }
  }
}
