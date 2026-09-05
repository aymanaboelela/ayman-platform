import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BooksService } from '../../books/books.service';

/**
 * The numbers المساعد was never allowed to say, read at the moment it is asked.
 *
 * ## Why this is a service and not a table of constants
 *
 * `assistant-knowledge.ts` excludes prices from the written corpus, and its
 * reasoning is right and worth keeping intact: «الأسعار بتتغيّر من فترة
 * للتانية» — they change in an admin form, not in a deploy, so a number typed
 * into a prompt is a number that goes wrong silently, on the one subject where
 * being wrong costs somebody money. That argument is not overruled here. It is
 * SATISFIED: nothing about a price is written down in this repo, and every
 * figure المساعد states was on a Postgres row seconds earlier.
 *
 * ## How long a number can be wrong for: SIXTY SECONDS, and no longer
 *
 * A snapshot is reused for `FACTS_TTL_MS` and then re-read. So the worst case
 * is: an admin lowers a book to 200 EGP, and for up to one minute afterwards a
 * student who asks «الكتاب بكام؟» is told 250.
 *
 * That window is acceptable because it is the SHORTEST cache on this number
 * anywhere in the product, not the longest. `/books` is `'use cache'` with
 * `cacheLife('minutes')` behind `TAG_BOOKS`, and the course page's «اطلب
 * الكتاب» summary reads the same cached payload — so during that same minute
 * the SHOP ITSELF can still be printing the old price on a card. An assistant
 * that quoted a fresher number than the page the student is looking at would
 * be a second source of truth disagreeing with the first, which is worse than
 * being one minute behind alongside it.
 *
 * The alternative, reading on every question, is thirty queries a minute from
 * one classroom for a row nobody has touched since March — the same argument
 * `AssistantAiService.courses()` makes for the catalogue, at a twelfth of the
 * window because this one is about money.
 *
 * ## A stale number is not a fallback. There IS no fallback.
 *
 * ⚠️ This is the one place where this service deliberately behaves WORSE than
 * the catalogue snapshot beside it. When the catalogue read fails,
 * `AssistantAiService.courses()` serves the previous list and says so: a stale
 * course title is context, and no context is worse than old context.
 *
 * A stale PRICE is not context. It is an offer, quoted to a teenager who may
 * act on it, by something that sounds like the platform speaking. So when the
 * read fails, `read()` returns `null` and the snapshot is DROPPED — there is
 * no expression anywhere in this class that can hand a caller a figure older
 * than the TTL, and `pricingBlock(null)` turns that into an instruction to
 * state no number at all and escalate. «مش شايف الرقم دلوقتي» is an answer.
 * A price from ten minutes ago, said confidently, is not.
 */

/**
 * How long one snapshot serves before it is read again.
 *
 * Sixty seconds — the whole argument is in the class docblock above. Changing
 * it changes how long a student can be quoted a price that no longer exists,
 * so it is a number to move deliberately or not at all.
 */
const FACTS_TTL_MS = 60_000;

/** One title on the shelf, as المساعد is allowed to describe it. */
export interface BookFact {
  readonly titleAr: string;
  /** Piastres, straight off the row. Never rounded here — see `egp()`. */
  readonly priceCents: number;
  /** The struck-through "before" price, when the title is discounted. */
  readonly comparePriceCents: number | null;
  /**
   * The course this is the printed textbook FOR, or `null` for a standalone
   * title. The instructor asked specifically for «whether it is linked to a
   * course» because it is the difference between «الكتاب بتاع الكورس» and «كتاب
   * مراجعة لوحده», and a student ordering the wrong one finds out by post.
   */
  readonly courseTitle: string | null;
  /**
   * `stock !== 0`, mirroring `BooksService.toCard` exactly rather than
   * re-deciding it: `null` stock is «مش بنعد» and is the normal case, and only
   * a hard zero is out of stock. Two places deciding this differently would be
   * المساعد offering a book the shop refuses to sell.
   */
  readonly inStock: boolean;
}

/** One published course, and what it costs to get into it. */
export interface CourseFact {
  readonly title: string;
  readonly slug: string;
  /**
   * Whether the course needs a grant of its OWN — which is the only thing on
   * this model that says whether it is bought at all.
   *
   * `false` means the platform-wide free grant opens it: the honest answer to
   * «الكورس بكام؟» is «مفتوح من غير اشتراك», regardless of what the price
   * columns happen to hold. `true` means only a `course`/`subject_teacher`
   * grant does, i.e. somebody pays.
   */
  readonly requiresGrant: boolean;
  /** `null` = this plan is not on sale on this course. All three independent. */
  readonly monthlyPriceCents: number | null;
  readonly quarterlyPriceCents: number | null;
  readonly yearlyPriceCents: number | null;
  /*
   * ⚠️ `bookTitle`/`bookPriceCents` ARE DELIBERATELY ABSENT, and re-adding
   * them would put a sentence in quotation marks and charge money for it.
   *
   * The column is named for a title and production does not hold one. Both
   * rows that have it read «حجز الكتاب هيتبعتلك لحد البيت» — CTA copy for the
   * button on the course page, written by whoever filled the field in, and
   * true of nothing else. Rendered through `courseLine` it came out as
   * «ومعاه كتاب ورقي «حجز الكتاب هيتبعتلك لحد البيت» بـ250 جنيه»: a book
   * announced by name, with a price on it, that nobody can order because it
   * does not exist.
   *
   * The real shelf is the `books` table — `BookFact` above, with a `titleAr`
   * that IS a title and a `courseTitle` saying which course it belongs to —
   * so nothing is lost by leaving this pair out, and «الكتاب بكام؟» is
   * answered from the rows the shop actually sells.
   */
}

/** Everything money-shaped, as of one instant. */
export interface AssistantFacts {
  readonly books: readonly BookFact[];
  readonly courses: readonly CourseFact[];
  /** Charged ONCE per order, not per book — the rendering says so out loud. */
  readonly shippingCents: number;
  /** `Date.now()` when the rows were read. The TTL is measured off this. */
  readonly at: number;
}

@Injectable()
export class AssistantFactsService {
  private readonly logger = new Logger(AssistantFactsService.name);

  /**
   * The last successful read, or `null` — meaning "nothing may be quoted".
   *
   * ⚠️ Never read directly by anything but `read()`. That is what makes the
   * "no stale number" rule checkable in one place instead of at every caller.
   */
  private snapshot: AssistantFacts | null = null;

  /**
   * The refresh currently in flight, shared by everyone who arrives during it.
   *
   * Without this, the first question after a snapshot expires starts a read,
   * and so does the second, and so does the thirtieth — a whole class typing
   * at once turns one expiry into thirty triple-queries. Sharing the promise
   * makes the stampede a single read that everybody waits on.
   */
  private inFlight: Promise<AssistantFacts | null> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    /**
     * For the delivery fee ALONE, and deliberately through the shop's own
     * service rather than by reading `SiteSettings.store.shippingCents` here.
     *
     * `BooksService.shippingCents()` already resolves the "unset ⇒
     * `BOOK_SHIPPING_CENTS`" default, and it is the same call
     * `BookOrdersService` uses to price a real basket. A second copy of that
     * expression would eventually quote a delivery fee that is not the one the
     * checkout charges — which is the exact class of bug this whole file is
     * about.
     */
    private readonly books: BooksService,
  ) {}

  /**
   * Every current figure, or `null` when they could not be read.
   *
   * `null` is a real and expected answer — a database blip, a settings
   * singleton that has not been seeded on a fresh deployment — and the caller
   * must treat it as "you know no prices", never as "use the last ones".
   */
  async read(): Promise<AssistantFacts | null> {
    const fresh = this.snapshot;
    if (fresh && Date.now() - fresh.at < FACTS_TTL_MS) return fresh;

    this.inFlight ??= this.load();
    try {
      return await this.inFlight;
    } finally {
      /*
       * Cleared by whoever the promise settles under, so the NEXT expiry
       * starts a new read rather than re-awaiting a resolved one forever.
       */
      this.inFlight = null;
    }
  }

  /**
   * One trip to the database for all three reads.
   *
   * `Promise.all` and not three awaits: they are independent, they are on the
   * path of a student watching a typing indicator, and one of them talks to a
   * different table through a different service.
   */
  private async load(): Promise<AssistantFacts | null> {
    try {
      const [books, courses, shippingCents] = await Promise.all([
        this.prisma.book.findMany({
          /*
           * `isActive` only — the same filter the public shop applies. A
           * withdrawn title is not "a book at a price"; it is not for sale,
           * and quoting it would take an order the shop cannot fill.
           *
           * Note what is NOT filtered: the year. The catalogue does not filter
           * by year either — «كل زائر بيشوف كل الكتب» — and a first-year
           * student buying next year's book early is a sale, not a mistake.
           */
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { year: 'asc' }, { titleAr: 'asc' }],
          select: {
            titleAr: true,
            priceCents: true,
            comparePriceCents: true,
            stock: true,
            course: { select: { title: true } },
          },
        }),
        this.prisma.course.findMany({
          /*
           * Published only. A draft course has a price column filled in while
           * somebody is still deciding, and an archived one is not on sale at
           * any number.
           */
          where: { status: 'published' },
          orderBy: [{ position: 'asc' }, { title: 'asc' }],
          select: {
            title: true,
            slug: true,
            requiresGrant: true,
            monthlyPriceCents: true,
            quarterlyPriceCents: true,
            yearlyPriceCents: true,
            /*
             * ⚠️ `priceCents` is deliberately NOT selected, and this is the one
             * trap on this model. Its own schema note says it plainly:
             * "Reserved. There is no payment system, so this is always 0 and
             * NOTHING reads it." Selecting it and rendering it would make
             * المساعد announce that every course on the platform costs zero
             * pounds — a wrong number with a real column behind it, which is
             * the hardest kind to notice. The prices that exist are the three
             * plan columns above.
             */
          },
        }),
        this.books.shippingCents(),
      ]);

      this.snapshot = {
        books: books.map((row) => ({
          titleAr: row.titleAr,
          priceCents: row.priceCents,
          comparePriceCents: row.comparePriceCents,
          courseTitle: row.course?.title ?? null,
          inStock: row.stock !== 0,
        })),
        courses: courses.map((row) => ({
          title: row.title,
          slug: row.slug,
          requiresGrant: row.requiresGrant,
          monthlyPriceCents: row.monthlyPriceCents,
          quarterlyPriceCents: row.quarterlyPriceCents,
          yearlyPriceCents: row.yearlyPriceCents,
        })),
        shippingCents,
        at: Date.now(),
      };
      return this.snapshot;
    } catch (error) {
      /*
       * ⚠️ THE SNAPSHOT IS DROPPED, NOT KEPT.
       *
       * This line is the whole "no stale number" rule. Leaving the old object
       * in place would mean the first failed refresh after an hour of uptime
       * silently re-serves hour-old prices for as long as the database stays
       * unhappy — indefinitely, and with no signal anywhere that المساعد is
       * quoting history. Dropping it makes the failure loud in the only place
       * it matters: the student is told the price needs checking.
       */
      this.snapshot = null;
      this.logger.error(
        `assistant facts unavailable — no price will be quoted: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return null;
    }
  }
}
