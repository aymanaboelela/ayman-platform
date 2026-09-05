import { describe, expect, it } from 'vitest';
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
  publishedAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
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

describe('courseJsonLd', () => {
  it('marks the course free and Arabic, with an absolute URL', () => {
    const data = courseJsonLd(course());
    expect(data['@type']).toBe('Course');
    expect(data.inLanguage).toBe('ar');
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.offers?.price).toBe('0');
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
