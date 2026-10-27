import type { Seo, SeoRead } from './settings';

/**
 * The public sections that can carry their own share image, and the paths
 * each one covers.
 *
 * Read by `buildMetadata()` (which picks the image for a path), the API
 * resolver (id → key) and the SEO form — so a section added here gets a
 * control, a resolved key and a renderer, and `seo-pages.spec.ts` fails if
 * any of the three names drifts.
 *
 * `prefix` matches the path itself and everything under it on a segment
 * boundary: `/practice` covers `/practice/1`, not `/practiced`.
 */
type OgField = Extract<keyof Seo, `og${string}AssetId`>;
type OgKey = Extract<keyof SeoRead, `og${string}Key`>;

export const OG_PAGE_IDS = [
  'courses',
  'books',
  'about',
  'honorBoard',
  'practice',
  'news',
  'links',
  'subscribe',
] as const;
export type OgPage = (typeof OG_PAGE_IDS)[number];

export interface OgPageDef {
  page: OgPage;
  prefix: string;
  field: OgField;
  key: OgKey;
}

const PREFIX: Record<OgPage, string> = {
  courses: '/courses',
  books: '/books',
  about: '/about',
  honorBoard: '/honor-board',
  practice: '/practice',
  news: '/news',
  links: '/links',
  subscribe: '/subscribe',
};

const cap = (page: OgPage) => page.charAt(0).toUpperCase() + page.slice(1);

export const OG_PAGES: readonly OgPageDef[] = OG_PAGE_IDS.map((page) => ({
  page,
  prefix: PREFIX[page],
  field: `og${cap(page)}AssetId` as OgField,
  key: `og${cap(page)}Key` as OgKey,
}));

/** The section a path belongs to, if any. */
export function ogPageFor(path: string): OgPageDef | undefined {
  return OG_PAGES.find((def) => path === def.prefix || path.startsWith(`${def.prefix}/`));
}
