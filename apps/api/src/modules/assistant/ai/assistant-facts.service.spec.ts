import { AssistantFactsService, type AssistantFacts } from './assistant-facts.service';
import { matchKnowledge, priceEntries, pricingBlock } from './assistant-knowledge';

/**
 * The money rules, asserted as EFFECTS rather than as mechanisms.
 *
 * The one that matters most is the negative: when the figures cannot be read,
 * nothing anywhere in this pair can produce a number. That is tested by asking
 * for the number after a successful read has already happened — the only
 * arrangement in which a remembered figure is even reachable — and then
 * scanning the output for a digit.
 */

const BOOK = {
  titleAr: 'كتاب الحاسب أولى ثانوي',
  priceCents: 25_000,
  comparePriceCents: null as number | null,
  stock: null as number | null,
  course: { title: 'الحاسب الآلي — أولى ثانوي' } as { title: string } | null,
};

const COURSE = {
  title: 'الحاسب الآلي — أولى ثانوي',
  slug: 'cs-1',
  requiresGrant: true,
  monthlyPriceCents: 15_000,
  quarterlyPriceCents: 40_000,
  yearlyPriceCents: null as number | null,
};

function make(
  over: {
    books?: (typeof BOOK)[];
    courses?: (typeof COURSE)[];
    shipping?: number;
    /** Set to make the NEXT read of that source fail. */
    fail?: 'books' | 'courses' | 'shipping';
  } = {},
) {
  const findBooks = jest.fn(async () => {
    if (over.fail === 'books') throw new Error('db down');
    return over.books ?? [BOOK];
  });
  const findCourses = jest.fn(async () => {
    if (over.fail === 'courses') throw new Error('db down');
    return over.courses ?? [COURSE];
  });
  const shippingCents = jest.fn(async () => {
    if (over.fail === 'shipping') throw new Error('settings missing');
    return over.shipping ?? 6_500;
  });

  const prisma = { book: { findMany: findBooks }, course: { findMany: findCourses } };
  const service = new AssistantFactsService(prisma as never, { shippingCents } as never);
  return { service, findBooks, findCourses, shippingCents, over };
}

/** Any Western digit anywhere — the shape a quoted price has to take. */
const hasNumber = (text: string): boolean => /\d/.test(text);

describe('AssistantFactsService — reading the numbers', () => {
  it('reads active books, published courses, and the delivery fee', async () => {
    const { service, findBooks, findCourses } = make();
    const facts = await service.read();

    expect(facts).not.toBeNull();
    expect(facts!.books).toEqual([
      {
        titleAr: BOOK.titleAr,
        priceCents: 25_000,
        comparePriceCents: null,
        courseTitle: COURSE.title,
        inStock: true,
      },
    ]);
    expect(facts!.courses[0]!.monthlyPriceCents).toBe(15_000);
    expect(facts!.shippingCents).toBe(6_500);

    expect(findBooks.mock.calls[0]![0]).toMatchObject({ where: { isActive: true } });
    expect(findCourses.mock.calls[0]![0]).toMatchObject({ where: { status: 'published' } });
  });

  /*
   * `courses.price_cents` is documented as "always 0 and NOTHING reads it".
   * Selecting it is how المساعد ends up announcing that every course is free.
   */
  it('never selects the reserved courses.price_cents column', async () => {
    const { service, findCourses } = make();
    await service.read();
    const select = findCourses.mock.calls[0]![0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty('priceCents');
    expect(select).toMatchObject({ requiresGrant: true, monthlyPriceCents: true });
  });

  /* `null` stock is «مش بنعد», only a hard zero is out of stock. */
  it('treats null stock as available and 0 as sold out', async () => {
    const { service } = make({
      books: [
        { ...BOOK, stock: null },
        { ...BOOK, titleAr: 'كتاب تاني', stock: 0 },
      ],
    });
    const facts = await service.read();
    expect(facts!.books.map((book) => book.inStock)).toEqual([true, false]);
  });

  it('reuses one snapshot instead of re-querying per question', async () => {
    const { service, findBooks } = make();
    await Promise.all([service.read(), service.read(), service.read()]);
    await service.read();
    expect(findBooks).toHaveBeenCalledTimes(1);
  });
});

describe('when the numbers cannot be read — the path that must not guess', () => {
  it.each(['books', 'courses', 'shipping'] as const)(
    'returns null when the %s read fails',
    async (source) => {
      const { service } = make({ fail: source });
      await expect(service.read()).resolves.toBeNull();
    },
  );

  /*
   * ⚠️ THE TEST THIS FILE EXISTS FOR.
   *
   * A snapshot is read successfully, so a remembered figure is now sitting in
   * the process. It expires, the refresh fails, and the question is asked
   * again. Nothing may come back but `null` — a price from a minute ago,
   * stated as current, is the one wrong answer that costs somebody money.
   */
  it('DROPS a good snapshot rather than serve it when the refresh fails', async () => {
    const failing = { current: false };
    const findMany = jest.fn(async () => {
      if (failing.current) throw new Error('db down');
      return [BOOK];
    });
    const service = new AssistantFactsService(
      { book: { findMany }, course: { findMany: async () => [COURSE] } } as never,
      { shippingCents: async () => 6_500 } as never,
    );

    const first = await service.read();
    expect(first!.books[0]!.priceCents).toBe(25_000);

    // Age the snapshot past its TTL without waiting a real minute.
    const later = Date.now() + 120_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    failing.current = true;

    await expect(service.read()).resolves.toBeNull();
    // And it stays null — there is no second chance at the old object.
    await expect(service.read()).resolves.toBeNull();
    jest.restoreAllMocks();
  });

  it('tells the model it knows no price, and offers none to remember', () => {
    const block = pricingBlock(null);
    expect(hasNumber(block)).toBe(false);
    expect(block).toContain('know NO price');
    expect(block).toMatch(/escalation marker/);
  });

  /*
   * The no-model path, which returns an entry's answer VERBATIM to the
   * student. With no facts, «الكورس بكام؟» falls back to the written
   * `joinPrice` paragraph — which names no number and points at أيمن.
   */
  it('falls back to «الأسعار بتتغيّر» rather than a number, with no facts', () => {
    const match = matchKnowledge('الكورس بكام؟', null);
    expect(match?.id).toBe('joinPrice');
    expect(hasNumber(match!.answer)).toBe(false);
  });
});

describe('rendering — what a student actually reads', () => {
  const facts = (over: Partial<AssistantFacts> = {}): AssistantFacts => ({
    books: [
      {
        titleAr: 'كتاب الحاسب',
        priceCents: 25_000,
        comparePriceCents: 30_000,
        courseTitle: 'الحاسب الآلي',
        inStock: true,
      },
    ],
    courses: [
      {
        title: 'الحاسب الآلي',
        slug: 'cs-1',
        requiresGrant: true,
        monthlyPriceCents: 15_000,
        quarterlyPriceCents: 40_000,
        yearlyPriceCents: null,
      },
    ],
    shippingCents: 6_500,
    at: Date.now(),
    ...over,
  });

  it('states whole pounds in Western digits, and the discount beside the price', () => {
    const [books] = priceEntries(facts());
    expect(books!.answer).toContain('250 جنيه بدل 300 جنيه');
    expect(books!.answer).toContain('كتاب الحاسب');
  });

  it('says the delivery fee is charged once per order', () => {
    const [, , ship] = priceEntries(facts());
    expect(ship!.answer).toContain('65 جنيه');
    expect(ship!.answer).toContain('مش على كل كتاب');
  });

  /* «0 جنيه» reads as a number that failed to load. Zero gets a word. */
  it('says free delivery in words rather than as a zero', () => {
    const [, , ship] = priceEntries(facts({ shippingCents: 0 }));
    expect(ship!.answer).toContain('مجاني');
    expect(hasNumber(ship!.answer)).toBe(false);
  });

  it('lists only the plans that are on sale', () => {
    const [, courses] = priceEntries(facts());
    expect(courses!.answer).toContain('شهري 150 جنيه');
    expect(courses!.answer).toContain('كل 3 شهور 400 جنيه');
    expect(courses!.answer).not.toContain('سنة كاملة');
  });

  /*
   * `requiresGrant: false` means the platform-wide free grant opens the
   * course. Reading the price columns first is how an open course gets quoted
   * a monthly fee nobody is charged.
   */
  it('calls an open course open, whatever is in its price columns', () => {
    const [, courses] = priceEntries(
      facts({
        courses: [
          {
            title: 'كورس مفتوح',
            slug: 'free-1',
            requiresGrant: false,
            monthlyPriceCents: 15_000,
            quarterlyPriceCents: null,
            yearlyPriceCents: null,
          },
        ],
      }),
    );
    expect(courses!.answer).toContain('مفتوح من غير اشتراك');
    expect(courses!.answer).not.toContain('150');
  });

  /* Purchasable, but no plan priced — أيمن settles it. Not silence, not free. */
  it('sends a priced-but-unlisted course to أيمن instead of guessing', () => {
    const [, courses] = priceEntries(
      facts({
        courses: [
          {
            title: 'كورس',
            slug: 'x',
            requiresGrant: true,
            monthlyPriceCents: null,
            quarterlyPriceCents: null,
            yearlyPriceCents: null,
          },
        ],
      }),
    );
    expect(courses!.answer).toContain('أيمن');
    expect(hasNumber(courses!.answer)).toBe(false);
  });

  it('tells the model these figures override the «الأسعار بتتغيّر» entry', () => {
    const block = pricingBlock(facts());
    expect(block).toContain('OVERRIDE');
    expect(block).toContain('250 جنيه');
  });

  /*
   * The no-model path with a snapshot: «الكتاب بكام؟» must reach the live
   * entry, not the written paragraph that declines to name a number.
   */
  it('answers «الكتاب بكام؟» from the live shelf when facts are present', () => {
    const match = matchKnowledge('الكتاب بكام؟', facts());
    expect(match?.id).toBe('livePriceBooks');
    expect(match!.answer).toContain('250 جنيه');
  });

  it('answers «الاشتراك بكام؟» with the current plans', () => {
    const match = matchKnowledge('الاشتراك في الكورس بكام؟', facts());
    expect(match?.id).toBe('livePriceCourses');
    expect(match!.answer).toContain('150 جنيه');
  });

  /* The written entries must still be reachable — nothing was crowded out. */
  it('leaves the rest of the corpus alone', () => {
    expect(matchKnowledge('نسيت كلمة السر اعمل ايه', facts())?.id).toBe('accountPassword');
    expect(matchKnowledge('عايز أروح المريخ', facts())).toBeNull();
  });
});
