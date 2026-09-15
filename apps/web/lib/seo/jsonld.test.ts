import { describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import {
  ORGANIZATION_ID,
  PERSON_ID,
  SITE_URL,
  WEBSITE_ID,
  articleJsonLd,
  breadcrumbJsonLd,
  courseJsonLd,
  courseListJsonLd,
  definedTermSetJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  personJsonLd,
  secondsToIso8601Duration,
  videoObjectJsonLd,
  webSiteJsonLd,
} from './jsonld';

/**
 * ⚠️ The fixture is PRICED, like every course actually published. It used to
 * carry no price fields at all, which is how `courseJsonLd` shipped
 * `isAccessibleForFree: true` on a course whose own page renders «١٥٠ ج /
 * الشهر» — the assertion below said "free" and agreed with the code, and both
 * were wrong about the site. A free course is the `freeCourse()` case.
 */
const course = (overrides = {}) => ({
  id: '0192f000-0000-7000-8000-000000000001',
  slug: 'programming-year-2',
  title: 'البرمجة وعلوم الحاسب',
  subtitle: 'الصف الثاني الثانوي',
  description: 'وصف الكورس',
  systemNameAr: 'البكالوريا المصرية',
  subjectNameAr: 'البرمجة وعلوم الحاسب',
  trackLabelAr: 'الهندسة وعلوم الحاسب',
  year: 2,
  lessonCount: 12,
  totalSeconds: 7200,
  monthlyPriceCents: 15000,
  quarterlyPriceCents: 30000,
  yearlyPriceCents: 95000,
  terms: [{ title: 'الترم الأول', priceCents: 45000 }],
  publishedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ...overrides,
});

/** The foundation course: nothing priced, so «الكورس ده مفتوح مجانًا» is true. */
const freeCourse = (overrides = {}) =>
  course({
    slug: 'programming-foundation',
    monthlyPriceCents: null,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    terms: [],
    ...overrides,
  });

describe('secondsToIso8601Duration', () => {
  it.each([
    [0, 'PT0S'],
    [1, 'PT1S'],
    [59, 'PT59S'],
    [60, 'PT1M'],
    [90, 'PT1M30S'],
    [3600, 'PT1H'],
    [3661, 'PT1H1M1S'],
    [7200, 'PT2H'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(secondsToIso8601Duration(seconds)).toBe(expected);
  });
});

describe('courseListJsonLd', () => {
  it('returns null below three items — Google needs ≥3 for the list rich result', () => {
    expect(courseListJsonLd([course()])).toBeNull();
    expect(courseListJsonLd([course(), course({ slug: 'b' })])).toBeNull();
  });

  it('emits an ItemList of Course items at three or more', () => {
    const data = courseListJsonLd([
      course(),
      course({ slug: 'b', id: 'b' }),
      course({ slug: 'c', id: 'c' }),
    ]);
    expect(data?.['@type']).toBe('ItemList');
    expect(data?.itemListElement).toHaveLength(3);
    expect(data?.itemListElement[0]?.item['@type']).toBe('Course');
    expect(data?.itemListElement[0]?.position).toBe(1);
  });
});

/**
 * `json-ld.tsx` emits ONE `<script>` per call, so on an article page the
 * `Person` node the `author` points at is in a different block entirely. A
 * consumer that does not walk `@id`s across blocks — most of them, and every
 * assistant reading the raw HTML — saw an author with no name.
 */
describe('references to the site-wide entities', () => {
  it('names the instructor on a standalone course and keeps the @id', () => {
    const instructor = courseJsonLd(course()).instructor;
    expect(instructor).toMatchObject({ '@id': PERSON_ID, '@type': 'Person' });
    expect(instructor?.name).toBe(copy.site.name);
  });

  it('leaves a nested catalog item bare — the list names him per row already', () => {
    expect(courseJsonLd(course(), { nested: true }).instructor).toEqual({ '@id': PERSON_ID });
  });

  it('names the author and the publisher on an article', () => {
    const data = articleJsonLd({
      slug: 'a',
      title: 'ت',
      excerpt: 'و',
      publishedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(data.author).toMatchObject({ '@id': PERSON_ID, name: copy.site.name });
    expect(data.publisher).toMatchObject({ '@id': ORGANIZATION_ID });
  });
});

/**
 * The name query — «أيمن أبو العلا» — is the whole reason the `Person` node
 * exists. It used to answer with «المهندس أيمن أبو العلا», a title glued to a
 * name in the one field whose job is to be the name.
 */
describe('personJsonLd name parts', () => {
  it('carries the bare name, with the title in honorificPrefix', () => {
    const data = personJsonLd();
    expect(data.name).toBe(copy.site.name);
    expect(data.name).not.toContain(copy.seo.personHonorific);
    expect(data.honorificPrefix).toBe(copy.seo.personHonorific);
  });

  /** «أبو العلا» is ONE family name of two words; every whitespace split gets it wrong. */
  it('states both words of the family name rather than leaving it to be split', () => {
    expect(personJsonLd().familyName).toBe('أبو العلا');
    expect(personJsonLd().givenName).toBe('أيمن');
  });
});

describe('courseJsonLd', () => {
  /**
   * ⚠️ The order and the membership must match the price block on
   * `(site)/courses/[slug]/page.tsx` — monthly, quarterly, each term, yearly.
   * Structured data is a machine-readable copy of the page; a plan here that is
   * not there is a contradiction no validator can see.
   */
  it('publishes one Offer per plan the page renders, in the page order', () => {
    const offers = courseJsonLd(course()).offers;
    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toEqual([
      expect.objectContaining({ price: '150.00', priceCurrency: 'EGP' }),
      expect.objectContaining({ price: '300.00', priceCurrency: 'EGP' }),
      expect.objectContaining({ price: '450.00', name: 'الترم الأول' }),
      expect.objectContaining({ price: '950.00', priceCurrency: 'EGP' }),
    ]);
  });

  /**
   * The regression this pair exists for: a paid course published as free is a
   * wrong answer an assistant gives in its own voice, and the student finds out
   * at the paywall.
   */
  it('never calls a priced course free', () => {
    expect(courseJsonLd(course()).isAccessibleForFree).toBe(false);
  });

  it('states the free case rather than omitting it', () => {
    const data = courseJsonLd(freeCourse());
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers).toMatchObject({ price: '0', priceCurrency: 'EGP', category: 'Free' });
  });

  it('prefers the instructor description over the repeated subtitle', () => {
    expect(courseJsonLd(course({ description: 'شرح المنهج الرسمي' })).description).toBe(
      'شرح المنهج الرسمي',
    );
    expect(courseJsonLd(course({ description: null })).description).toBe('الصف الثاني الثانوي');
  });

  it('is Arabic, with an absolute URL', () => {
    const data = courseJsonLd(course());
    expect(data['@type']).toBe('Course');
    expect(data.inLanguage).toBe('ar');
    expect(data.url).toMatch(/^https?:\/\/.+\/courses\/programming-year-2$/);
    // `EducationalOrganization`, a strict subtype of `Organization` — it is
    // what tells a crawler this is a school rather than a company with a site.
    expect(data.provider?.['@type']).toBe('EducationalOrganization');
    // Not an anonymous per-course organisation: the `@id` ties every course
    // page back to the ONE entity the root layout emits site-wide, so their
    // signal accumulates on it instead of being split across N duplicates.
    expect(data.provider?.['@id']).toBe(ORGANIZATION_ID);
    expect(data.instructor?.['@id']).toBe(PERSON_ID);
  });
});

/**
 * The entity graph. These three exist to answer a NAME query — "أيمن أبو
 * العلا" — which the course/catalog structured data cannot do on its own.
 */
describe('the entity graph', () => {
  it('cross-references the three entities by stable @id', () => {
    expect(personJsonLd()['@id']).toBe(PERSON_ID);
    expect(organizationJsonLd()['@id']).toBe(ORGANIZATION_ID);
    expect(webSiteJsonLd()['@id']).toBe(WEBSITE_ID);

    expect(personJsonLd().worksFor).toEqual({ '@id': ORGANIZATION_ID });
    expect(organizationJsonLd().founder).toEqual({ '@id': PERSON_ID });
    expect(webSiteJsonLd().publisher).toEqual({ '@id': ORGANIZATION_ID });
  });

  it('knows about the subject it actually teaches', () => {
    // The regression this replaces: `knowsAbout` listed «الخوارزميات» and
    // «قواعد البيانات» — neither is a Bakalorya unit — and did NOT list
    // «الذكاء الاصطناعي», which is half the subject's official name. A student
    // asking who teaches الذكاء الاصطناعي for البكالوريا matched nothing.
    const knowsAbout = personJsonLd().knowsAbout;
    expect(knowsAbout).toContain('الذكاء الاصطناعي');
    expect(knowsAbout).toContain('الأمن السيبراني');
    expect(knowsAbout).toContain('تطبيقات الويب');
  });

  it('states the credentials as facts, and states them once', () => {
    // `hasOccupation` and `alumniOf` are what make this a person who teaches
    // the subject rather than a person with a site about it. The university
    // must carry its Arabic name — an entity called only «MTI» matches nothing
    // in an Arabic query.
    const person = personJsonLd();
    expect(person.hasOccupation.name).toBe(copy.seo.jobTitle);
    expect(person.alumniOf.name).toBe(copy.seo.alumniOfName);
    expect(person.alumniOf.name).toMatch(/[\u0600-\u06FF]/);
    // No unverifiable boast in the one node a consumer trusts without checking.
    expect(person).not.toHaveProperty('award');
    expect(person).not.toHaveProperty('hasCredential');
  });

  it('carries the hamza-less spellings students actually type', () => {
    // The whole reason `alternateName` exists here. Egyptians type
    // `ايمن ابو العلا`, not `أيمن أبو العلا`, and Google's Arabic normaliser
    // is not reliable enough on proper nouns to bet the brand query on it.
    for (const entity of [personJsonLd(), organizationJsonLd(), webSiteJsonLd()]) {
      expect(entity.alternateName).toContain('ايمن ابو العلا');
      expect(entity.alternateName).toContain('منصه ايمن ابو العلا');
      expect(entity.alternateName).toContain('أيمن أبو العلا');
    }
  });

  it('publishes a contact only when there is one', () => {
    /*
     * ⚠️ The default must be ABSENT, not null. `getPublicSettingsOrDefaults`
     * returns `contact: {}` throughout `next build` — the API is unreachable
     * inside the image build — so for the first minutes after every deploy this
     * builder runs with nothing ([[build-bakes-empty-settings-cache]] is the
     * same mechanism). A missing optional field for those minutes is harmless;
     * `telephone: null` in a knowledge graph is an assertion that the school
     * has no phone.
     */
    expect(organizationJsonLd()).not.toHaveProperty('telephone');
    expect(organizationJsonLd({})).not.toHaveProperty('telephone');
    expect(organizationJsonLd({ whatsapp: null, phone: null, email: null })).not.toHaveProperty(
      'email',
    );

    // WhatsApp wins over `phone`: it is the number the footer shows and the one
    // a parent actually reaches him on.
    expect(organizationJsonLd({ whatsapp: '+201021196367', phone: '+20222222222' })).toMatchObject({
      telephone: '+201021196367',
    });
    expect(organizationJsonLd({ phone: '+20222222222' })).toMatchObject({
      telephone: '+20222222222',
    });
  });

  it('turns the WhatsApp number into a door, not just a string', () => {
    // A `telephone` is something to display; a `ContactPoint` with a `url` is
    // something an assistant can hand a student. Every enrolment here starts on
    // WhatsApp, so this is the one contact field that does real work.
    expect(organizationJsonLd({ whatsapp: '+201021196367' })).toMatchObject({
      contactPoint: { '@type': 'ContactPoint', url: 'https://wa.me/201021196367' },
    });

    /*
     * ⚠️ And it must vanish rather than degrade. `waMeHref` answers null for
     * anything that is not E.164, so a number typed wrong in /admin/settings
     * publishes no link at all instead of one that opens WhatsApp on nobody —
     * while `telephone` still ships, because a wrong-looking number is still
     * the number the admin entered.
     */
    const typo = organizationJsonLd({ whatsapp: '01021196367' });
    expect(typo).not.toHaveProperty('contactPoint');
    expect(typo).toMatchObject({ telephone: '01021196367' });

    // `phone` alone is a landline-shaped number, not a WhatsApp account.
    expect(organizationJsonLd({ phone: '+20222222222' })).not.toHaveProperty('contactPoint');
  });

  it('never claims a `sameAs` it cannot back up', () => {
    // The footer links to `https://www.youtube.com/` and
    // `https://www.facebook.com/` — bare platform homepages, not this
    // instructor's channels. Publishing those as `sameAs` would assert to
    // Google that this site IS YouTube. An absent `sameAs` is the honest
    // answer until real handles exist; an EMPTY one is a claim of "none".
    for (const entity of [personJsonLd(), organizationJsonLd()]) {
      const sameAs = (entity as { sameAs?: readonly string[] }).sameAs;
      if (sameAs === undefined) continue;
      expect(sameAs.length).toBeGreaterThan(0);
      for (const url of sameAs) {
        expect(url).toMatch(/^https:\/\/[^/]+\/.+/);
        expect(url).not.toMatch(/^https:\/\/(www\.)?(youtube|facebook|tiktok|whatsapp)\.com\/?$/);
      }
    }
  });

  it('declares no SearchAction — /courses ignores every query parameter', () => {
    // A sitelinks searchbox needs a URL template that really searches. The
    // catalogue renders in full and reads no `q`, so declaring one would be a
    // promise the site cannot keep. Delete this test the day search ships.
    expect(JSON.stringify(webSiteJsonLd())).not.toContain('SearchAction');
  });
});

describe('videoObjectJsonLd', () => {
  it('uses the reconstructed nocookie embed and an ISO-8601 duration', () => {
    const data = videoObjectJsonLd({
      externalId: 'dQw4w9WgXcQ',
      name: 'المقدمة',
      description: 'وصف',
      durationSeconds: 305,
      uploadDate: '2026-07-01T00:00:00.000Z',
    });
    expect(data.embedUrl).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(data.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(data.duration).toBe('PT5M5S');
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers positions from 1 and absolutises every item', () => {
    const data = breadcrumbJsonLd([
      { name: 'الرئيسية', path: '/' },
      { name: 'الكورسات', path: '/courses' },
    ]);
    expect(data.itemListElement[0]?.position).toBe(1);
    expect(data.itemListElement[1]?.item).toMatch(/\/courses$/);
  });
});

describe('the whole JSON-LD surface', () => {
  /**
   * Was "never emits FAQPage" until 2026-08-12. `faqPageJsonLd` now exists on
   * purpose (see its doc comment), so the assertion moved rather than went
   * away: FAQPage is legitimate in exactly one builder, and a `Question` that
   * turns up inside the organisation or a course is still the bug the original
   * test was written to catch.
   */
  it('emits FAQPage from the FAQ builder and from nowhere else', () => {
    const everythingElse = JSON.stringify([
      organizationJsonLd(),
      personJsonLd(),
      webSiteJsonLd(),
      courseListJsonLd([course(), course({ slug: 'b' }), course({ slug: 'c' })]),
      courseJsonLd(course()),
      breadcrumbJsonLd([{ name: 'الرئيسية', path: '/' }]),
    ]);
    expect(everythingElse).not.toContain('FAQPage');
    expect(everythingElse).not.toContain('Question');
  });
});

describe('faqPageJsonLd', () => {
  const first = {
    questionAr: 'مش عارف حاجة عن البرمجة خالص — أبدأ منين؟',
    answerAr: 'من مسار التأسيس.',
  };
  const second = { questionAr: 'هتفرّج بس ولا هكتب بإيدي؟', answerAr: 'هتكتب من أول محاضرة.' };

  it('pairs every row as a Question with its acceptedAnswer', () => {
    expect(faqPageJsonLd([first, second])).toMatchObject({
      '@type': 'FAQPage',
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: [
        {
          '@type': 'Question',
          name: first.questionAr,
          acceptedAnswer: { '@type': 'Answer', text: first.answerAr },
        },
        {
          '@type': 'Question',
          name: second.questionAr,
          acceptedAnswer: { '@type': 'Answer', text: second.answerAr },
        },
      ],
    });
  });

  /**
   * `JsonLd` renders nothing for `null`. An FAQPage with an empty `mainEntity`
   * is a document claiming to answer questions and listing none — worse than
   * absent, because it is valid enough to be believed.
   */
  it('returns null rather than an empty FAQPage', () => {
    expect(faqPageJsonLd([])).toBeNull();
  });
});

describe('definedTermSetJsonLd', () => {
  const terms = [
    { en: 'Variable', ar: 'متغيّر', body: 'اسم بتحطّ فيه قيمة.' },
    { en: 'Input / Output', ar: 'إدخال وإخراج', body: 'الكلام الداخل والخارج.' },
  ];
  const termUrl = (t: { en: string }) =>
    `${SITE_URL}/essentials#${t.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  it('names the Arabic term and keeps the English keyword as alternateName', () => {
    const data = definedTermSetJsonLd(terms, termUrl);
    expect(data).toMatchObject({
      '@type': 'DefinedTermSet',
      inLanguage: 'ar',
      hasDefinedTerm: [
        { '@type': 'DefinedTerm', name: 'متغيّر', alternateName: 'Variable' },
        { '@type': 'DefinedTerm', name: 'إدخال وإخراج', alternateName: 'Input / Output' },
      ],
    });
  });

  /** Every term must point back at the set, or the twelve read as unrelated. */
  it('ties every term to the set @id and to a resolvable anchor', () => {
    const data = definedTermSetJsonLd(terms, termUrl);
    const setId = `${SITE_URL}/essentials#glossary`;
    expect(data?.['@id']).toBe(setId);
    for (const term of data?.hasDefinedTerm ?? []) {
      expect(term.inDefinedTermSet).toEqual({ '@id': setId });
      expect(term.url).toMatch(/^https?:\/\/.+\/essentials#[a-z0-9-]+$/);
    }
  });

  it('returns null rather than an empty set', () => {
    expect(definedTermSetJsonLd([], termUrl)).toBeNull();
  });
});

/**
 * `image` is what turns an article result into one with a picture, and it is
 * the field most likely to be quietly dropped: the cover is optional on the
 * post, so the property has to appear only when there is one. A
 * `"image": null` in the payload is a validator ERROR, where a missing
 * optional is simply missing — which is why this asserts the KEY is absent,
 * not that its value is falsy.
 */
describe('articleJsonLd', () => {
  const post = {
    slug: 'شرح-درس-كيف-يعمل-الذكاء-الاصطناعي',
    title: 'كيف يعمل الذكاء الاصطناعي',
    excerpt: 'شرح الدرس الثاني: العلاقة بين AI و ML و DL و GenAI.',
    publishedAt: '2026-09-05T06:00:00.000Z',
    updatedAt: '2026-09-05T07:00:00.000Z',
  };

  it('carries the cover as an image array when the article has one', () => {
    const data = articleJsonLd({ ...post, image: 'https://media.example.com/a/b.webp' });
    expect(data.image).toEqual(['https://media.example.com/a/b.webp']);
  });

  it('omits the key entirely — not null — when there is no cover', () => {
    for (const image of [null, undefined]) {
      expect(articleJsonLd({ ...post, image })).not.toHaveProperty('image');
    }
    expect(articleJsonLd(post)).not.toHaveProperty('image');
  });

  /** `datePublished` must never track edits, or every typo fix reads as a new article. */
  it('keeps datePublished and dateModified apart', () => {
    const data = articleJsonLd(post);
    expect(data.datePublished).toBe(post.publishedAt);
    expect(data.dateModified).toBe(post.updatedAt);
  });
});
