import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * ⚠️ A hand-written route handler, NOT `app/robots.ts` (Next's
 * `MetadataRoute.Robots`), and it cannot go back to being one.
 *
 * `MetadataRoute.Robots` serialises a fixed shape — `userAgent`, `allow`,
 * `disallow`, `crawlDelay`, `sitemap`, `host`. There is no field for an
 * arbitrary directive, and `Content-Signal` is an arbitrary directive. The
 * choice was between this file and shipping no content signals at all.
 *
 * The two file names conflict (both claim `/robots.txt`), so `app/robots.ts`
 * was deleted in the same commit. If it ever reappears, this handler silently
 * stops being the one that answers.
 */

/**
 * The instructor's stated preference, per RFC-draft `draft-romm-aipref-contentsignals`
 * and contentsignals.org. Decided 2026-08-05 by Ayman, not defaulted:
 *
 *   · `search=yes`   — index it and link to it. This is the point of the site.
 *   · `ai-input=yes` — an assistant MAY read a page to answer a student's
 *     question right now and cite it. This is what puts the platform inside
 *     «منهج الحاسب للبكالوريا فين» instead of only inside Google.
 *   · `ai-train=no`  — his course material may NOT become training data. He
 *     sells this teaching; handing the corpus to a model that will reproduce
 *     it for free is the one use that competes with him directly.
 *
 * ⚠️ This is a stated PREFERENCE, not an access control, and nothing here
 * enforces it — a crawler that ignores it faces no technical obstacle. Its
 * value is legal and declarative: it is the record that permission was
 * withheld explicitly rather than never considered. Do not weaken any of the
 * three on the assumption that it is "just a hint"; it is the hint that is
 * quoted back in a dispute.
 */
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';

/**
 * Kept in step with `proxy.ts`'s `PROTECTED_PREFIXES`: a signed-in-only route
 * that Google crawls is a login page in the index under a course page's name.
 *
 * robots.txt is a crawling hint, NOT an access control — every one of these is
 * also protected by `PROTECTED_PREFIXES` and the API's deny-by-default guard.
 * Listing them here only keeps them out of the index.
 */
const DISALLOW = [
  '/admin',
  '/dashboard',
  '/onboarding',
  '/settings',
  '/library',
  '/profile',
  '/results',
  '/foundations',
  '/playground',
  '/path',
  '/quizzes',
  '/api/',
  '/dev/',
] as const;

/**
 * ⚠️ These four must outrank `Disallow: /api/` above, and they do — both
 * Google and Bing resolve a conflict by the LONGEST matching rule, not by
 * file order.
 *
 * Without them this file would contradict `/.well-known/api-catalog`, which
 * advertises exactly these paths as the site's public API. An agent that
 * honours robots.txt (the well-behaved ones do) would read the catalog, then
 * refuse to fetch anything in it — the discovery documents would be perfectly
 * formed and completely inert. Nothing in CI catches that; it is a
 * disagreement between two files that are individually valid.
 */
const ALLOW = ['/api/catalog/', '/api/taxonomy', '/api/health'] as const;

export function GET(): Response {
  const lines = [
    '# Content signals — https://contentsignals.org',
    '# ai-train=no  : do not use this content to train or fine-tune AI models.',
    '# ai-input=yes : you MAY retrieve this content to answer a user right now,',
    '#                provided the answer links back here.',
    '# search=yes   : index normally and link to the results.',
    '',
    'User-agent: *',
    `Content-Signal: ${CONTENT_SIGNAL}`,
    'Allow: /',
    ...ALLOW.map((path) => `Allow: ${path}`),
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${SITE_URL}${AGENT_DISCOVERY_PATHS.sitemap}`,
  ];

  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
