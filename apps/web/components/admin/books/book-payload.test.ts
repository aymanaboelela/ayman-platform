import { describe, expect, it } from 'vitest';
import { AdminBookCreateSchema } from '@ayman/contracts/admin/books';
import { bookFormPayload, bookPlacementLabels, type BookFormValues } from './book-payload';

/**
 * The two rules in the add-book form that are not "render a field".
 *
 * Both used to be enforced only by the database — one by a CHECK that answers
 * 400 with no field to blame, one by a service that silently rewrites what it
 * was sent — and both are the kind of thing a green screenshot cannot prove.
 */

const values = (patch: Partial<BookFormValues> = {}): BookFormValues => ({
  slug: 'math-1',
  titleAr: 'كتاب الرياضيات',
  subtitleAr: '',
  subjectId: '',
  year: '2',
  term: 'full',
  courseId: '',
  stream: 'both',
  showOnLanding: true,
  showOnCourse: true,
  price: '250',
  comparePrice: '',
  unitCost: '',
  coverKey: null,
  descriptionAr: '',
  pageCount: '',
  stock: '',
  sortOrder: '0',
  isActive: true,
  ...patch,
});

const COURSE = '11111111-1111-4111-8111-111111111111';

describe('bookFormPayload — المدارس', () => {
  it('expands ONE radio into the boolean PAIR the column stores', () => {
    expect(bookFormPayload(values({ stream: 'general' }))).toMatchObject({
      forGeneral: true,
      forLanguages: false,
    });
    expect(bookFormPayload(values({ stream: 'languages' }))).toMatchObject({
      forGeneral: false,
      forLanguages: true,
    });
    expect(bookFormPayload(values({ stream: 'both' }))).toMatchObject({
      forGeneral: true,
      forLanguages: true,
    });
  });

  it('never produces the pair `books_serves_a_stream` rejects', () => {
    for (const stream of ['general', 'languages', 'both'] as const) {
      const payload = bookFormPayload(values({ stream }));
      expect(payload?.forGeneral || payload?.forLanguages).toBe(true);
    }
  });
});

describe('bookFormPayload — يظهر فين', () => {
  it('cannot send showOnCourse when no course is linked', () => {
    // The checkbox is disabled on screen; this is the same answer said where a
    // stale draft (a course picked, then unpicked) can also reach it.
    const payload = bookFormPayload(values({ courseId: '', showOnCourse: true }));
    expect(payload?.courseId).toBeNull();
    expect(payload?.showOnCourse).toBe(false);
  });

  it('keeps showOnCourse once a course IS linked', () => {
    const payload = bookFormPayload(values({ courseId: COURSE, showOnCourse: true }));
    expect(payload).toMatchObject({ courseId: COURSE, showOnCourse: true });
  });

  it('leaves showOnLanding alone — the two placements are independent', () => {
    const payload = bookFormPayload(values({ showOnLanding: false, courseId: COURSE }));
    expect(payload).toMatchObject({ showOnLanding: false, showOnCourse: true });
  });

  it('produces a payload the create schema accepts', () => {
    const payload = bookFormPayload(values({ stream: 'languages', courseId: COURSE }));
    expect(AdminBookCreateSchema.safeParse(payload).success).toBe(true);
  });
});

describe('bookFormPayload — money', () => {
  it('refuses a price that is not a number, rather than sending zero', () => {
    expect(bookFormPayload(values({ price: '' }))).toBeNull();
    expect(bookFormPayload(values({ price: 'مية' }))).toBeNull();
  });

  it('stores POUNDS as piastres, rounded — never a binary fraction', () => {
    expect(bookFormPayload(values({ price: '250.5' }))?.priceCents).toBe(25050);
  });

  it('keeps «مش معروف» as null — a 0 cost reports the cover price as profit', () => {
    expect(bookFormPayload(values({ unitCost: '' }))?.unitCostCents).toBeNull();
    expect(bookFormPayload(values({ unitCost: '0' }))?.unitCostCents).toBe(0);
  });
});

describe('bookPlacementLabels', () => {
  it('says «قسم الكتب بس» rather than printing an empty cell', () => {
    expect(
      bookPlacementLabels({ showOnLanding: false, showOnCourse: false, courseId: null }),
    ).toHaveLength(1);
  });

  it('ignores a showOnCourse left true on a book whose course was unlinked', () => {
    const labels = bookPlacementLabels({
      showOnLanding: true,
      showOnCourse: true,
      courseId: null,
    });
    expect(labels).toHaveLength(1);
  });

  it('names both places when both are set', () => {
    expect(
      bookPlacementLabels({ showOnLanding: true, showOnCourse: true, courseId: COURSE }),
    ).toHaveLength(2);
  });
});
