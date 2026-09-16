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
 * The same three preferences, with the training half flipped — for the ONE
 * agent Ayman has granted it to.
 *
 * ⚠️ A group that said `Allow: /` under a `Content-Signal: ai-train=no` would
 * be handing Google a permission and a refusal of that same permission in the
 * same breath. The site-wide preference above is unchanged and still means what
 * it says; this is the named exception, stated as plainly as the rule.
 */
const GOOGLE_EXTENDED_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

/**
 * ⚠️ Named with an explicit `Allow: /` rather than simply left out.
 *
 * Omitting it would permit exactly the same thing — an unnamed token defaults
 * to allowed — and would leave no trace that anybody decided. Google-Extended
 * was `Disallow: /` here until 2026-09-16; a silent deletion reads as an
 * accident, and this is the one entry most likely to be "restored" by a reader
 * who remembers the old rule and not the reason it changed.
 */
const GOOGLE_EXTENDED = 'Google-Extended';

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

/**
 * The AI crawlers, named one by one — because `Content-Signal` is a preference
 * and `Disallow` is the only line any of them is actually built to obey.
 *
 * ⚠️ The split below is NOT two lists of AI bots. It is the difference between
 * a crawler that reads a page to ANSWER a student right now and one that reads
 * it to TRAIN on. The instructor's decision (2026-08-05, restated 2026-09-13)
 * is `ai-input=yes, ai-train=no`, and until this file said so per-agent, the
 * decision existed only in a header that no crawler is required to parse.
 *
 * ⚠️ Every name is spelled as the vendor documents it, and the match is
 * case-insensitive but NOT a substring match — `ClaudeBot` and `Claude-User`
 * are two different products with opposite entries here, and shortening either
 * one to `Claude` would silently merge them into whichever rule came first.
 *
 * ⚠️ These groups override the `User-agent: *` block entirely. A named group
 * REPLACES the wildcard group for that crawler — it does not add to it — so
 * every `RETRIEVAL` agent below has to repeat the `Disallow` list or it would
 * be handed `/admin` and `/dashboard`. That is the single easiest thing to get
 * wrong in this file and nothing in CI can see it.
 */
const RETRIEVAL_AGENTS = [
  // OpenAI: the search index behind ChatGPT's answers, and the fetch it makes
  // when a user's question needs this page right now. Neither trains.
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic: the same two roles.
  'Claude-SearchBot',
  'Claude-User',
  // Perplexity: the index, and the on-demand fetch.
  'PerplexityBot',
  'Perplexity-User',
  // Apple's search crawler. `Applebot-Extended` — the training opt-out — is in
  // the list below, which is exactly the distinction Apple built it for.
  'Applebot',
  // Meta's on-demand fetcher, as opposed to `meta-externalagent` below.
  'meta-externalfetcher',
] as const;

/**
 * Training crawlers. `Disallow: /` for all of them, which is the enforceable
 * form of `ai-train=no`.
 *
 * ⚠️ This is a real trade-off and it was made deliberately. Blocking these
 * means the course material does not enter model weights, so an assistant that
 * recommends this platform will be doing it from a page it fetched — not from
 * memory. The instructor sells this teaching; a model that reproduces it for
 * free is the one use that competes with him directly. Do not quietly flip any
 * of these to `Allow` to chase a ranking.
 *
 * ⚠️ If a vendor ever merges its training crawler into its search crawler,
 * this list starts costing retrieval traffic and the entry for that vendor has
 * to be revisited — it cannot be detected from here.
 *
 * ⚠️ `Google-Extended` is NOT in the list below, and its absence is a decision
 * rather than an oversight. Ayman chose it on 2026-09-16, told the cost of
 * both sides.
 *
 * What it actually is, checked against Google's own crawler documentation
 * (developers.google.com/search/docs/crawling-indexing/google-common-crawlers)
 * and not an SEO blog:
 *
 *   · It is NOT a crawler. "Google-Extended doesn't have a separate HTTP
 *     request user agent string. Crawling is done with existing Google user
 *     agent strings; the robots.txt user-agent token is used in a control
 *     capacity."
 *   · It gates two things behind ONE token: training future Gemini models,
 *     AND "grounding in Gemini Apps and Vertex AI".
 *   · It touches neither Search nor AI Overviews: "Google-Extended does not
 *     impact a site's inclusion in Google Search nor is it used as a ranking
 *     signal."
 *
 * Google offers no way to take the grounding and refuse the training. Blocking
 * it cost this site the ability to be the source a Gemini answer is built on,
 * and Ayman decided that being citable there is worth letting Google train on
 * the material. Every OTHER training crawler below stays blocked — the decision
 * was about Gemini, not about training in general.
 *
 * ⚠️ It is one-way in practice. What has already entered a model's weights does
 * not come back out if this is reverted later.
 */
const TRAINING_AGENTS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'meta-externalagent',
  'FacebookBot',
  'Amazonbot',
  'cohere-ai',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'PanguBot',
  'Timpibot',
  'Webzio-Extended',
  'AI2Bot',
] as const;

export function GET(): Response {
  /** The access rules, repeated per named group — see `RETRIEVAL_AGENTS`. */
  const accessRules = [...ALLOW.map((path) => `Allow: ${path}`), ...DISALLOW.map((path) => `Disallow: ${path}`)];

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
    '# Assistants that read a page to answer a student now: welcome, with a link back.',
    '',
    ...RETRIEVAL_AGENTS.flatMap((agent) => [
      `User-agent: ${agent}`,
      `Content-Signal: ${CONTENT_SIGNAL}`,
      'Allow: /',
      ...accessRules,
      '',
    ]),
    '# Gemini: may read, may cite, and — uniquely — may train. Google gates its',
    '# grounding and its training behind this one token and offers no way to',
    '# split them, so this is the price of being citable inside Gemini.',
    '',
    `User-agent: ${GOOGLE_EXTENDED}`,
    `Content-Signal: ${GOOGLE_EXTENDED_SIGNAL}`,
    'Allow: /',
    ...accessRules,
    '',
    '# Every other training crawler. The instructor sells this teaching;',
    '# permission is withheld explicitly rather than by omission.',
    '# See /auth.md and /llms.txt.',
    '',
    ...TRAINING_AGENTS.flatMap((agent) => [`User-agent: ${agent}`, 'Disallow: /', '']),
    `Sitemap: ${SITE_URL}${AGENT_DISCOVERY_PATHS.sitemap}`,
  ];

  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
