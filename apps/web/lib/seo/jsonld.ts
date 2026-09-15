import { copy, youTubeEmbedUrl, youTubeThumbnailUrl } from '@ayman/contracts';
// The SUBPATH, not the root barrel — importing a runtime value through the
// barrel is what stops the API booting. Same import the footer uses.
import { waMeHref } from '@ayman/contracts/whatsapp';
import { SAME_AS } from '@ayman/contracts/site-profiles';
import { mediaUrl } from '@ayman/ui/branding';
import { yearAliasesAr, yearLabelAr } from '@/lib/year-label';

/**
 * The site origin. Nothing else in the app is host-aware, so switching to a
 * real domain is one environment variable.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200').replace(
  /\/$/,
  '',
);

const absolute = (path: string): string => `${SITE_URL}${path}`;

/**
 * The subset of `CatalogCourse` the JSON-LD builders actually read — a
 * narrower structural type than the full contract on purpose, so a course
 * fixture in a test only needs to supply the fields these functions use,
 * not every field the public catalog API happens to return.
 */
export interface CourseForJsonLd {
  slug: string;
  title: string;
  subtitle: string | null;
  systemNameAr: string;
  subjectNameAr: string;
  trackLabelAr: string | null;
  /**
   * مدارس عربي / مدارس لغات — the pair every card renders as a `<StreamBadge>`
   * chip, and the primary disambiguator for a Bakalorya student: two courses
   * can share a title and differ only in this.
   */
  forGeneral: boolean;
  forLanguages: boolean;
  year: number;
  totalSeconds: number;
  /**
   * EGP cents, `null` when that plan is not for sale.
   *
   * ⚠️ REQUIRED, not optional, and that is the whole point of the field. Until
   * 2026-09-15 this node published `offers: { price: '0', category: 'Free' }`
   * and `isAccessibleForFree: true` on every course — including the ones whose
   * own page renders «١٥٠ ج / الشهر» three lines away. Structured data that
   * contradicts the page is bad; structured data that tells an assistant a paid
   * course is free is a wrong answer given to a student in the assistant's own
   * voice, and the student finds out at the paywall.
   *
   * Optional fields would have let the next call site reintroduce it silently.
   * These three are required so that adding a surface means deciding what it
   * costs.
   */
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  /**
   * الترم الأول / الترم الثاني — only on the DETAIL read (`CatalogCourseDetail`),
   * so the catalog list legitimately has none. Only open, priced terms ever
   * reach here; see `CatalogCourseTermSchema`.
   */
  terms?: readonly { title: string; priceCents: number }[];
  /** The cover the card and the course page both render. On the list too. */
  coverKey?: string | null;
  /**
   * The instructor's own description of the course, which only the DETAIL read
   * carries. The list falls back to the subtitle, as it always has.
   */
  description?: string | null;
  /**
   * ⚠️ There is deliberately NO `syllabusSections` / `teaches` on this node,
   * and it was tried and removed on 2026-09-15 rather than never considered.
   *
   * Two independent reasons, either one sufficient:
   *
   * · `(site)/courses/[slug]/page.tsx` REPLACES the lesson list with
   *   `copy.course.lessonsLockedNote` for every priced course — see the note
   *   there. Publishing those titles as structured data would announce to a
   *   crawler exactly what the page withholds from the reader, which is a
   *   worse version of the mismatch this whole file exists to avoid.
   * · The section titles are not yet content. Read off production on
   *   2026-09-15, the complete set across all five published courses is
   *   «الوحدة الأولى» ×2, «الوحده الاولي » ×2 (misspelled, trailing space),
   *   «كورس تأسيسي برمجة بكالوريا 2027» and «الامتحان النهائي», with zero
   *   section summaries. `teaches: ['الوحدة الأولى']` asserts the course
   *   teaches a chapter number, and the misspelling would go into a knowledge
   *   graph — the exact failure `knowsAbout` above was already fixed for once.
   *
   * Both are content problems, not code ones. When the outlines carry real
   * unit names AND the page stops hiding them, this is worth revisiting.
   */
}

/**
 * One printed book, as the shop's payload carries it — the fields
 * `bookListJsonLd` reads and no more, for the same reason `CourseForJsonLd` is
 * narrower than the catalog contract.
 */
export interface BookForJsonLd {
  slug: string;
  titleAr: string;
  subtitleAr: string | null;
  descriptionAr: string | null;
  coverKey: string | null;
  priceCents: number;
  pageCount: number | null;
  inStock: boolean;
}

/**
 * EGP cents → the bare decimal schema.org's `price` wants.
 *
 * ⚠️ NOT `formatEGP`. That one is `Intl.NumberFormat('ar-EG-u-nu-latn')` — it
 * groups thousands and exists to be READ. «1,250» is not a number to a
 * validator, and a price it cannot parse is an offer it drops.
 */
const egpPrice = (cents: number): string => (cents / 100).toFixed(2);

/** `PT1H1M1S`. Zero is `PT0S`, not the empty `PT`, which validators reject. */
export function secondsToIso8601Duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds === 0) return 'PT0S';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${minutes > 0 ? `${minutes}M` : ''}${
    rest > 0 ? `${rest}S` : ''
  }`;
}

/**
 * Stable `@id`s. Structured data on separate pages only describes ONE entity
 * when the pages agree on its identifier — without these, the landing page's
 * organisation and a course page's `provider` are two unrelated organisations
 * to a crawler, and neither accumulates the signal the other earned.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * The instructor's own profiles. Fed into `sameAs`, which is the strongest
 * single signal for tying a bare-name query to this site — it is what turns
 * "a page about someone with this name" into "the page about THIS person".
 *
 * Supplied by the instructor on 2026-08-04 and normalised here rather than
 * pasted as given: every one arrived carrying share/referral parameters
 * (`?si=`, `?igsh=`, `&utm_source=qr`, `?_t=`) that identify the SHARE, not
 * the profile. Two identical entities under two query strings are two entities
 * to a crawler, so `sameAs` takes the canonical form only.
 *
 * All four were verified to resolve at the URL written here. Facebook needed a
 * real browser to check: it answers any non-browser request with 400 whatever
 * the URL, so `curl` can neither confirm nor deny one.
 *
 * The Facebook entry is the canonical profile, not the `/share/<id>/` link it
 * arrived as. Two different share ids were supplied and BOTH redirect to
 * `facebook.com/aymanaboelela2` ("Ayman Abo El Ela") — resolved by loading
 * each in Playwright. A share id is not guaranteed permanent and Google's
 * guidance asks for the official profile URL, so the destination is what is
 * published.
 */
/*
 * Imported at the top of the file, not restated here. The identical four URLs
 * also drive the footer icons and the API's settings seed, and a `sameAs` that
 * names one destination while the footer links another is a claim the page
 * contradicts. One list — see `@ayman/contracts/site-profiles`.
 */

/**
 * The profiles this site claims to BE, read from the live settings row and
 * falling back to the shipped constant.
 *
 * ⚠️ It used to be `SAME_AS` unconditionally, and that is wrong in two
 * directions at once.
 *
 * · **Stale.** The four URLs are editable at `/admin/settings` and seeded from
 *   `SAME_AS`. An instructor who moves a channel updates the footer — which
 *   reads the settings row — and `sameAs` keeps naming the old one. Two lists
 *   that must agree are one list, which is the argument `site-profiles.ts`
 *   already makes about the footer; the settings row is simply the newer
 *   copy.
 * · **Wrong on another stack.** This image runs for more than one instructor
 *   (`TENANT_KEY`), and `SAME_AS` is Ayman's accounts compiled in. On a tenant
 *   deployment the constant asserts, in machine-readable form, that their site
 *   and his YouTube channel are one entity.
 *
 * The constant stays as the fallback and nothing more: during `next build` the
 * API is unreachable and the settings row arrives empty, and a Person with no
 * `sameAs` for the first minutes after a deploy is worse than one carrying the
 * seed it was deployed with.
 *
 * ⚠️ `sameAs: []` is not the same as no `sameAs` — an empty array is a claim
 * of "none", so an empty list omits the field entirely.
 */
export interface ProfilesForJsonLd {
  facebook?: string | null;
  youtube?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
}

function sameAsFrom(contact?: ProfilesForJsonLd): readonly string[] {
  const live = [contact?.facebook, contact?.youtube, contact?.instagram, contact?.tiktok].filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0,
  );
  return live.length > 0 ? live : SAME_AS;
}

function withSameAs<T extends object>(
  entity: T,
  contact?: ProfilesForJsonLd,
): T & { sameAs?: readonly string[] } {
  const sameAs = sameAsFrom(contact);
  return sameAs.length > 0 ? { ...entity, sameAs } : entity;
}

/**
 * The instructor as a distinct entity from the platform.
 *
 * This is the piece that answers the bare-name query. "أيمن أبو العلا" is a
 * PERSON search, and a site that only ever describes itself as an organisation
 * gives a crawler nothing to match against it — `alternateName` carrying the
 * hamza-less spellings is doing the actual work here, because that is what
 * students type. See `copy.seo` for why the misspellings live in metadata and
 * never in visible copy.
 */
export function personJsonLd(contact?: ProfilesForJsonLd) {
  return withSameAs(
    {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': PERSON_ID,
    /*
     * ⚠️ `site.name`, NOT `site.instructor`. This was «المهندس أيمن أبو العلا»
     * — a title glued to a name — in the one field whose job is to BE the
     * name, while `site.name`'s own note in `copy/ar.ts` had said for months
     * that the JSON-LD Person takes the bare form. An engine resolving
     * «أيمن أبو العلا» against a name that opens with «المهندس» is matching a
     * substring, not an entity.
     *
     * The title is not lost: `honorificPrefix` is the field for it, and the
     * name parts below are stated rather than derived because «أبو العلا» is
     * two words of one family name and every whitespace split gets it wrong.
     */
    name: copy.site.name,
    honorificPrefix: copy.seo.personHonorific,
    givenName: copy.seo.personGivenName,
    familyName: copy.seo.personFamilyName,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    image: absolute('/team/ayman.jpg'),
    jobTitle: copy.seo.jobTitle,
    description: copy.seo.personDescription,
    knowsLanguage: ['ar', 'en'],
    /**
     * ⚠️ This list used to be the four topics a programming teacher generically
     * knows — «البرمجة، علوم الحاسب، الخوارزميات، قواعد البيانات» — and three of
     * the four appear nowhere in the syllabus he actually teaches. The Bakalorya
     * subject is «البرمجة والذكاء الاصطناعي», and its four units are AI,
     * cybersecurity, web applications and web/UX design. A student — or an
     * assistant answering for one — asking who teaches الذكاء الاصطناعي for
     * البكالوريا was matching against a `knowsAbout` that did not contain the
     * phrase at all.
     *
     * So this is the unit list, not a résumé of everything he can do. Keep it
     * that way: a topic belongs here when a course on this site teaches it.
     * See `copy.seo.instructorCoverage` for the prose form of the same claim.
     */
    knowsAbout: [
      'البرمجة',
      'الذكاء الاصطناعي',
      'علوم الحاسب',
      'الأمن السيبراني',
      'تطبيقات الويب',
      'تصميم تجربة المستخدم',
      'الخوارزميات',
      'قواعد البيانات',
      'تطبيقات الموبايل',
    ],
    /**
     * `hasOccupation` and `alumniOf` — the two facts that separate «a person
     * who has a website about teaching» from «a person who teaches this».
     *
     * ⚠️ Both come from `copy.landing.aboutCredits`, which he supplied, and the
     * same rule applies here as there: nothing in this block may be embellished.
     * The university is the one he graduated from; the occupation is the one he
     * holds. There is no `award`, no `hasCredential` and no student count,
     * because no verified one was given — an unverifiable claim in structured
     * data is worth less than its absence and risks the entity being discounted
     * wholesale.
     */
    hasOccupation: {
      '@type': 'Occupation',
      name: copy.seo.jobTitle,
      occupationalCategory: '25-2031.00',
      occupationLocation: { '@type': 'Country', name: 'Egypt' },
    },
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: copy.seo.alumniOfName,
      alternateName: 'MTI University',
    },
    worksFor: { '@id': ORGANIZATION_ID },
    /**
     * Which page is ABOUT him. `/about` already declares the inverse with
     * `ProfilePage.mainEntity`; stating both directions is what lets a consumer
     * that meets the Person node first (on any page — the layout emits it
     * everywhere) know where to go for the long form.
     */
    mainEntityOfPage: absolute('/about'),
    nationality: { '@type': 'Country', name: 'Egypt' },
  }, contact);
}

/**
 * `EducationalOrganization`, not the generic `Organization` it used to be —
 * it is a strict subtype, so nothing that consumed the old shape breaks, and
 * it is what makes the entity eligible to be understood as a school rather
 * than a company that happens to have a website.
 */
export function organizationJsonLd(
  /**
   * The public contact row, when there is one.
   *
   * ⚠️ Optional, and the default is "publish nothing" rather than "publish
   * empty". `getPublicSettingsOrDefaults` returns `contact: {}` during
   * `next build` — the API is unreachable in the image build — so for the
   * first minutes after a deploy this is called with nothing. A missing
   * optional field for a few minutes is fine; `telephone: null` in a knowledge
   * graph is a claim that there is no phone.
   */
  contact?: {
    whatsapp?: string | null;
    phone?: string | null;
    email?: string | null;
  } & ProfilesForJsonLd,
) {
  /**
   * `telephone` and `email` — the two fields a competitor ranking for
   * «أفضل مدرس برمجة بكالوريا» had on this node and this site did not
   * (measured 2026-09-13).
   *
   * ⚠️ WhatsApp before the landline-shaped `phone`, because WhatsApp is how a
   * parent on this platform actually makes contact — it is the number in the
   * footer and on every CTA. Publishing a second, unanswered number instead
   * would be accurate and useless.
   *
   * Nothing here is new information: both values are already rendered in the
   * site footer. This states them in the field a crawler reads.
   */
  const telephone = contact?.whatsapp ?? contact?.phone ?? null;

  /**
   * `contactPoint` beside the bare `telephone`, carrying the `wa.me` URL.
   *
   * A phone number in a knowledge graph is a string to display. A
   * `ContactPoint` with a `url` is a door an assistant can hand a student —
   * «كلّمه هنا» with a link — which is the difference between being listed and
   * being reachable, and reaching him on WhatsApp is how every enrolment on
   * this platform actually starts.
   *
   * ⚠️ `waMeHref` returns null for anything that is not E.164, so a badly
   * typed number in `/admin/settings` drops the whole node rather than
   * publishing a link that opens WhatsApp on nobody. `telephone` above still
   * ships in that case — a wrong-looking number is still the number he gave.
   *
   * `availableLanguage: ar` is not decoration: it is the one field that tells
   * an assistant answering in English that the person on the other end will
   * reply in Arabic.
   */
  const whatsappUrl = waMeHref(contact?.whatsapp ?? null);

  return withSameAs({
    ...(telephone ? { telephone } : {}),
    ...(contact?.email ? { email: contact.email } : {}),
    ...(whatsappUrl
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            url: whatsappUrl,
            ...(telephone ? { telephone } : {}),
            availableLanguage: ['ar'],
            areaServed: 'EG',
          },
        }
      : {}),
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': ORGANIZATION_ID,
    name: copy.site.platformName,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    description: copy.seo.description,
    slogan: copy.site.tagline,
    image: absolute('/team/ayman.jpg'),
    logo: absolute('/team/ayman.jpg'),
    founder: { '@id': PERSON_ID },
    inLanguage: 'ar',
    areaServed: { '@type': 'Country', name: 'Egypt' },
    address: { '@type': 'PostalAddress', addressCountry: 'EG' },
  }, contact);
}

/**
 * The site itself — a third, independent place a crawler can learn that
 * "منصه ايمن ابو العلا" names this site. Person, Organization and WebSite
 * agreeing on the same `alternateName` list is far stronger than any one of
 * them asserting it alone.
 *
 * NOT PRESENT: `potentialAction`/`SearchAction`. That is what earns the
 * sitelinks searchbox, and it requires a URL template that really performs a
 * search — `/courses` renders the full catalogue and ignores every query
 * parameter, so declaring `?q={search_term_string}` would be a claim the site
 * cannot honour. Add it the same day catalogue search ships, not before.
 */
export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: copy.site.platformName,
    alternateName: copy.seo.alternateNames,
    url: SITE_URL,
    description: copy.seo.description,
    inLanguage: 'ar',
    publisher: { '@id': ORGANIZATION_ID },
  } as const;
}

/**
 * `provider` in its two shapes, as ONE type rather than a union of two.
 *
 * A union would be more honest about the data, but it makes every consumer —
 * including the tests — narrow before it can read `['@type']`, for a
 * distinction no consumer cares about. The optional fields say what they mean:
 * `@id` is always there, the readable rest is only there standalone.
 */
interface CourseProvider {
  '@id': string;
  '@type'?: 'EducationalOrganization';
  name?: string;
  url?: string;
}

/**
 * One course.
 *
 * `options.nested` is for a `Course` emitted INSIDE another node in the same
 * script — today only the catalog's `ItemList`. It changes nothing a crawler
 * reads; it drops the two pieces the surrounding document already states, on a
 * page where they are stated up to 86 times. See `courseListJsonLd` for the
 * measurement that motivated it.
 */
/**
 * What a course costs, as `Offer` nodes — one per plan the page actually shows.
 *
 * ⚠️ The order and the membership mirror `(site)/courses/[slug]/page.tsx`'s
 * price block exactly: monthly, quarterly, each open term, yearly. Structured
 * data is a machine-readable copy of the page, so a plan listed here that the
 * page does not render — or a price that rounds differently — is a
 * contradiction a validator cannot see and an assistant will quote.
 *
 * `priceCents / 100`, formatted to two decimals: schema.org wants a number in
 * the currency's major unit, and `'150.00'` is unambiguous where `15000` reads
 * as fifteen thousand pounds.
 *
 * ⚠️ `availability: InStock` is honest here and would not be on a course with
 * a closed term — `CatalogService.findBySlug` filters those out before they
 * reach this function, which is why it can be stated flatly. If that filter
 * ever moves, this line becomes a claim nothing checks.
 */
/**
 * A rich-text field, flattened to the plain sentence a `description` is
 * supposed to be.
 *
 * ⚠️ The field is plain text on the way IN and HTML on the way OUT, and that
 * asymmetry is the whole difficulty. `CatalogCourseDetail.description` is
 * authored in a bare `<Textarea>` (`course-form.tsx`) with no rich-text editor
 * and no validation (`description: z.string().nullable()`), and every live
 * course's value is a typed paragraph with `\r\n` in it — but the page renders
 * it through `<RichText>`, so markup, if an instructor ever pastes some, would
 * render. So this has to flatten tags AND leave a hand-typed sentence intact,
 * and the common case is the sentence.
 *
 * ⚠️ This is NOT a sanitiser and must never be used as one. Nothing here
 * defends against anything: the value goes through `JSON.stringify` and then
 * through `JsonLd`'s `<` escape, which is what makes it safe. This only makes
 * it READ correctly. `sanitizeRichText` is the security boundary and it lives
 * on the rendering path.
 *
 * Three bugs shipped in the first version of this function, all three from
 * treating the value as HTML rather than as prose that MIGHT carry HTML:
 *
 *  · `/<[^>]*>/g` ate a comparison. «لو س < 5 و ص > 2 يبقى تمام» came out as
 *    «لو س 2 يبقى تمام» — on a computer-science platform, where a `<` between
 *    two spaces is the most ordinary character there is. `MARKUP` in
 *    `@ayman/contracts/quiz/rich-text` had already settled this exact question
 *    for quiz bodies, with this exact example in its comment; `HTML_TAG` below
 *    is that rule with the closing bracket added.
 *  · `String.fromCodePoint` THREW on `&#1114112;` — `RangeError: Invalid code
 *    point` — inside `courseJsonLd`, which renders synchronously on the course
 *    page. One pasted entity would have 500'd the page that sells the course.
 *  · `&amp;` decoded FIRST, so `&amp;lt;script&amp;gt;` — a literal `&lt;` an
 *    instructor typed, meaning they wanted to SHOW the characters — became
 *    `<script>`. The ampersand has to decode LAST for the same reason
 *    `sitemap-url.ts` escapes it first: it is the one that introduces the
 *    others.
 *
 * Block-level tags become a space rather than nothing, or «سطر</p><p>تاني»
 * would come out as one run-on word. `htmlToPlainText` in contracts drops them
 * to `''` instead, which is right for its own caller and wrong here.
 */

/**
 * A `<` that opens a tag: one followed by a letter, a slash or a bang. Same
 * rule as `MARKUP` in `@ayman/contracts/quiz/rich-text`, which is where the
 * reasoning lives — a bare `<` with a space or a digit after it is a
 * comparison sign and ordinary content.
 */
const HTML_TAG = /<[a-z!/][^>]*>/gi;

/**
 * One numeric character reference, or U+FFFD when it names nothing.
 *
 * ⚠️ Returns the replacement character rather than throwing OR passing the
 * entity through. A lone surrogate (`&#55296;`) does not throw, but
 * `JSON.stringify` emits it unpaired and that is ill-formed JSON — a whole
 * `<script type="application/ld+json">` a parser rejects. U+FFFD is also what
 * a browser puts there, so the graph says what the page says.
 */
function codePoint(raw: string): string {
  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 0x10ffff ||
    (value >= 0xd800 && value <= 0xdfff)
  ) {
    return '\uFFFD';
  }
  return String.fromCodePoint(value);
}

function plainText(html: string): string {
  return (
    html
      .replace(HTML_TAG, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code: string) => codePoint(code))
      // LAST — see the note above.
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * «عربي» / «لغات» / «عربي ولغات» — the same three strings the `<StreamBadge>`
 * chip renders, so the graph and the card cannot describe one course
 * differently.
 */
function streamLabel(item: { forGeneral: boolean; forLanguages: boolean }): string | null {
  if (item.forGeneral && item.forLanguages) return copy.stream.both;
  if (item.forGeneral) return copy.stream.general;
  if (item.forLanguages) return copy.stream.languages;
  // The database CHECK makes "neither" unrepresentable; a payload from before
  // that migration says nothing rather than something wrong.
  return null;
}

function courseOffers(course: CourseForJsonLd) {
  const plans: Array<{ name: string; cents: number }> = [];
  if (course.monthlyPriceCents !== null) {
    plans.push({ name: copy.subscribe.planMonthlyLabel, cents: course.monthlyPriceCents });
  }
  if (course.quarterlyPriceCents !== null) {
    plans.push({ name: copy.subscribe.planQuarterlyLabel, cents: course.quarterlyPriceCents });
  }
  for (const term of course.terms ?? []) {
    plans.push({ name: term.title, cents: term.priceCents });
  }
  if (course.yearlyPriceCents !== null) {
    plans.push({ name: copy.subscribe.planYearlyLabel, cents: course.yearlyPriceCents });
  }

  return plans.map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    // `category: 'Subscription'` on every one of them, including the term
    // plans: all four are time-limited access to the same course, not a
    // one-off purchase of a copy. The plan's own name is in `name`.
    category: 'Subscription',
    price: egpPrice(plan.cents),
    priceCurrency: 'EGP',
    availability: 'https://schema.org/InStock',
    url: absolute(`/courses/${course.slug}`),
  }));
}

/**
 * The free case, stated rather than left out. A `Course` with no `offers` is a
 * course whose price is unknown; «الكورس ده مفتوح مجانًا» — which is what the
 * page renders when no plan is priced — is a different and much more useful
 * claim, and the one the foundation course needs.
 */
const freeOffer = {
  '@type': 'Offer',
  price: '0',
  priceCurrency: 'EGP',
  category: 'Free',
  availability: 'https://schema.org/InStock',
};

/**
 * A reference to one of the site-wide entities, carrying the one field that
 * makes the node readable without resolving the `@id`.
 *
 * ⚠️ The bare `{ '@id': … }` these replace was inherited from the NESTED
 * catalog shape, where dropping the name is right because the surrounding
 * document states it up to 86 times. Standalone it is stated ZERO times in the
 * same `<script>` — `json-ld.tsx` emits one script per call, so on an article
 * page the `Person` node the `author` points at is in a different block
 * entirely. A consumer that does not walk `@id`s across blocks — which is most
 * of them, and every LLM reading the raw HTML — saw an author with no name.
 *
 * The `@id` still does the joining work for consumers that do resolve it; the
 * `name` is what the rest read.
 */
interface EntityRef {
  '@id': string;
  /**
   * Optional for the same reason `CourseProvider`'s fields are: the nested
   * catalog shape drops both, and no consumer should have to narrow a union to
   * read a name that is simply absent there.
   */
  '@type'?: 'Person' | 'EducationalOrganization';
  name?: string;
}

const personRef = (): EntityRef => ({
  '@id': PERSON_ID,
  '@type': 'Person',
  name: copy.site.name,
});

const organizationRef = (): EntityRef => ({
  '@id': ORGANIZATION_ID,
  '@type': 'EducationalOrganization',
  name: copy.site.platformName,
});

export function courseJsonLd(course: CourseForJsonLd, options: { nested?: boolean } = {}) {
  // `@id` ties this back to the one organisation the root layout emits on
  // every page, instead of minting an anonymous second one per course.
  //
  // Standalone (a course page), the name/url stay alongside it so the node is
  // still readable on its own. Nested in the catalog list they are dropped:
  // `app/layout.tsx` emits the FULL `EducationalOrganization` node under this
  // exact `@id` on every page including that one, so N copies of a name and a
  // URL the same document already carries are bytes and nothing else. That
  // cheaper shape is not new here — `instructor` below has always been a bare
  // `@id` reference for the same reason.
  const provider: CourseProvider = options.nested
    ? { '@id': ORGANIZATION_ID }
    : {
        '@type': 'EducationalOrganization',
        '@id': ORGANIZATION_ID,
        name: copy.site.platformName,
        url: SITE_URL,
      };

  // Typed like `provider` above, and for the identical reason: without the
  // annotation the two branches infer a union and every reader has to narrow
  // it to ask for a name.
  const instructor: EntityRef = options.nested ? { '@id': PERSON_ID } : personRef();
  const offers = courseOffers(course);

  return {
    // JSON-LD scopes `@context` to the node tree it is declared on, so a Course
    // inside the `ItemList` inherits the list's. Repeating it per item is 33
    // bytes × N asserting something already true. Standalone it is required —
    // without it the document has no vocabulary and every type is meaningless.
    ...(options.nested ? {} : { '@context': 'https://schema.org' }),
    '@type': 'Course',
    /*
     * ⚠️ The `#course` fragment, not the bare URL. `mainEntityOfPage` below
     * declares a `WebPage` node whose `@id` IS the bare `/courses/<slug>`, and
     * two nodes cannot share one identifier — `articleJsonLd` and the year
     * page's `CollectionPage` both use a fragment for the same reason.
     *
     * ⚠️ `@id` is emitted on the NESTED shape too, and does not join the list
     * of things `options.nested` drops. The bytes it saves are nothing; what
     * it buys is that the `Course` in the catalog's `ItemList` and the `Course`
     * on that course's own page are ONE entity rather than two that happen to
     * share a URL.
     */
    '@id': absolute(`/courses/${course.slug}#course`),
    name: course.title,
    /*
     * ⚠️ The instructor's own description when the read carries one — the
     * paragraph the page renders — and the subtitle otherwise. It used to be
     * the subtitle always, which on every live course is the same fragment
     * («المنهج الرسمي كامل — مسار الهندسة وعلوم الحاسب — دفعة 2027»): accurate,
     * identical across four of the five courses, and telling an assistant
     * nothing that would let it choose between them.
     */
    description: course.description
      ? plainText(course.description)
      : (course.subtitle ?? copy.site.tagline),
    url: absolute(`/courses/${course.slug}`),
    // Standalone only: a catalog row claiming `/courses` is its own page would
    // put eighty-six courses on one WebPage.
    ...(options.nested
      ? {}
      : {
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': absolute(`/courses/${course.slug}`),
          },
        }),
    ...(course.coverKey ? { image: mediaUrl(course.coverKey) } : {}),
    inLanguage: 'ar',
    // «البكالوريا — الصف الثاني بكالوريا», not «البكالوريا — 2». The bare digit
    // was unmatchable: a student searches «تانية بكالوريا» and an assistant
    // grounding on this node had a number where the phrase should be.
    educationalLevel: `${course.systemNameAr} — ${yearLabelAr(course.year)}`,
    /**
     * The same course, under every name a student gives its year.
     *
     * ⚠️ The digit forms — «٢ بكالوريا», «2 بكالوريا» — are the reason this
     * field exists here. The title says «تانية بكالوريا» and nothing on the
     * node said «٢», so a query carrying the numeral had no string to match.
     * `keywords` on a `CreativeWork` is the field whose defined job is "other
     * terms this is known by", which is exactly what these are — see
     * `yearAliasesAr` for why both digit sets and both spellings ship.
     *
     * ⚠️ Aliases for THIS course's year only. Listing all three years' spellings
     * on every course would make each one claim to be about all of them, which
     * is the difference between an alias and a keyword stuff.
     */
    keywords: [
      ...yearAliasesAr(course.year),
      course.subjectNameAr,
      course.systemNameAr,
      // «عربي» or «لغات». Two courses on this site carry the same title and
      // differ ONLY in this word; without it the node a student's assistant
      // matches is a coin flip between their edition and the other one.
      ...(streamLabel(course) === null ? [] : [streamLabel(course) as string]),
    ],
    about: course.subjectNameAr,
    provider,
    // The course is taught by the person, and the person is the thing being
    // searched for — this is what carries a course page's authority back to
    // the name query.
    // Nested in the catalog list the surrounding document names him once per
    // item already; standalone it names him nowhere else in this script.
    instructor,
    isAccessibleForFree: offers.length === 0,
    offers: offers.length > 0 ? offers : freeOffer,
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: secondsToIso8601Duration(course.totalSeconds),
    },
  };
}

/**
 * ⚠️ The `Course` "course info" rich result was DEPRECATED in Sept 2025. The
 * shape Google still supports on a catalog page is an `ItemList` carrying at
 * least THREE `Course` items — below three it produces nothing, so emitting
 * a one-item list is pure page weight. Returning null is the honest
 * behaviour.
 *
 * ⚠️ Because that shape was tuned against a live Google requirement, any
 * change to what this emits goes through the Rich Results Test before it
 * ships — structured data breaks silently and nothing in CI notices.
 *
 * The items are built with `nested: true`. Measured on the built
 * `.next/server/app/courses.html` (86 courses): the script is 73,213 raw bytes,
 * and dropping the per-item `@context` plus the `EducationalOrganization`
 * name/url from each `provider` takes 12,126 of them — 16.6%. Gzip had already
 * absorbed nearly all of the transfer cost, so this is NOT a bandwidth fix:
 * 3,528 → 3,336 bytes on the wire, 192 bytes. What it buys is 12 KB a low-end
 * Android no longer decompresses, tokenises and parses. Modest, and worth
 * having only because it is free — the shape a crawler reads is unchanged.
 */
export function courseListJsonLd(courses: readonly CourseForJsonLd[]) {
  if (courses.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: courses.map((course, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: courseJsonLd(course, { nested: true }),
    })),
  };
}

/**
 * «قسم الكتب» — the printed books, as an `ItemList` of `Book` with real offers.
 *
 * ## Why `Book` and not `Product`
 *
 * `Book` IS a `Product` in schema.org's hierarchy, so nothing is lost, and it
 * carries `numberOfPages`, `bookFormat` and `inLanguage` — the three facts
 * that distinguish «كتاب تانية بكالوريا برمجة عربي» from a course with the
 * same name. `bookFormat: Paperback` is the one that answers the question a
 * parent actually asks, which is whether the thing is printed and shipped.
 *
 * ## Why this page and not one node per book
 *
 * There is no `/books/<slug>` route — the shop is deliberately one page, see
 * its own note — so each `Book` is identified by the fragment its card already
 * anchors to (`/books#book-<slug>`), and the list is what the page IS.
 *
 * ⚠️ `availability` is read from `inStock`, per title. A withdrawn book still
 * renders a card — see `BookCardSchema.inStock` — so publishing every book as
 * `InStock` would advertise stock that cannot be sold.
 *
 * ⚠️ The delivery fee is NOT folded into `price`. It is charged once per order
 * however many books are in it, so adding it to a per-book price would
 * overstate a two-book order by 65 EGP. It rides as `shippingDetails` instead,
 * which is where a consumer expects to find it.
 */
export function bookListJsonLd(
  shelves: ReadonlyArray<{
    subjectNameAr: string;
    first: readonly BookForJsonLd[];
    second: readonly BookForJsonLd[];
    full: readonly BookForJsonLd[];
  }>,
  shippingCents: number,
) {
  const books = shelves.flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full]);
  if (books.length === 0) return null;

  const shipping = {
    '@type': 'OfferShippingDetails',
    shippingRate: {
      '@type': 'MonetaryAmount',
      value: egpPrice(shippingCents),
      currency: 'EGP',
    },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'EG' },
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': absolute('/books#books'),
    name: copy.books.metaTitle,
    itemListElement: books.map((book, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Book',
        '@id': absolute(`/books#book-${book.slug}`),
        name: book.titleAr,
        ...(book.subtitleAr ? { alternativeHeadline: book.subtitleAr } : {}),
        ...(book.descriptionAr ? { description: book.descriptionAr } : {}),
        ...(book.coverKey ? { image: mediaUrl(book.coverKey) } : {}),
        ...(book.pageCount !== null ? { numberOfPages: book.pageCount } : {}),
        bookFormat: 'https://schema.org/Paperback',
        inLanguage: 'ar',
        author: personRef(),
        publisher: organizationRef(),
        url: absolute(`/books#book-${book.slug}`),
        offers: {
          '@type': 'Offer',
          price: egpPrice(book.priceCents),
          priceCurrency: 'EGP',
          availability: book.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url: absolute('/books'),
          shippingDetails: shipping,
        },
      },
    })),
  };
}

export function videoObjectJsonLd(video: {
  externalId: string;
  name: string;
  description: string;
  durationSeconds: number;
  uploadDate: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    // Built from the id, server-side. Same rule as the player.
    embedUrl: youTubeEmbedUrl(video.externalId),
    thumbnailUrl: youTubeThumbnailUrl(video.externalId),
    duration: secondsToIso8601Duration(video.durationSeconds),
    uploadDate: video.uploadDate,
    inLanguage: 'ar',
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absolute(entry.path),
    })),
  };
}

/**
 * One article. `@type: Article`, deliberately NOT `NewsArticle`.
 *
 * `NewsArticle` asks Google to treat the page as journalism with a news
 * lifecycle — surfaced in Top Stories, decayed hard once it is a few days old.
 * This section is named «نيوز» but its content is evergreen teaching material
 * that should keep ranking for years, and the wrong type would actively work
 * against that.
 *
 * `author` and `publisher` point at the SAME `@id`s the landing page declares,
 * so every article accrues signal to the one Person and Organisation rather
 * than minting a new pair per page.
 */
export function articleJsonLd(
  post: {
    slug: string;
    title: string;
    excerpt: string;
    publishedAt: string;
    updatedAt: string;
    /** Absolute, already through `mediaUrl()`. Null for an article with no cover. */
    image?: string | null;
  },
  /**
   * The course the article was written for, when it declares one — the same
   * `relatedCourseSlug` the page's own CTA reads. Null for a general article.
   */
  course?: {
    slug: string;
    title: string;
    systemNameAr: string;
    subjectNameAr: string;
    year: number;
  } | null,
) {
  const url = absolute(`/news/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    // `mainEntityOfPage` is what tells Google this article IS this page,
    // rather than something merely mentioned on it.
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: post.title,
    description: post.excerpt,
    // datePublished never moves; dateModified does. Emitting `updatedAt` for
    // both would tell a crawler every article is new on every typo fix.
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: 'ar',
    /*
     * Omitted entirely rather than emitted as null when the article has no
     * cover. Google's Article guidance treats `image` as recommended, and a
     * present-but-null property is a worse signal than an absent one — the
     * validator reports it as an error, where a missing optional is simply
     * missing.
     */
    ...(post.image ? { image: [post.image] } : {}),
    author: personRef(),
    publisher: organizationRef(),
    isAccessibleForFree: true,
    /*
     * The curriculum anchor — WHICH subject, WHICH year, WHICH course.
     *
     * Without it an article is a dated page by a named author about nothing in
     * particular: «شرح درس 1-2: كيف يعمل الذكاء الاصطناعي» is a title, and a
     * title is what an engine has to infer the topic from. The three fields
     * below state it. `keywords` carries the year aliases for the same reason
     * `courseJsonLd`'s does — a student types «٢ بكالوريا» and «2 بكالوريا» as
     * often as the words, and both byte sequences have to appear somewhere.
     *
     * ⚠️ `isPartOf` names the course INLINE rather than by `@id`. The Course
     * node lives on `/courses/<slug>`, not on this page, so an `@id` here
     * would point at a node that appears nowhere in this document — a real
     * three-key claim beats a dangling reference.
     *
     * ⚠️ All of it or none of it. An article with no related course emits no
     * key at all, rather than `about: null` — the same rule the `image`
     * comment above states, and for the same reason.
     */
    ...(course
      ? {
          about: course.subjectNameAr,
          educationalLevel: `${course.systemNameAr} — ${yearLabelAr(course.year)}`,
          isPartOf: {
            '@type': 'Course',
            name: course.title,
            url: absolute(`/courses/${course.slug}`),
          },
          keywords: [...yearAliasesAr(course.year), course.subjectNameAr],
        }
      : {}),
  };
}

/** The index. `ItemList` needs three entries to earn a rich result — below that this returns null. */
export function articleListJsonLd(posts: readonly { slug: string; title: string }[]) {
  if (posts.length < 3) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: posts.map((post, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: post.title,
      url: absolute(`/news/${post.slug}`),
    })),
  };
}

/**
 * `FAQPage` — added 2026-08-12, reversing the note that stood here.
 *
 * ⚠️ The previous decision was not wrong; its premise was narrower than the
 * goal now. It read: "NOT TO BE ADDED: Google removed the documentation on
 * 2026-06-15 and it produces zero rich results for a site like this one."
 * Both halves are still true, and neither is the reason this exists.
 *
 * Rich results are a Google SERP feature. What this markup is for is the
 * other consumer: an assistant grounding an answer to «إيه هي البكالوريا» or
 * «أبدأ منين في البرمجة» reads a page and has to decide what on it is a
 * question and what is its answer. From `<details>`/`<summary>` that is an
 * inference — a good one, usually, but one that competes with every other
 * heading on the page. From `mainEntity[]` it is a labelled pair. Same words,
 * no ambiguity, and the extraction survives the markup being restyled.
 *
 * So the two decisions coexist: do not expect a rich result, and do not
 * remove this because a rich-results test reports nothing. The test that
 * guards this now asserts FAQPage appears ONLY here — every other builder on
 * this surface stays clean, which is what the original note was protecting.
 *
 * ⚠️ Pass the rows the page ACTUALLY renders, never `DEFAULT_ROWS` as a
 * convenience. The admin composes this section (`home_blocks`), so the
 * shipped defaults and the live block drift apart the first time anyone edits
 * it — and structured data describing questions the page does not show is the
 * one failure mode here that is worse than no structured data at all.
 */
/**
 * `DefinedTermSet` — the twelve terms on `/essentials`.
 *
 * The FAQ answers questions about the platform. This answers questions about
 * the subject: «يعني إيه متغير», «الحلقة في البرمجة إيه» — asked constantly, by
 * exactly the beginner this page was written for, and increasingly asked to an
 * assistant rather than to a search box. The page already answers all twelve in
 * one clean sentence each; `DefinedTermSet` is the type that says so.
 *
 * `name` is the Arabic term and `alternateName` the English keyword, in that
 * order and not the reverse: the page is Arabic, the student searches in
 * Arabic, and the English column exists so they recognise the token when they
 * meet it in real code. Both are published because the question arrives in
 * either language.
 *
 * ⚠️ `termUrl` must resolve to a real anchor on the page. The `id` is written
 * from `termSlug` in `essentials-terms.ts` and read here through the same
 * function — do not inline the slugging in either place.
 */
/**
 * ⚠️ `options` exists because a second glossary turned up, not to make the
 * builder configurable. `/news/قاموس-مصطلحات-…` carries a hundred-odd terms in
 * the article body — see `lib/news/structured.ts` — and it is a different SET
 * from the twelve on `/essentials`, so it needs its own `@id`, its own name
 * and its own `inDefinedTermSet` back-reference. Publishing both under
 * `/essentials#glossary` would merge a hundred curriculum terms into the
 * twelve-term beginner list and make both nodes describe neither.
 *
 * The defaults are the `/essentials` set, so its call site is unchanged.
 */
export function definedTermSetJsonLd<T extends { en: string; ar: string; body: string }>(
  terms: readonly T[],
  termUrl: (term: T) => string,
  options: { id?: string; name?: string; description?: string } = {},
) {
  if (terms.length === 0) return null;

  const setId = options.id ?? absolute('/essentials#glossary');
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': setId,
    name: options.name ?? copy.essentials.listTitle,
    description: options.description ?? copy.essentials.listLead,
    inLanguage: 'ar',
    publisher: organizationRef(),
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      name: term.ar,
      alternateName: term.en,
      description: term.body,
      inDefinedTermSet: { '@id': setId },
      url: termUrl(term),
    })),
  };
}

/**
 * `Quiz` — the practice questions an article publishes, with their answers.
 *
 * ## Why a Quiz and not an FAQPage
 *
 * «نماذج أسئلة بالإجابات» is twenty multiple-choice questions and six essay
 * ones, and an `FAQPage` would describe every one of them as a question the
 * SITE is answering about itself. `Quiz`/`Question` is the vocabulary that says
 * what these actually are — a practice set on a named subject, where each item
 * has options and exactly one of them is right. It is also the shape Google's
 * education "practice problems" result reads, though that is a bonus rather
 * than the point: the point is that an assistant asked «نماذج أسئلة على منهج
 * البرمجة بكالوريا» gets labelled questions with labelled answers instead of a
 * numbered list it has to parse and an answer key it has to correlate.
 *
 * ⚠️ `acceptedAnswer` is REQUIRED on every question this emits, and
 * `questionsFromBlocks` drops any question whose key entry is missing for
 * exactly that reason. A `Question` with no accepted answer invites an
 * assistant to supply one and attribute it here.
 *
 * ⚠️ `suggestedAnswer` is emitted ONLY for multiple choice. On an essay
 * question there are no options, and an empty `suggestedAnswer: []` is a claim
 * that the question has no possible answers rather than no enumerated ones.
 */
export function quizJsonLd(
  questions: ReadonlyArray<{
    question: string;
    options: readonly string[];
    answerIndex: number;
    answer: string;
  }>,
  options: { id: string; name: string; about?: string | null },
) {
  if (questions.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    '@id': options.id,
    name: options.name,
    inLanguage: 'ar',
    // The course the questions are drawn from, when the article names one.
    // Omitted rather than guessed: `about` is what an engine matches the quiz
    // to a topic on, and «البرمجة» inferred from a title is not a topic the
    // article asserted.
    ...(options.about ? { about: { '@type': 'Thing', name: options.about } } : {}),
    publisher: organizationRef(),
    hasPart: questions.map((row) => ({
      '@type': 'Question',
      // `learningResourceType` is what separates a practice problem from a
      // support FAQ for every consumer of this markup.
      learningResourceType: 'Practice problem',
      ...(row.options.length > 0 ? { eduQuestionType: 'Multiple choice' } : {}),
      // `name` and `text` carry the same string deliberately — Google reads
      // `name`, schema.org's own definition puts the question body in `text`,
      // and there is only one question here to put in both.
      name: row.question,
      text: row.question,
      inLanguage: 'ar',
      ...(row.options.length > 0
        ? {
            suggestedAnswer: row.options.map((option, index) => ({
              '@type': 'Answer',
              position: index,
              text: option,
            })),
          }
        : {}),
      acceptedAnswer: {
        '@type': 'Answer',
        ...(row.answerIndex >= 0 ? { position: row.answerIndex } : {}),
        text: row.answer,
      },
    })),
  };
}

export function faqPageJsonLd(rows: ReadonlyArray<{ questionAr: string; answerAr: string }>) {
  if (rows.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    // Ties the Q&A to the site entity rather than leaving it a free-floating
    // document, for the same reason the `@id`s above exist.
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: rows.map((row) => ({
      '@type': 'Question',
      name: row.questionAr,
      acceptedAnswer: { '@type': 'Answer', text: row.answerAr },
    })),
  };
}
