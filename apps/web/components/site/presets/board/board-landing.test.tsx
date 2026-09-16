import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogCourse, CatalogList } from '@ayman/contracts/catalog';
import type { BookCatalog } from '@ayman/contracts/books';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import type { HomeBlock, HomeBlockProps } from '@ayman/contracts/admin/home-blocks';

/**
 * «اللوح» — the states that are not visible from reading the components.
 *
 * ## What this file is actually guarding
 *
 * Three things, and all three are about a page nobody will look at until it is
 * already live on somebody's domain:
 *
 * 1. **The empty database.** A brand-new instructor's catalogue and shop are
 *    both empty for days, and that page IS the first thing their students see.
 *    The course grid must NOT stand down (the classic one does), the books
 *    strip must, the instructor band must print a sentence instead of three
 *    zeroes, and the honour board must print one line instead of four reserved
 *    places. Each of those is a deliberate and opposite call, which is exactly
 *    the kind of thing a later refactor "tidies" into consistency.
 *
 * 2. **Exactly one `<h1>`.** `home_blocks` is a list a tenant composes, so the
 *    page cannot assume a hero is present or first. The mechanism that decides
 *    which section carries the page heading is pure and is pinned here.
 *
 * 3. **No identity that is not this deployment's.** The mark renders the
 *    tenant's own uploaded logo and nothing else.
 *
 * ## Why the page itself is inspected rather than rendered
 *
 * `<BoardLanding>` returns a tree whose children are async server components.
 * React's DOM renderer cannot render those — only the RSC renderer can — so
 * the whole-page assertions below read the returned ELEMENT tree (which is
 * just data) and the section assertions render each section on its own, the
 * way `books-strip.test.tsx` already does. Neither half is a compromise: the
 * element tree is where the heading decision lives, and the sections are where
 * the empty states live.
 */

/** This directory, and the marketing surface's stylesheet folder. */
const HERE = join(import.meta.dirname);
const WEB_STYLES = join(HERE, '..', '..', '..', '..', 'app', '(site)', 'styles');

/** Prose about a rule is neither a rule nor an import — strip it on both
 *  sides before any of the source scans below run. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const getCatalogOrEmpty = vi.fn<() => Promise<CatalogList>>();
const getBookCatalogOrEmpty = vi.fn<() => Promise<BookCatalog>>();
const getBranding = vi.fn<() => Promise<BrandingRead>>();

vi.mock('@/lib/catalog', () => ({ getCatalogOrEmpty: () => getCatalogOrEmpty() }));
vi.mock('@/lib/books', () => ({ getBookCatalogOrEmpty: () => getBookCatalogOrEmpty() }));
vi.mock('@/lib/settings', () => ({ getBranding: () => getBranding() }));

/* Generated course art resolves a storage key through `next/image` and has
   nothing to say about any decision below. */
vi.mock('@/components/course-art', () => ({ CourseArt: () => null }));
vi.mock('@/components/app/user-avatar', () => ({ UserAvatar: () => null }));

/* `next/image` needs a loader and a config this harness has no reason to
   carry; what matters here is only WHICH src the mark chose, so the stub keeps
   it as a plain `<img>`. */
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { default: BoardLanding } = await import('./board-landing');
const { BoardCourses } = await import('./board-courses');
const { BoardBooks } = await import('./board-books');
const { BoardInstructor } = await import('./board-instructor');
const { BoardHonors } = await import('./board-honors');
const { BoardYears } = await import('./board-years');
const { BoardMark } = await import('./board-mark');

afterEach(cleanup);

beforeEach(() => {
  getCatalogOrEmpty.mockReset();
  getBookCatalogOrEmpty.mockReset();
  getBranding.mockReset();

  getCatalogOrEmpty.mockResolvedValue({ courses: [], total: 0 });
  getBookCatalogOrEmpty.mockResolvedValue({
    shelves: [],
    shippingCents: 0,
    // Added to the contract by #390 (shipping by governorate) after this spec
    // was written. Zeroes rather than real rates: this fixture is the EMPTY
    // shop, and a price on a shelf that does not exist would be the one number
    // in the file nothing renders.
    shippingRates: { cairo_giza: 0, delta: 0, far: 0 },
    total: 0,
  });
  getBranding.mockResolvedValue(branding());
});

/* ---------------------------------------------------------------- fixtures */

function branding(overrides: Partial<BrandingRead> = {}): BrandingRead {
  return {
    accent: 'amber',
    accentHue: null,
    landingPreset: 'board',
    landingLayout: 'classic',
    radius: 'default',
    logoLightAssetId: null,
    logoDarkAssetId: null,
    faviconAssetId: null,
    logoLightKey: null,
    logoDarkKey: null,
    faviconKey: null,
    ...overrides,
  };
}

function course(n: number, overrides: Partial<CatalogCourse> = {}): CatalogCourse {
  return {
    contentComplete: true,
    id: `2222222${n}-2222-4222-8222-222222222222`,
    slug: `course-${n}`,
    title: `كورس رقم ${n}`,
    subtitle: null,
    systemSlug: 'bacc',
    systemNameAr: 'البكالوريا',
    year: 1,
    trackLabelAr: null,
    subjectNameAr: 'البرمجة',
    coverKey: null,
    lessonCount: 10,
    totalSeconds: 7200,
    forGeneral: true,
    forLanguages: false,
    emphasis: null,
    emphasisNote: null,
    monthlyPriceCents: 25000,
    quarterlyPriceCents: null,
    yearlyPriceCents: null,
    bookTitle: null,
    bookPriceCents: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let blockSeq = 0;
function block(props: HomeBlockProps): HomeBlock {
  blockSeq += 1;
  return {
    id: `block-${blockSeq}`,
    key: `${props.type}-${blockSeq}`,
    position: blockSeq,
    isPublished: true,
    props,
  };
}

const HERO: HomeBlockProps = {
  type: 'hero',
  eyebrowAr: 'منصة تعليمية',
  headlineAr: 'اسم المنصة',
  subheadlineAr: 'مدرّس برمجة',
  rotatingAr: [],
  leadAr: 'كل الشرح في مكان واحد.',
  ctaLabelAr: 'ابدأ',
  ctaHref: '/register',
  secondaryCtaLabelAr: 'الكورسات',
  secondaryCtaHref: '/courses',
  stats: [],
  imageAssetId: null,
};

const COURSE_GRID: HomeBlockProps = {
  type: 'courseGrid',
  titleAr: 'الكورسات',
  leadAr: '',
  ctaLabelAr: 'كل الكورسات',
  courseIds: [],
  limit: 3,
};

const BOOKS: HomeBlockProps = {
  type: 'books',
  titleAr: 'الكتب',
  leadAr: '',
  ctaLabelAr: '',
  limit: 3,
};

/**
 * Every element the page produced, flattened — `blocks.map()` returns an array
 * that sits as one child of `<main>`, so a naive `children` read finds a list
 * rather than the sections.
 */
function sectionsOf(page: ReactElement): ReactElement[] {
  const children = (page.props as { children: unknown }).children;
  const flat = (Array.isArray(children) ? children : [children]).flat(3);
  return flat.filter((child): child is ReactElement => Boolean(child) && typeof child === 'object');
}

/** The Nth section, asserted present — `noUncheckedIndexedAccess` is on. */
function sectionAt(page: ReactElement, index: number): ReactElement {
  const section = sectionsOf(page)[index];
  expect(section, `no section at index ${index}`).toBeTruthy();
  return section!;
}

/** The heading level each section was handed. `undefined` for a section that
 *  does not take one — today only `<BoardCta>`, which may never own the h1. */
function levelsOf(page: ReactElement): (number | undefined)[] {
  return sectionsOf(page).map((section) => (section.props as { level?: number }).level);
}

/* ------------------------------------------------------------------ specs */

describe('BoardLanding — the page heading', () => {
  it('gives the single h1 to the first block that will certainly render one', async () => {
    const page = await BoardLanding({
      blocks: [block(HERO), block(COURSE_GRID)],
      honorBoard: [],
    });

    const levels = levelsOf(page);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
  });

  /**
   * ⚠️ The books strip renders NOTHING when the shop is empty, when every
   * title has been taken off the landing page, or when the API is unreachable.
   * If it were allowed to own the page heading, a book going out of stock
   * would silently delete the `<h1>` from the landing page.
   */
  it('never gives the h1 to the books strip, even when it is first', async () => {
    const page = await BoardLanding({
      blocks: [block(BOOKS), block(COURSE_GRID)],
      honorBoard: [],
    });

    expect(levelsOf(page)).toEqual([2, 1]);
  });

  /**
   * A page composed only of blocks that cannot carry a heading still has to
   * ship an `<h1>`. It is `sr-only` because there is no section on such a page
   * to put a visible one in.
   */
  it('falls back to a hidden h1 when no block can carry one', async () => {
    const page = await BoardLanding({
      blocks: [
        block({
          type: 'cta',
          headlineAr: 'يلا نبدأ',
          leadAr: '',
          ctaLabelAr: 'سجّل',
          ctaHref: '/register',
        }),
      ],
      honorBoard: [],
    });

    const heading = sectionsOf(page).find((s) => s.type === 'h1');
    expect(heading).toBeTruthy();
    expect((heading!.props as { className?: string }).className).toBe('sr-only');
  });

  /**
   * ⚠️ THE EFFECT, NOT THE MECHANISM — and the reason this block exists.
   *
   * Every case above asserts which section was HANDED `level={1}`. That is a
   * property of the element tree and it is exactly as true when the section
   * hands `level` straight to a component that renders nothing: the page then
   * has a heading owner and no `<h1>`, and the `sr-only` fallback above does
   * not fire, because a candidate was found.
   *
   * «الترمينال» shipped with precisely that hole. Its `hasHeading` returned
   * `true` for `books` (`titleAr` is `.min(2)`, so always) and for
   * `yearTracks` (placement-only, so unconditionally), while `<NeonBooks>`
   * stands down on an empty shop and `<NeonTracks>` stands down on an empty
   * catalogue — the day-one state of every new stack. Nothing caught it,
   * because nothing asked whether an `<h1>` came out.
   *
   * So: every type `ownsPageHeading` trusts is rendered here at `level={1}`
   * with the EMPTIEST data it can be given, and asked for its `<h1>`. The four
   * below are the ones whose output depends on a loader; the rest build their
   * heading from props this function has already checked are non-empty.
   */
  describe('every type it trusts really does produce an h1 when the data is empty', () => {
    it('BoardCourses — an empty catalogue keeps the heading above the empty state', async () => {
      const { container } = render(
        await BoardCourses({ title: 'الكورسات', lead: '', ctaLabel: '', limit: 3, courseIds: [], level: 1 }),
      );

      expect(container.querySelector('h1')?.textContent).toBe('الكورسات');
    });

    /** `<BoardYears>` falls back to `FALLBACK_YEARS`, so it never stands down
     *  — which is the single fact that lets `ownsPageHeading` trust
     *  `yearTracks` where «الترمينال» must not. Pinned here so removing that
     *  fallback fails a test instead of deleting the page's heading. */
    it('BoardYears — the two fallback tiles still come under an h1', async () => {
      const { container } = render(await BoardYears({ level: 1 }));

      expect(container.querySelector('h1')).toBeTruthy();
    });

    it('BoardHonors — an empty board still has its heading', () => {
      const { container } = render(<BoardHonors entries={[]} level={1} />);

      expect(container.querySelector('h1')).toBeTruthy();
    });

    it('BoardInstructor — no catalogue, still an h1', async () => {
      const { container } = render(await BoardInstructor({ level: 1 }));

      expect(container.querySelector('h1')).toBeTruthy();
    });

    /** The counterexample, and the reason `books` is excluded: this renders
     *  nothing at all, so a page that gave it the h1 would have none. */
    it('BoardBooks — renders nothing on an empty shop, which is why it may not own the h1', async () => {
      const { container } = render(
        await BoardBooks({ title: 'الكتب', lead: '', ctaLabel: '', limit: 3, level: 1 }),
      );

      expect(container.querySelector('h1')).toBeNull();
      expect(container.firstChild).toBeNull();
    });
  });
});

describe('BoardCourses — the empty catalogue', () => {
  /**
   * ⚠️ THE OPPOSITE OF `<FeaturedCourses>`, ON PURPOSE.
   *
   * That one returns `null` with no courses, which is right on a full
   * catalogue where "empty" means the API is down. Here "empty" means the
   * instructor has not uploaded a lecture yet — the state the database ships
   * in — and the visitor is owed a sentence about when the lessons arrive plus
   * the one action worth taking today.
   */
  it('keeps its heading and offers the account, instead of standing down', async () => {
    const { container } = render(
      await BoardCourses({
        title: 'الكورسات',
        lead: '',
        ctaLabel: 'كل الكورسات',
        limit: 3,
        courseIds: [],
        level: 2,
      }),
    );

    expect(container.innerHTML).not.toBe('');
    expect(screen.getByRole('heading', { name: 'الكورسات' })).toBeTruthy();

    const register = screen.getByRole('link');
    expect(register.getAttribute('href')).toBe('/register');
  });

  /** The «شوف كل الكورسات» button is suppressed: sending somebody to
   *  `/courses` to look at nothing is worse than not offering. */
  it('does not offer the catalogue link while there is no catalogue', async () => {
    render(
      await BoardCourses({
        title: 'الكورسات',
        lead: '',
        ctaLabel: 'كل الكورسات',
        limit: 3,
        courseIds: [],
        level: 2,
      }),
    );

    expect(screen.queryByText('كل الكورسات')).toBeNull();
  });

  it('prices a card from the cheapest plan on sale, the way the card does', async () => {
    getCatalogOrEmpty.mockResolvedValue({
      courses: [course(1, { monthlyPriceCents: null, quarterlyPriceCents: 60000 })],
      total: 1,
    });

    render(
      await BoardCourses({
        title: 'الكورسات',
        lead: '',
        ctaLabel: '',
        limit: 3,
        courseIds: [],
        level: 2,
      }),
    );

    /* `copy.course.priceQuarterly` — the SAME template the course page and the
       classic card use, so one course cannot advertise two prices one click
       apart. */
    expect(screen.getByText('600 ج / ٣ شهور')).toBeTruthy();
  });
});

describe('BoardBooks — the empty shop', () => {
  /**
   * The opposite call to the course grid, and the reason is stated in the
   * component: a platform with no courses has not started yet and owes the
   * reader a sentence; a platform with no books just does not sell books, and
   * «لسه مفيش كتب» announces the absence of something nobody was promised.
   */
  it('renders nothing at all', async () => {
    const { container } = render(
      await BoardBooks({ title: 'الكتب', lead: '', ctaLabel: '', limit: 3, level: 2 }),
    );

    expect(container.innerHTML).toBe('');
  });
});

describe('BoardInstructor — the empty catalogue', () => {
  /** «٠ كورس · ٠ محاضرة · ٠ ساعة» is the most discouraging thing a first
   *  visitor could read, and it is also noise: the counts are only worth
   *  printing once there is something to count. */
  it('prints a sentence instead of a row of zeroes', async () => {
    const { container } = render(await BoardInstructor({ level: 2 }));

    expect(container.querySelector('.board-id__figures')).toBeNull();
    expect(container.querySelector('.board-id__starting')).toBeTruthy();
  });

  it('prints the catalogue’s own arithmetic once there is one', async () => {
    getCatalogOrEmpty.mockResolvedValue({
      courses: [course(1, { lessonCount: 10, totalSeconds: 3600 }), course(2, { lessonCount: 5, totalSeconds: 5400 })],
      total: 2,
    });

    render(await BoardInstructor({ level: 2 }));

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    /* 3600 + 5400 seconds = 2.5 hours, rounded. */
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('BoardHonors — the empty board', () => {
  /**
   * `<HonorBoardSection>` draws four outlined empty places, which is right for
   * a board that was shipped the week before its first exam. On a brand-new
   * deployment a visitor has no reason to read four empty boxes as a promise —
   * `lib/home-blocks.ts` says exactly this in the note explaining why the
   * neutral fallback carries no `honorBoard` block.
   */
  it('says the line once instead of drawing reserved places', () => {
    const { container } = render(<BoardHonors entries={[]} level={2} />);

    expect(container.querySelectorAll('.board-honor')).toHaveLength(0);
    expect(container.querySelector('.board-empty__body')).toBeTruthy();
  });

  it('draws the places once there are names on it', () => {
    const { container } = render(
      <BoardHonors
        entries={[
          {
            studentName: 'طالب مجتهد',
            avatarKey: null,
            quizTitle: 'امتحان الشهر',
            scaledScore: 48,
            gradeOutOf: 50,
            percent: 96,
          },
        ]}
        level={2}
      />,
    );

    expect(container.querySelectorAll('.board-honor')).toHaveLength(1);
    expect(screen.getByText('طالب مجتهد')).toBeTruthy();
  });
});

describe('BoardYears — the tiles', () => {
  /**
   * A brand-new instructor's catalogue is empty, and the tiles are the first
   * real choice this page asks a visitor to make — so they cannot be derived
   * from the catalogue alone. Two is also what they are designed around: they
   * are the loudest object on the page and they earn that by being few.
   */
  it('falls back to the two standard years when nothing is published', async () => {
    const { container } = render(await BoardYears({ level: 2 }));

    const tiles = container.querySelectorAll('.board-tile');
    expect(tiles).toHaveLength(2);
    expect([...container.querySelectorAll('.board-tile__n')].map((n) => n.textContent)).toEqual([
      '1',
      '2',
    ]);
    /* «0 كورس» under a year tile is a worse answer than no line at all, and on
       a fresh install every tile would carry one. */
    expect(container.querySelector('.board-tile__count')).toBeNull();
  });

  /** The moment anything is published the tiles ARE the catalogue, so a tile
   *  can never promise a year the instructor does not teach — and an
   *  instructor who does teach third year gets a third tile with nobody
   *  editing the component. */
  it('is the catalogue’s own years once there is one', async () => {
    getCatalogOrEmpty.mockResolvedValue({
      courses: [course(1, { year: 3 }), course(2, { year: 1 }), course(3, { year: 3 })],
      total: 3,
    });

    const { container } = render(await BoardYears({ level: 2 }));

    expect([...container.querySelectorAll('.board-tile__n')].map((n) => n.textContent)).toEqual([
      '1',
      '3',
    ]);
    expect([...container.querySelectorAll('.board-tile__link')].map((a) => a.getAttribute('href'))).toEqual(
      ['/years/1', '/years/3'],
    );
  });
});

describe('BoardPanel — the opener', () => {
  /**
   * `<SiteNav>` starts transparent on `/` and flips to a solid card once the
   * reader is one header-height past `[data-site-hero]`. With no such element
   * the effect pins it immediately, so the header would render transparent in
   * the server HTML and snap to a card on hydration — a visible jump on the
   * first paint of the first screen. This panel IS the lit stage the header is
   * meant to sit over, and on this preset `<SiteHero>` never renders, so there
   * is no second claimant.
   */
  it('claims the hero attribute the floating header looks for', async () => {
    const page = await BoardLanding({ blocks: [block(HERO)], honorBoard: [] });
    const { container } = render(sectionAt(page, 0));

    expect(container.querySelector('[data-site-hero]')).toBeTruthy();
    expect(container.querySelector('h1')?.textContent).toBe('اسم المنصة');
  });

  /**
   * An admin who cleared `subheadlineAr` and typed rotating phrases instead has
   * a second line that lives ONLY in that array. This preset does not cycle it
   * — no client boundary — but dropping it would be a silent data loss, so the
   * first phrase stands in. That is also exactly what `classic` renders under
   * `prefers-reduced-motion`.
   */
  it('stands the first rotating phrase in for a cleared second line', async () => {
    const page = await BoardLanding({
      blocks: [block({ ...HERO, subheadlineAr: '', rotatingAr: ['من الصفر للاحتراف'] })],
      honorBoard: [],
    });
    const { container } = render(sectionAt(page, 0));

    expect(container.querySelector('.board-panel__role')?.textContent).toBe('من الصفر للاحتراف');
  });
});

describe('BoardMark', () => {
  /**
   * ⚠️ `logoDarkKey` FIRST. The slots are named after the THEME they are shown
   * in, not after the artwork's colour, and this panel is a deep accent fill in
   * BOTH themes — so the asset it needs is the one drawn for a dark ground.
   * Picking `logoLightKey` here puts a near-black wordmark on a navy block.
   */
  it('prefers the dark-ground logo over the light one', () => {
    const { container } = render(
      <BoardMark
        branding={branding({ logoLightKey: 'aa/light.webp', logoDarkKey: 'bb/dark.webp' })}
        name="المنصة"
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toContain('bb/dark.webp');
  });

  it('falls back to the one logo an admin did upload', () => {
    const { container } = render(
      <BoardMark branding={branding({ logoLightKey: 'aa/light.webp' })} name="المنصة" />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toContain('aa/light.webp');
  });

  /** Not an outlined rectangle waiting for content — a slab with the
   *  deployment's own initial written on it. */
  it('draws the board when there is no logo at all', () => {
    const { container } = render(<BoardMark branding={branding()} name="محمد" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.board-mark__slab')).toBeTruthy();
    expect(container.querySelector('.board-mark__glyph')?.textContent).toBe('م');
  });
});

/* ------------------------------------------------- the file-level guards */

/**
 * These read SOURCE, not a render, and that is the point: the two failures
 * they exist for are both invisible from inside a rendered page.
 */
describe('board preset — nothing of Ayman’s is reachable', () => {
  const files = readdirSync(HERE)
    .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.tsx'))
    .map((name) => [name, readFileSync(join(HERE, name), 'utf8')] as const);

  it('has files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * `lib/brand-assets.ts` is HIS registry — the hero composite of him on the AI
   * set, the cut-out that stands behind the track cards, the studio portrait,
   * his face worn as the nav avatar. Every entry is gated by `aymanOnly()`, so
   * importing it on another stack does not leak a photograph; what it leaks is
   * his page's STAND-INS, which are drawn in his design language for his
   * sections. Neither belongs on somebody else's landing page.
   */
  it('imports no brand-asset registry and no MediaSlot', () => {
    const offenders = files
      .filter(([, src]) => /brand-assets|MediaSlot|media-slot/.test(stripComments(src)))
      .map(([name]) => name);

    expect(offenders, 'this preset takes its one image from branding.logo*Key').toEqual([]);
  });

  /**
   * `<InstructorProfile>` falls back to `DEMO_COURSES` on an empty catalogue so
   * a fresh checkout can see the page it is going to have. On a live tenant's
   * public landing page that is invented courses presented as the catalogue,
   * during exactly the weeks when the catalogue really is empty.
   */
  it('never falls back to demo courses', () => {
    const offenders = files
      .filter(([, src]) => /DEMO_COURSES|demo-courses/.test(stripComments(src)))
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  /**
   * A name reaches this page through ONE function. `copy.site.name` and
   * `copy.site.instructor` may appear only as the fallback ARGUMENT to it —
   * `tenantName()` hands them back on his stack and returns
   * `TENANT_DISPLAY_NAME`, or the anonymous «المنصة», anywhere else.
   */
  it('prints no name that did not come through tenantName()', () => {
    for (const [name, src] of files) {
      const code = stripComments(src);
      for (const match of code.matchAll(/copy\.site\.(name|instructor)/g)) {
        const before = code.slice(Math.max(0, match.index - 40), match.index);
        expect(before, `${name}: copy.site.* must be an argument to tenantName()`).toContain(
          'tenantName(',
        );
      }
    }
  });
});

/**
 * This preset's half of `presets.css`, and only this half — the file is shared
 * with `neon`, one banner per preset, so the scan has to stop at the next
 * banner or it would report the other preset's rules as this one's failures.
 *
 * ⚠️ The slice starts at the banner's own `/*`, not at the marker. Starting
 * inside the comment throws its opening delimiter away, so `stripComments`
 * pairs the first `/*` it finds in the banner's PROSE with the wrong closer and
 * every comment after it is off by one — a scan that reads documentation as
 * CSS. (`neon-landing.test.ts` hit exactly this and documents it too.)
 */
function boardSection(): string {
  const css = readFileSync(join(WEB_STYLES, 'presets.css'), 'utf8');
  const marker = css.indexOf('═══ BOARD ═══');
  expect(marker, 'the BOARD banner is missing from presets.css').toBeGreaterThan(-1);

  const start = css.lastIndexOf('/*', marker);
  const after = css.slice(start === -1 ? marker : start);
  const next = after.search(/═══ (?!BOARD)[A-Z]+ ═/);
  return next === -1 ? after : after.slice(0, next);
}

describe('board preset — the stylesheet cannot reach the classic page', () => {
  /**
   * ⚠️ THE GUARD THIS WHOLE FILE EXISTS FOR.
   *
   * `presets.css` is imported by `(site)/layout.tsx`, so AYMAN'S LANDING PAGE
   * DOWNLOADS IT. One selector that can match outside `[data-preset='board']`
   * — a bare `.board-band`, a `.site-btn` override, anything — changes the page
   * with real students and real money on it, silently, because nothing in the
   * type system or the rest of the suite notices a CSS rule that matched one
   * element too many. «منصتي زي ما هي بالظبط».
   */
  it('scopes every rule under [data-preset=\'board\']', () => {
    const css = stripComments(boardSection());
    const unscoped: string[] = [];
    let buffer = '';

    for (const char of css) {
      if (char === '{') {
        const head = buffer.trim();
        buffer = '';
        if (head && !head.startsWith('@') && !head.includes("[data-preset='board']")) {
          unscoped.push(head.replace(/\s+/g, ' '));
        }
      } else if (char === '}' || char === ';') {
        buffer = '';
      } else {
        buffer += char;
      }
    }

    expect(
      unscoped,
      `unscoped selectors in the BOARD section — each of these also matches on ` +
        `Ayman's landing page, which downloads this same stylesheet:\n  ` +
        unscoped.join('\n  '),
    ).toEqual([]);
  });

  /**
   * Colours come from the token layer only. A hex here is a colour that cannot
   * follow the tenant's own `accentHue` and cannot be checked in both themes;
   * an `!important` is a rule that a later, more specific fix cannot undo.
   */
  it('uses no hex literal and no !important', () => {
    const css = stripComments(boardSection());

    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).not.toContain('!important');
  });

  /**
   * RTL. The document is `dir="rtl"`, and a physical `left`/`right` is a rule
   * that was written for the mirror image of this page.
   */
  it('uses logical box properties only', () => {
    const css = stripComments(boardSection());
    const physical =
      css.match(
        /(?<![\w-])(margin|padding|border)-(left|right)\s*:|(?<![\w-])(left|right)\s*:/g,
      ) ?? [];

    expect(physical).toEqual([]);
  });

  /**
   * Both bidi isolates. A Western digit in an RTL run is bidi-weak: the year
   * numeral and the «85 من 100» score both reorder without this, and the second
   * one turns a mark out of a hundred into a hundred out of a mark.
   */
  it('isolates every Latin-digit run', () => {
    const css = stripComments(boardSection());

    for (const selector of ['.board-tile__n', '.board-honor__score']) {
      const rule = css.slice(css.indexOf(`${selector} {`));
      const body = rule.slice(0, rule.indexOf('}'));
      expect(body, `${selector} must isolate its digits`).toContain('unicode-bidi: isolate');
      expect(body, `${selector} must isolate its digits`).toContain('direction: ltr');
    }
  });
});
