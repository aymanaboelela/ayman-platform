import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogList } from '@ayman/contracts/catalog';
import type { BookCatalog } from '@ayman/contracts/books';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import type { HomeBlock, HomeBlockProps } from '@ayman/contracts/admin/home-blocks';

/**
 * «الترمينال» — which section carries the page's single `<h1>`.
 *
 * ## Why this is a second file
 *
 * `neon-landing.test.ts` reads the SOURCE: it catches a CSS selector that
 * escapes the preset root, a `default` arm added to the exhaustive switch, and
 * an import of Ayman's assets. Those are textual properties and reading the
 * text is the right tool for them.
 *
 * The heading decision is not textual. It is a function of the tenant's stored
 * block list crossed with whether their catalogue and shop happen to be empty,
 * and it was WRONG in a way no reading of the file would show:
 *
 *   · `hasHeading` returned `true` for `books` — `BooksPropsSchema.titleAr` is
 *     `.min(2)`, so the title is never blank and the check never failed — while
 *     `<NeonBooks>` returns `null` on an empty shop. Most instructors never
 *     sell a book, so on most stacks "the h1 lives in the books strip" meant
 *     the page had no h1.
 *   · `hasHeading` returned `true` for `yearTracks` unconditionally, because it
 *     is placement-only and there was nothing to check, while `<NeonTracks>`
 *     stands down entirely on an empty catalogue — the state of every stack on
 *     its first day, and `NEUTRAL_FALLBACK_BLOCKS` is hero + courseGrid +
 *     yearTracks, so an admin who deletes the hero lands straight on it.
 *
 * A page with no `<h1>` is reported by axe, costs the page its heading in every
 * search result, and leaves anyone navigating by headings with nothing to land
 * on. Nothing in the repository caught it: `e2e/a11y.e2e.ts` visits Ayman's
 * page, which is not on this preset and always has a hero.
 *
 * ## It reads the element tree rather than rendering
 *
 * `<NeonLanding>` returns a tree whose children are async server components;
 * React's DOM renderer cannot render those. But the decision under test lives
 * entirely in the parent — which block index is handed `level={1}` — and the
 * returned tree is just data. `<BoardLanding>`'s own suite splits the same way
 * and for the same reason.
 */

const getCatalogOrEmpty = vi.fn<() => Promise<CatalogList>>();
const getBookCatalogOrEmpty = vi.fn<() => Promise<BookCatalog>>();
const getBranding = vi.fn<() => Promise<BrandingRead>>();

/* The three cached loaders. Mocked for RESOLUTION, not behaviour: nothing
   below invokes a section, but importing `neon-landing` loads every section's
   module and each of those reaches a `'use cache'` file. */
vi.mock('@/lib/catalog', () => ({ getCatalogOrEmpty: () => getCatalogOrEmpty() }));
vi.mock('@/lib/books', () => ({ getBookCatalogOrEmpty: () => getBookCatalogOrEmpty() }));
vi.mock('@/lib/settings', () => ({ getBranding: () => getBranding() }));

/* `neon-landing` reaches this for the `faq` arm's structured data alone, and
   the module does real work at LOAD time — it builds absolute URLs out of the
   site origin, which is a different subsystem with its own suite. Which block
   index is handed `level={1}` has nothing to do with any of it, so the payload
   is stubbed rather than computed. */
vi.mock('@/lib/seo/jsonld', () => ({ faqPageJsonLd: () => ({}) }));

const { default: NeonLanding } = await import('./neon-landing');

beforeEach(() => {
  getCatalogOrEmpty.mockResolvedValue({ courses: [], total: 0 });
  getBookCatalogOrEmpty.mockResolvedValue({
    shelves: [],
    shippingCents: 0,
    // Added to the contract by #390 (shipping by governorate). Zeroes, not
    // real rates: this fixture is the EMPTY shop.
    shippingRates: { cairo_giza: 0, delta: 0, far: 0 },
    total: 0,
  });
});

/* ---------------------------------------------------------------- fixtures */

let seq = 0;
function block(props: HomeBlockProps): HomeBlock {
  seq += 1;
  return {
    id: `block-${seq}`,
    key: `${props.type}-${seq}`,
    position: seq,
    isPublished: true,
    props,
    imageKey: null,
  };
}

const HERO: HomeBlockProps = {
  type: 'hero',
  eyebrowAr: 'منصة تعليمية',
  headlineAr: 'اسم المنصة',
  subheadlineAr: '',
  rotatingAr: [],
  leadAr: '',
  ctaLabelAr: 'ابدأ',
  ctaHref: '/register',
  secondaryCtaLabelAr: '',
  secondaryCtaHref: '/courses',
  stats: [],
  imageAssetId: null,
};

const COURSE_GRID: HomeBlockProps = {
  type: 'courseGrid',
  titleAr: 'الكورسات',
  leadAr: '',
  ctaLabelAr: '',
  courseIds: [],
  limit: 3,
};

/** `titleAr` is `.min(2)`, so this block's title is NEVER blank — which is
 *  exactly why a title check could not protect the h1 from it. */
const BOOKS: HomeBlockProps = {
  type: 'books',
  titleAr: 'الكتب',
  leadAr: '',
  ctaLabelAr: '',
  limit: 3,
};

const YEAR_TRACKS: HomeBlockProps = { type: 'yearTracks' };

const CTA: HomeBlockProps = {
  type: 'cta',
  headlineAr: 'يلا نبدأ',
  leadAr: '',
  ctaLabelAr: 'سجّل',
  ctaHref: '/register',
};

/**
 * Every element the page produced, flattened: `body.map()` sits as ONE child of
 * `<main>`, so reading `children` naively finds an array where the sections are.
 */
function sectionsOf(page: ReactElement): ReactElement[] {
  const children = (page.props as { children: unknown }).children;
  const flat = (Array.isArray(children) ? children : [children]).flat(3);
  return flat.filter((child): child is ReactElement => Boolean(child) && typeof child === 'object');
}

/** The heading level each section was handed, in render order. */
function levelsOf(page: ReactElement): (number | undefined)[] {
  return sectionsOf(page).map((section) => (section.props as { level?: number }).level);
}

/* -------------------------------------------------------------------- specs */

describe('NeonLanding — the page heading', () => {
  it('gives the h1 to the hero, and exactly one section gets it', async () => {
    const page = await NeonLanding({
      blocks: [block(HERO), block(COURSE_GRID)],
      honorBoard: [],
    });

    // hero, courses, steps
    expect(levelsOf(page)).toEqual([1, 2, 2]);
  });

  it('gives it to the first certain heading when the tenant deleted the hero', async () => {
    const page = await NeonLanding({ blocks: [block(COURSE_GRID)], honorBoard: [] });

    expect(levelsOf(page)).toEqual([1, 2]);
  });

  /**
   * ⚠️ `<NeonBooks>` renders NOTHING when the shop is empty, when every title
   * is off the landing page, or when the API is unreachable. If it could own
   * the page heading, a book going out of print would delete the `<h1>`.
   */
  it('never gives the h1 to the books strip, even though its title is never blank', async () => {
    const page = await NeonLanding({
      blocks: [block(BOOKS), block(COURSE_GRID)],
      honorBoard: [],
    });

    expect(levelsOf(page)).toEqual([2, 1, 2]);
  });

  /**
   * ⚠️ `<NeonTracks>` stands down entirely on an empty catalogue, which is
   * every stack's first day. It used to qualify unconditionally — placement
   * blocks have no props to check — so `[yearTracks]` produced a page with a
   * heading owner that rendered nothing and therefore no `<h1>` anywhere.
   */
  it('never gives the h1 to the year tracks, which stand down on an empty catalogue', async () => {
    const page = await NeonLanding({ blocks: [block(YEAR_TRACKS)], honorBoard: [] });

    // tracks, then `<NeonSteps>` — which always renders, and takes the h1.
    expect(levelsOf(page)).toEqual([2, 1]);
  });

  /**
   * The backstop, and the reason the two cases above are safe to refuse: this
   * page always ends with «إزاي بتشتغل», so there is always a real, visible
   * section left to carry the heading. `<BoardLanding>` needs an `sr-only`
   * fallback for the same job because it has no such unconditional section.
   */
  it('falls back to the steps section when no block can certainly carry one', async () => {
    const page = await NeonLanding({
      blocks: [block(BOOKS), block(YEAR_TRACKS)],
      honorBoard: [],
    });

    const levels = levelsOf(page);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels.at(-1)).toBe(1);
  });

  /**
   * A page that is nothing but a closer still gets its heading, and it goes to
   * the closer rather than to the steps section — `<NeonCta>` renders an `<h1>`
   * at `level={1}` precisely for this case, and the alternative would be the
   * page's strongest heading sitting above the one thing the tenant published.
   */
  it('lets a lone cta own it, with the steps section demoted', async () => {
    const page = await NeonLanding({ blocks: [block(CTA)], honorBoard: [] });

    // `<NeonSteps>` is rendered BEFORE a trailing cta — see `closer`.
    expect(levelsOf(page)).toEqual([2, 1]);
  });

  it('emits exactly one h1 for the neutral fallback list a new tenant starts on', async () => {
    const page = await NeonLanding({
      blocks: [block(HERO), block(COURSE_GRID), block(YEAR_TRACKS)],
      honorBoard: [],
    });

    expect(levelsOf(page).filter((level) => level === 1)).toHaveLength(1);
  });
});
