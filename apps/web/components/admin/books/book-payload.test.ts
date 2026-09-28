import { describe, expect, it } from 'vitest';
import { AdminBookCreateSchema, BookSlugSchema } from '@ayman/contracts/admin/books';
import {
  bookFormPayload,
  bookPlacementLabels,
  courseChoices,
  slugFromTitle,
  type BookFormValues,
  type CourseOption,
} from './book-payload';

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

describe('bookFormPayload — الترم', () => {
  it('sends the term the picker holds — «الترم الأول» is `first`, not the `full` default', () => {
    // The production fix for the two year-1 books is exactly this field, so
    // the value has to survive the trip from the form to the PATCH unchanged.
    expect(bookFormPayload(values({ term: 'first' }))?.term).toBe('first');
    expect(bookFormPayload(values({ term: 'second' }))?.term).toBe('second');
    expect(bookFormPayload(values({ term: 'full' }))?.term).toBe('full');
  });
});

describe('slugFromTitle', () => {
  it('turns an Arabic title into a hyphenated handle the slug schema accepts', () => {
    const slug = slugFromTitle('كتاب أولى بكالوريا برمجة عربي');
    expect(slug).toBe('كتاب-أولى-بكالوريا-برمجة-عربي');
    expect(BookSlugSchema.safeParse(slug).success).toBe(true);
  });

  it('drops the characters that would turn a shared link into a different URL', () => {
    // `/` and `.` are what the schema forbids; `#`, `?` and `%` are legal there
    // and still break a pasted `/books#book-…` link.
    expect(slugFromTitle(' كتاب 2.0 / مراجعة #1? 50% ')).toBe('كتاب-2-0-مراجعة-1-50');
  });

  it('lower-cases Latin and never ends on a hyphen after the length cap', () => {
    expect(slugFromTitle('Python Basics')).toBe('python-basics');
    const long = slugFromTitle(`${'ا'.repeat(79)} ب`);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('courseChoices', () => {
  const course = (patch: Partial<CourseOption> & { id: string }): CourseOption => ({
    title: 'البرمجة',
    year: 1,
    forGeneral: true,
    forLanguages: false,
    status: 'published',
    ...patch,
  });
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const DRAFT = '33333333-3333-4333-8333-333333333333';

  it('greys out a course another book holds, and names that book', () => {
    const [choice] = courseChoices([course({ id: COURSE })], null, {
      [COURSE]: 'كتاب الترم الأول',
    });
    expect(choice?.disabled).toBe(true);
    expect(choice?.label).toContain('كتاب الترم الأول');
  });

  it('keeps THIS book’s own course pickable — it is not «taken» by itself', () => {
    const [choice] = courseChoices([course({ id: COURSE })], COURSE, {
      [COURSE]: 'الكتاب ده نفسه',
    });
    expect(choice?.disabled).toBe(false);
    expect(choice?.label).not.toContain('الكتاب ده نفسه');
  });

  it('offers published courses only — plus the draft this book is already linked to', () => {
    const courses = [course({ id: OTHER }), course({ id: DRAFT, status: 'draft' })];
    expect(courseChoices(courses, null, {}).map((choice) => choice.id)).toEqual([OTHER]);
    // Without the linked draft in the list the `<select>` would show «من غير
    // كورس» over a link that exists.
    expect(courseChoices(courses, DRAFT, {}).map((choice) => choice.id)).toEqual([OTHER, DRAFT]);
  });

  it('passes a status-less list (the course editor’s locked form) straight through', () => {
    const { status: _status, ...bare } = course({ id: OTHER });
    expect(courseChoices([bare], null, {})).toHaveLength(1);
  });
});
