// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { BooksService } from './books.service';

const SHIPPING_CENTS = 6_500;

describe('BooksService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const audit = new AuditService(prisma);
  const settings = {
    read: async () => ({ store: { shippingCents: SHIPPING_CENTS } }),
  } as unknown as SettingsService;
  const service = new BooksService(prisma, audit, settings);

  let adminId = '';
  let subjectId = '';
  let subjectNameAr = '';
  /** A course of this spec's OWN, because `books.course_id` is UNIQUE: borrowing
   *  a course out of the shared dev catalogue would fail `assertCourseFree` the
   *  moment a real book already claimed it. */
  let courseId = '';
  const created: string[] = [];
  const stamp = Date.now();

  /** Every book this spec makes carries the stamp, so the assertions can filter
   *  the shared dev catalogue down to its own rows. */
  const mine = <T extends { slug: string }>(rows: readonly T[]): T[] =>
    rows.filter((row) => row.slug.includes(String(stamp)));

  const track = async (data: Parameters<typeof prisma.book.create>[0]['data']) => {
    const book = await prisma.book.create({ data });
    created.push(book.id);
    return book.id;
  };

  beforeAll(async () => {
    await prisma.$connect();
    adminId = (
      await prisma.user.create({
        data: { id: `books-admin-${stamp}`, name: 'أدمن', email: `books-admin-${stamp}@t.test`, role: 'admin' },
      })
    ).id;
    const subject = await prisma.subject.findFirstOrThrow();
    subjectId = subject.id;
    subjectNameAr = subject.nameAr;
    const system = await prisma.educationSystem.findFirstOrThrow();
    courseId = (
      await prisma.course.create({
        data: {
          slug: `books-course-${stamp}`,
          title: 'كورس بتاع الاختبار',
          systemId: system.id,
          subjectId,
          year: 1,
          instructorId: adminId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.book.deleteMany({ where: { id: { in: created } } });
    /* Books first, then the course, then the user: `courses.instructor_id` is
       `Restrict`, so the admin cannot go while a course still points at them. */
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  describe('catalog', () => {
    it('groups a subject’s books by term and reports the delivery fee', async () => {
      await track({
        slug: `cat-first-${stamp}`,
        titleAr: 'كتاب ترم أول',
        subjectId,
        year: 1,
        term: 'first',
        priceCents: 25_000,
      });
      await track({
        slug: `cat-second-${stamp}`,
        titleAr: 'كتاب ترم تاني',
        subjectId,
        year: 1,
        term: 'second',
        priceCents: 18_000,
      });

      const catalog = await service.catalog();
      const shelf = catalog.shelves.find((entry) => entry.subjectId === subjectId);

      expect(shelf).toBeDefined();
      expect(mine(shelf!.first)).toHaveLength(1);
      expect(mine(shelf!.second)).toHaveLength(1);
      expect(shelf!.subjectNameAr).toBe(subjectNameAr);
      expect(catalog.shippingCents).toBe(SHIPPING_CENTS);
    });

    /*
     * «لو المادة مفيش ليها كتاب مش هضيفه». The shape of `catalog()` is what
     * guarantees this — shelves are built FROM the books, so an empty one is
     * not constructible — and this is the assertion that would fail the day
     * someone rewrites it to iterate subjects instead.
     */
    it('never lists a subject that has no books', async () => {
      const empty = await prisma.subject.create({
        data: { slug: `books-empty-subject-${stamp}`, nameAr: 'مادة من غير كتب' },
      });
      try {
        const catalog = await service.catalog();
        expect(catalog.shelves.some((shelf) => shelf.subjectId === empty.id)).toBe(false);
      } finally {
        await prisma.subject.delete({ where: { id: empty.id } });
      }
    });

    it('hides a deactivated book without hiding the shelf it was on', async () => {
      const id = await track({
        slug: `cat-hidden-${stamp}`,
        titleAr: 'كتاب مخفي',
        subjectId,
        term: 'full',
        priceCents: 12_000,
        isActive: false,
      });

      const catalog = await service.catalog();
      const shelf = catalog.shelves.find((entry) => entry.subjectId === subjectId);

      expect(shelf!.full.some((book) => book.id === id)).toBe(false);
    });

    /* A book with no subject is a real product — a revision booklet spanning
       three of them. Dropping it would silently hide stock. */
    it('files a subject-less book under its own shelf, last', async () => {
      await track({
        slug: `cat-general-${stamp}`,
        titleAr: 'ملزمة مراجعة عامة',
        term: 'full',
        priceCents: 9_000,
      });

      const catalog = await service.catalog();
      const general = catalog.shelves.find((shelf) => shelf.subjectId === null);

      expect(general).toBeDefined();
      expect(catalog.shelves.at(-1)).toBe(general);
    });

    it('marks a zero-stock book out of stock, and an uncounted one in stock', async () => {
      const soldOut = await track({
        slug: `cat-sold-out-${stamp}`,
        titleAr: 'كتاب خلص',
        subjectId,
        term: 'full',
        priceCents: 10_000,
        stock: 0,
      });
      const uncounted = await track({
        slug: `cat-uncounted-${stamp}`,
        titleAr: 'كتاب مش بنعده',
        subjectId,
        term: 'full',
        priceCents: 10_000,
        stock: null,
      });

      const catalog = await service.catalog();
      const shelf = catalog.shelves.find((entry) => entry.subjectId === subjectId);

      // Both still RENDER — a card that vanishes reads as a broken page.
      expect(shelf!.full.find((book) => book.id === soldOut)?.inStock).toBe(false);
      expect(shelf!.full.find((book) => book.id === uncounted)?.inStock).toBe(true);
    });

    /*
     * ⚠️ The one thing `show_on_landing` must NOT do. It is placement, not
     * permission: `<BooksStrip>` and `/books` read the same cached payload, so
     * the shop returns every active book and the strip filters this field
     * client-side. Filtering here would empty the shop of every title the admin
     * only meant to keep off the front door — and it would do it quietly, since
     * the card would simply not be in the list to notice.
     */
    it('still sells a book that is kept off the landing strip', async () => {
      const id = await track({
        slug: `cat-off-landing-${stamp}`,
        titleAr: 'كتاب مش على الصفحة الرئيسية',
        subjectId,
        term: 'full',
        priceCents: 14_000,
        showOnLanding: false,
      });

      const catalog = await service.catalog();
      const shelf = catalog.shelves.find((entry) => entry.subjectId === subjectId);
      const card = shelf!.full.find((book) => book.id === id);

      expect(card).toBeDefined();
      // …and the strip is told, on the card, that this one is not for it.
      expect(card!.showOnLanding).toBe(false);
    });

    /* «بشوف في الكتب الناس اللي طالبة ما بيبقاش مكتوب ده عام ولا لغات» — the
       pair has to survive all four places between the column and `BookCard`,
       and there is no shared mapper to catch a missed one. */
    it('carries عام / لغات through to the card', async () => {
      const id = await track({
        slug: `cat-languages-${stamp}`,
        titleAr: 'كتاب لغات',
        subjectId,
        term: 'full',
        priceCents: 30_000,
        forGeneral: false,
        forLanguages: true,
      });

      const catalog = await service.catalog();
      const shelf = catalog.shelves.find((entry) => entry.subjectId === subjectId);
      const card = shelf!.full.find((book) => book.id === id);

      expect(card!.forGeneral).toBe(false);
      expect(card!.forLanguages).toBe(true);
    });
  });

  describe('admin CRUD', () => {
    const input = (overrides: Record<string, unknown> = {}) => ({
      slug: `admin-book-${stamp}-${randomUUID().slice(0, 8)}`,
      titleAr: 'كتاب جديد',
      subtitleAr: null,
      subjectId,
      year: 2 as const,
      term: 'first' as const,
      courseId: null,
      forGeneral: true,
      forLanguages: true,
      showOnLanding: true,
      showOnCourse: true,
      priceCents: 25_000,
      comparePriceCents: null,
      coverKey: null,
      descriptionAr: null,
      pageCount: null,
      isActive: true,
      stock: null,
      sortOrder: 0,
      ...overrides,
    });

    it('creates a book and returns it in the admin list', async () => {
      const book = await service.create(adminId, input());
      created.push(book.id);

      expect(book.titleAr).toBe('كتاب جديد');
      expect(book.subjectNameAr).toBe(subjectNameAr);
      expect(book.orderedCount).toBe(0);
    });

    it('refuses a duplicate slug with a message about the slug', async () => {
      const slug = `admin-dup-${stamp}`;
      const first = await service.create(adminId, input({ slug }));
      created.push(first.id);

      await expect(service.create(adminId, input({ slug }))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404s a subjectId that names nothing, instead of a foreign-key 500', async () => {
      await expect(
        service.create(adminId, input({ subjectId: randomUUID() })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    /*
     * The case the contract's own refinement cannot see: dropping the price
     * below an existing "before" price without mentioning that column. Without
     * this check the database rejects it as a 500 the admin cannot act on.
     */
    it('refuses a price drop that would leave a fake discount standing', async () => {
      const book = await service.create(
        adminId,
        input({ priceCents: 20_000, comparePriceCents: 25_000 }),
      );
      created.push(book.id);

      await expect(
        service.patch(adminId, book.id, { priceCents: 30_000 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('patches only what it was sent — a rename keeps the price and the flags', async () => {
      const book = await service.create(adminId, input({ priceCents: 25_000, isActive: true }));
      created.push(book.id);

      const patched = await service.patch(adminId, book.id, { titleAr: 'اسم جديد' });

      expect(patched.titleAr).toBe('اسم جديد');
      expect(patched.priceCents).toBe(25_000);
      expect(patched.isActive).toBe(true);
      expect(patched.sortOrder).toBe(0);
    });

    /* Four columns, four places each (select → row type → mapper → schema) and
       no shared mapper to keep them in step. This is the assertion that fails
       when one of the four is missed. */
    it('round-trips the stream and the placement flags through create and patch', async () => {
      const book = await service.create(
        adminId,
        input({ forGeneral: false, forLanguages: true, showOnLanding: false }),
      );
      created.push(book.id);

      expect(book.forGeneral).toBe(false);
      expect(book.forLanguages).toBe(true);
      expect(book.showOnLanding).toBe(false);
      /* `showOnCourse` is the one field that is not a straight round trip — it
         depends on `courseId`, and the two tests below own it. */

      const patched = await service.patch(adminId, book.id, {
        forGeneral: true,
        forLanguages: false,
        showOnLanding: true,
      });

      expect(patched.forGeneral).toBe(true);
      expect(patched.forLanguages).toBe(false);
      expect(patched.showOnLanding).toBe(true);
    });

    /*
     * ⚠️ The EFFECT the migration deliberately did not make a CHECK: a
     * `show_on_course` with no course to render on. The PATCH is partial, so a
     * constraint spanning the two columns would turn «شيلت الكتاب من الكورس»
     * into a 500; the service is the only thing enforcing it, and this is the
     * test that says so. Asserted by reading the flag back — not by reaching
     * for the branch that clears it.
     */
    it('clears «اعرضه في الكورس» when the course link goes', async () => {
      const book = await service.create(adminId, input({ courseId, showOnCourse: true }));
      created.push(book.id);
      expect(book.showOnCourse).toBe(true);

      // Only the link is sent. The flag is not mentioned, and still comes back off.
      const unlinked = await service.patch(adminId, book.id, { courseId: null });

      expect(unlinked.courseId).toBeNull();
      expect(unlinked.showOnCourse).toBe(false);
    });

    /* The other direction: clearing is the only thing the normaliser does. A
       book that regains a course may be advertised on it again — and saying so
       in the same PATCH has to survive, or re-linking would be a dead end. */
    it('lets a re-linked book be advertised on its course again', async () => {
      const book = await service.create(adminId, input({ courseId: null }));
      created.push(book.id);
      // No course on create ⇒ the flag never got to be true in the first place.
      expect(book.showOnCourse).toBe(false);

      const relinked = await service.patch(adminId, book.id, { courseId, showOnCourse: true });

      expect(relinked.courseId).toBe(courseId);
      expect(relinked.showOnCourse).toBe(true);
    });

    it('deletes a book', async () => {
      const book = await service.create(adminId, input());
      await service.remove(adminId, book.id);

      expect(await prisma.book.findUnique({ where: { id: book.id } })).toBeNull();
    });

    it('404s deleting a book that is already gone', async () => {
      await expect(service.remove(adminId, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
