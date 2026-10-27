import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import type { BookShippingRates } from '@ayman/contracts/books';
import { arabicCount } from '@ayman/contracts/arabic-count';

/**
 * Turning live facts into the lines a reply is made of. Pure: the facts come
 * in already read (`WaBotFactsService`), the text goes out, and every number
 * in it is one the catalog held a moment ago.
 *
 * ## Free vs paid is never guessed
 *
 * A course that does not need its own grant is «مفتوح من غير اشتراك» — the
 * same words المساعد uses, from the same column. A course that does need one
 * and has no plan on sale quotes NO number and points at its page: a price
 * that is not for sale is not a price.
 */

export interface CourseFact {
  readonly slug: string;
  readonly title: string;
  readonly system: string;
  readonly year: number;
  readonly requiresGrant: boolean;
  readonly monthlyPriceCents: number | null;
  /** `monthlyPlanOnSale` — false when the course sells by month and none is open. */
  readonly monthlyOnSale: boolean;
  readonly yearlyPriceCents: number | null;
  /** Open, priced terms only. */
  readonly terms: readonly { readonly title: string; readonly priceCents: number }[];
  /** Published lessons marked `isFreePreview`. */
  readonly freeLessons: number;
  /** «السبت والتلات ٨ م» — the course's own `scheduleNote`, as the instructor typed it. */
  readonly scheduleNote: string | null;
}

export interface BookFact {
  readonly title: string;
  readonly priceCents: number;
  readonly inStock: boolean;
}

export interface PersonalLine {
  readonly kind: 'active' | 'expired' | 'pending' | 'rejected';
  readonly course: string;
  readonly slug: string;
  readonly until: Date | null;
  readonly since: Date | null;
}

const EGP = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «150 جنيه» — Latin digits, no decimals, piastres in. */
export function egp(cents: number): string {
  return `${EGP.format(cents / 100)} ${bot.reply.jeneh}`;
}

export function formatDate(date: Date): string {
  return DATE.format(date);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

export function courseUrl(appUrl: string, slug: string): string {
  return `${appUrl}/courses/${encodeURIComponent(slug)}`;
}

export function subscribeUrl(appUrl: string, slug: string): string {
  return `${courseUrl(appUrl, slug)}/subscribe`;
}

/** «الشهر 150 جنيه · الترم الأول 400 جنيه · السنة كاملة 900 جنيه». */
export function planLine(course: CourseFact): string {
  if (!course.requiresGrant) return bot.reply.coursePlansFree;
  const plans: string[] = [];
  if (course.monthlyPriceCents !== null) {
    plans.push(
      course.monthlyOnSale
        ? `${bot.reply.planMonthly} ${egp(course.monthlyPriceCents)}`
        : bot.reply.planMonthlyClosed,
    );
  }
  for (const term of course.terms) {
    plans.push(`${fill(bot.reply.planTerm, { term: term.title })} ${egp(term.priceCents)}`);
  }
  if (course.yearlyPriceCents !== null) plans.push(`${bot.reply.planYearly} ${egp(course.yearlyPriceCents)}`);
  // Only the closed-month line, or nothing at all: no number anyone can pay.
  const payable = plans.filter((plan) => plan !== bot.reply.planMonthlyClosed);
  return payable.length > 0 ? plans.join(' · ') : bot.reply.coursePlansAsk;
}

/**
 * At most this many courses in one reply. A year with a dozen courses is a
 * page on the site, not a WhatsApp message: the rest get one link to the
 * catalogue.
 */
export const MAX_COURSES_PER_REPLY = 5;

function capped(courses: readonly CourseFact[], appUrl: string, line: (c: CourseFact) => string, gap: string): string {
  const shown = courses.slice(0, MAX_COURSES_PER_REPLY).map(line).join(gap);
  return courses.length > MAX_COURSES_PER_REPLY
    ? `${shown}${gap}${fill(bot.reply.moreCourses, { url: `${appUrl}/courses` })}`
    : shown;
}

export function priceBlock(courses: readonly CourseFact[], appUrl: string): string {
  return capped(courses, appUrl, (c) => `📘 ${c.title}\n${planLine(c)}\n${courseUrl(appUrl, c.slug)}`, '\n\n');
}

export function courseBlock(courses: readonly CourseFact[], appUrl: string): string {
  return capped(courses, appUrl, (c) => `📘 ${c.title}\n${courseUrl(appUrl, c.slug)}`, '\n');
}

/** Only courses that are bought — a free one has no subscribe page worth sending. */
export function subscribeBlock(courses: readonly CourseFact[], appUrl: string): string {
  const paid = courses.filter((c) => c.requiresGrant);
  const list = paid.length > 0 ? paid : courses;
  return capped(
    list,
    appUrl,
    (c) => `📘 ${c.title}\n${c.requiresGrant ? subscribeUrl(appUrl, c.slug) : courseUrl(appUrl, c.slug)}`,
    '\n',
  );
}

export function freeLessonsBlock(courses: readonly CourseFact[], appUrl: string): string {
  const withFree = courses.filter((c) => c.freeLessons > 0 || !c.requiresGrant);
  if (withFree.length === 0) return bot.reply.freeLessonsNo;
  const lines = withFree.slice(0, MAX_COURSES_PER_REPLY).map((c) =>
    fill(bot.reply.freeLessonsLine, {
      title: c.title,
      count: c.requiresGrant ? arabicCount(c.freeLessons, bot.reply.freeLessonsCount) : bot.reply.coursePlansFree,
      url: courseUrl(appUrl, c.slug),
    }),
  );
  return [bot.reply.freeLessonsYes, ...lines].join('\n');
}

export function scheduleBlock(courses: readonly CourseFact[]): string {
  return courses
    .filter((c) => c.scheduleNote)
    .slice(0, MAX_COURSES_PER_REPLY)
    .map((c) => fill(bot.reply.scheduleLine, { title: c.title, note: c.scheduleNote ?? '' }))
    .join('\n');
}

export function paymentBlock(contact: { instapay: string | null; vodafoneCash: string | null }): string {
  const lines: string[] = [];
  if (contact.instapay) lines.push(fill(bot.reply.payInstapay, { number: localPhone(contact.instapay) }));
  if (contact.vodafoneCash) lines.push(fill(bot.reply.payWallet, { number: localPhone(contact.vodafoneCash) }));
  lines.push(bot.reply.payOnPage);
  return lines.join('\n');
}

/** «+201012345678» → «01012345678», the way a student types it into InstaPay. */
export function localPhone(e164: string): string {
  return e164.startsWith('+20') ? `0${e164.slice(3)}` : e164;
}

export function booksBlock(books: readonly BookFact[], rates: BookShippingRates): string {
  if (books.length === 0) return bot.reply.booksNone;
  const lines = books.map((b) =>
    fill(b.inStock ? bot.reply.bookLine : bot.reply.bookLineOut, { title: b.title, price: egp(b.priceCents) }),
  );
  const zone = (cents: number) => (cents === 0 ? bot.reply.shippingZero : egp(cents));
  const shipping =
    rates.cairo_giza === 0 && rates.delta === 0 && rates.far === 0
      ? bot.reply.shippingFree
      : fill(bot.reply.shippingZones, {
          cairo: zone(rates.cairo_giza),
          delta: zone(rates.delta),
          far: zone(rates.far),
        });
  return [bot.reply.booksTitle, ...lines, shipping].join('\n');
}

export function personalBlock(
  lines: readonly PersonalLine[],
  who: { kind: 'student' } | { kind: 'parent'; childName: string | null },
  appUrl: string,
): string {
  const subject =
    who.kind === 'parent' && who.childName
      ? fill(bot.reply.subChild, { name: firstName(who.childName) })
      : bot.reply.subYou;
  return lines
    .map((line) => {
      switch (line.kind) {
        case 'active':
          return line.until
            ? fill(bot.reply.subActiveUntil, { who: subject, course: line.course, date: formatDate(line.until) })
            : fill(bot.reply.subActive, { who: subject, course: line.course });
        case 'expired':
          return fill(bot.reply.subExpired, {
            who: subject,
            course: line.course,
            url: subscribeUrl(appUrl, line.slug),
          });
        case 'pending':
          return fill(bot.reply.subPending, {
            course: line.course,
            date: line.since ? formatDate(line.since) : '',
          });
        case 'rejected':
          return fill(bot.reply.subRejected, { course: line.course });
      }
    })
    .join('\n');
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/u)[0] ?? full.trim();
}

/**
 * `{{name}}` → value. A line that held a placeholder resolving to nothing is
 * DROPPED, whole: «قناة الواتساب: » with no link after it is worse than no
 * line. Unknown placeholders are left as written, so a typo the admin made is
 * visible in the dry run rather than silently eaten.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string | null>>): string {
  const out: string[] = [];
  for (const line of template.split('\n')) {
    let emptied = false;
    const rendered = line.replace(/\{\{([^{}]+)\}\}/gu, (whole, raw: string) => {
      const key = raw.trim();
      if (!(key in values)) return whole;
      const value = values[key];
      if (value === null || value === undefined || value.trim() === '') {
        emptied = true;
        return '';
      }
      return value;
    });
    if (!emptied) out.push(rendered);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
