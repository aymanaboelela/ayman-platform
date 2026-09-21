import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copy } from './copy/admin';

/**
 * No shipped default may carry one instructor's real-world identity.
 *
 * ## Why this is a grep and not a type
 *
 * The platform now runs as more than one deployment from one image, and the
 * failure this guards against does not look like a bug from inside the code:
 * a literal phone number or hostname compiles, type-checks, renders, and is a
 * perfectly working link — to the wrong person. The two that already shipped
 * were `?? OFFICIAL_WHATSAPP_E164` behind another tenant's «كلّمنا» button and
 * `?? 'https://video.aymanaboelela.com'` baked into another tenant's video
 * playlists. Nothing in the type system can distinguish those from correct
 * code, so the check has to be over the source text.
 *
 * ## What is allowed
 *
 * · `site-profiles.ts` — the one file whose whole job is to hold them, and the
 *   only place `seed.ts` may read them from (through `TENANT_CONTACT_SEED`,
 *   which will not hand them to a stack whose `TENANT_KEY` is not `ayman`).
 * · Tests and fixtures — a spec asserting `waMeHref('+2010…')` is testing a
 *   formatter, not shipping a destination.
 * · Comments — a docblock explaining `+201021196367 → ٠١٠٢١١٩٦٣٦٧` is
 *   documentation. Comments are stripped before the search, so prose about
 *   the number stays legal and only a live literal fails.
 *
 * Everything else fails, and the fix is always the same: read it from the
 * settings row, or from an environment variable that defaults to nothing.
 *
 * ## The four blind spots this check used to have
 *
 * The first non-`ayman` stack was booted with this suite green, and it was
 * green because of where it was NOT looking, not because the leaks were gone.
 * All four holes were structural rather than a missed needle:
 *
 * 1. **Only `.ts/.tsx/.mjs/.js` were read.** A stylesheet, a template and a
 *    piece of edge config are all shipped text that renders, and all three had
 *    a leak in them: `(link)/styles/linkhub.css` painted the hero composite —
 *    the instructor cut out over the AI set — behind every tenant's link page
 *    as a `background-image`; `scripts/og-card/card.html` built the social
 *    card out of his photograph, his name and his domain; and
 *    `deploy/cloudflare/link-header.json` matched on `http.host eq
 *    "aymanaboelela.com"`. `.css`, `.html` and `.json` are read now.
 * 2. **Whole directories sat outside `ROOTS`.** `apps/web/public/` ships
 *    byte-for-byte to the browser and never passes through the bundler;
 *    `apps/web/`'s own top level holds `next.config.ts` and `proxy.ts`, which
 *    write the CSP and the rewrites; and `deploy/` held two scripts hardcoding
 *    the apex and the name (`apply-link-header.mjs`, `verify-links-host.mjs`).
 * 3. **The name check knew one spelling.** It grepped `أيمن` and nothing else,
 *    so the hamza-less `ايمن` in the AI catalog's `representativeQueries` and
 *    the Latin `Ayman Abo El Ela` in the agent skills' description were both
 *    invisible.
 * 4. **`FORBIDDEN` listed a phone and a domain and stopped.** A face is an
 *    identity too, and so is an account. `/brand/ayman-mark-2.webp` is his head
 *    worn as the nav avatar, `/team/ayman.jpg` is his portrait in the JSON-LD
 *    and the OG card, `facebook.com/aymanaboelela2` and `@2ayman6` are inboxes
 *    he reads. None of them contain a phone number or a hostname, so every one
 *    of them passed.
 *
 * ## Fail, do not record
 *
 * This file used to carry a `KNOWN_NAME_FILES` ledger — nine files that print
 * his name, listed and asserted equal. That is a census, not a guard: the nine
 * went on printing it and the suite stayed green as long as the count did not
 * move. The only list left is `GATED_AT_POINT_OF_USE`, and every entry on it is
 * a file where the literal survives BEHIND a gate. A leak with no gate fails.
 */

/**
 * `relative()` hands back platform separators; the lists below are written with
 * `/` because that is how a repo path is read and written everywhere else. One
 * conversion here beats a `join(...)` call per entry.
 */
const repoPath = (path: string): string => path.split('/').join(sep);

/**
 * Files whose literal is deliberately still present, because THE GATE IS AT THE
 * POINT OF USE.
 *
 * Each of these reads its literal through `IS_AYMAN` / `aymanOnly()` /
 * `tenantName()` from `apps/web/lib/tenant.ts` (or, on the API side, through
 * `TENANT_DISPLAY_NAME`, which cannot import that module), so a stack whose
 * `TENANT_KEY` is not `ayman` never reaches the value. The literal stays in the
 * source because the gate hands it back on HIS stack — his page has to stay
 * byte-identical, which is the whole constraint this work runs under.
 *
 * ⚠️ Every line here is a PROMISE that a gate exists, and this repo has been
 * burned by exactly that promise before: a docblock saying DOMPurify was server
 * only, while 28KB of it shipped on the quiz routes for months. Before leaving
 * an entry in, open the file and find the gate. A comment is not a guard.
 *
 * ## And the promise HAS been false here, which is why the list is now split
 *
 * `copy/outreach.ts` sat on this list carrying «إزيك يا {name}، أنا مهندس
 * أيمن» as entry 4 of 8 in `OUTREACH_GREETINGS`. There was no gate. Not a weak
 * one — none: `outreach/compose.ts` drew that pool uniformly and contained no
 * reference to a tenant module of any kind, and both callers
 * (`OutreachService.deliver`, `OutreachLogService.preview`) persisted and sent
 * what came back. Roughly one automated message in eight from EVERY
 * instructor's platform introduced itself to their student as Ayman, in the
 * first person, in a thread the student could reply to. The entry read as
 * reassuring for as long as nobody opened the file.
 *
 * A gate exists now (`ComposeInput.instructorName`, threaded from
 * `tenantName(OUTREACH_SIGNATURE)`), so the entry is TRUE and stays. The two
 * string tables it sat beside are a different thing entirely and have been
 * moved to `IDENTITY_SOURCE_TABLES` below, because "the consumers are supposed
 * to gate this" is not the same claim as "this file's literal is gated", and
 * filing them under one heading is how the false one hid next to the true ones.
 *
 * The rest of the in-flight de-Aymanizing — `lib/seo/metadata.ts`,
 * `app/manifest.ts`, `components/site/site-nav.tsx`, `site-footer.tsx`,
 * `brand-lockup.tsx`, `auth-showcase.tsx`, `tracks-dragon.tsx`,
 * `footer-dragons.tsx` — needs no entry: those reach his assets through
 * `getBrandAsset()` and his name through `copy`, and carry no literal of their
 * own for this check to find.
 */
const GATED_AT_POINT_OF_USE: readonly { path: string; gate: string }[] = [
  // The image registry. `/brand/ayman-mark-2.webp`, `hero-ai-dragon-2.webp` and
  // `portrait-baron-dragon.webp` are all photographs of him; the gate is in
  // `getBrandAsset()`, which hands a non-`ayman` stack `undefined` and lets
  // every call site's existing "no asset" branch draw the designed fallback.
  // Verified: `aymanOnly(asset)` for every kind outside `GENERIC_ASSET_KINDS`,
  // which is an allowlist of one (`logo`) written that way round on purpose.
  { path: 'apps/web/lib/brand-assets.ts', gate: 'aymanOnly' },
  // `/team/ayman.jpg` as the `image`/`logo` of the Person and Organization
  // nodes. Gated where the node is built, not where the path is written.
  // Verified: `INSTRUCTOR_IMAGE = aymanOnly(absolute('/team/ayman.jpg'))`.
  { path: 'apps/web/lib/seo/jsonld.ts', gate: 'aymanOnly' },
  // The agent skill descriptions — English prose naming him as the instructor,
  // served at `/.well-known/agent-skills/`. Verified: the literal is one arm of
  // an `IS_AYMAN ?` on `description`, swapped whole rather than interpolated
  // because `tenantName()` returns an Arabic name and this sentence is English.
  { path: 'apps/web/lib/agents/skills.ts', gate: 'IS_AYMAN' },
  // `OUTREACH_SIGNATURE` — «مهندس أيمن», the short form he signs the one
  // self-introducing greeting with. Verified: it is the FALLBACK ARGUMENT and
  // never the value. No pool entry carries a name; the greeting carries
  // `{instructor}`, `composeOutreach` fills it from `ComposeInput
  // .instructorName`, and both callers pass `tenantName(OUTREACH_SIGNATURE)`
  // from `apps/api/src/common/tenant.ts`. `compose.spec.ts` asserts both ends
  // — that no pool line contains the name, and that a body composed for a
  // different instructor never does either.
  { path: 'packages/contracts/src/copy/outreach.ts', gate: 'OUTREACH_SIGNATURE' },
];

/**
 * The string tables — NOT gated, and listed here so that nobody reads them as
 * if they were.
 *
 * These three hold his name as ordinary copy: `copy.site.name`,
 * `copy.site.instructor`, `copy.seo.*`, and several dozen sentences with it
 * welded into the middle. Nothing inside them is behind anything. What is true
 * of them is a weaker and different statement: they are the SOURCE every other
 * file is supposed to read through `tenantName()` instead of hardcoding, and
 * the gating work happens at each consumer, one at a time.
 *
 * ⚠️ So an entry here says only "this file is exempt from the scan". It makes
 * NO claim about any particular consumer. Several are gated today — `lib/seo/
 * metadata.ts`, `app/manifest.ts`, `lib/agents/skills.ts`, `lib/notification
 * -view.ts`, `assistant-ai.service.ts`, `push-text.ts` — and many are not. A
 * consumer is safe when you have read it, not because these paths are on a
 * list.
 *
 * The exemption is kept rather than removed because the alternative is a
 * permanently red suite: the tables are the de-Aymanizing work itself, not a
 * leak that can be closed in one edit, and a check nobody can make green is a
 * check people learn to skip.
 */
const IDENTITY_SOURCE_TABLES = [
  'packages/contracts/src/copy/admin.ts',
  'packages/contracts/src/copy/ar.ts',
].map(repoPath);

/** Real-world identity that must never be a fallback in shipped code. */
const FORBIDDEN: readonly { literal: string; what: string }[] = [
  { literal: '+201021196367', what: "Ayman's personal WhatsApp number" },
  { literal: '201021196367', what: "Ayman's WhatsApp number without the +" },
  { literal: 'aymanaboelela.com', what: "Ayman's domain (and its subdomains)" },
  /**
   * The accounts. `aymanaboelela.com` does not cover any of these — the
   * Facebook page is `aymanaboelela2`, with no dot, and the YouTube/Instagram
   * handle shares no substring with the domain at all. A second instructor's
   * footer linking these is the same failure as its «كلّمنا» button dialling
   * his phone: a working link to the wrong person.
   */
  { literal: 'aymanaboelela2', what: "Ayman's Facebook page" },
  { literal: '2ayman6', what: "Ayman's YouTube and Instagram handle" },
  { literal: '2ayman_6', what: "Ayman's TikTok handle" },
  /**
   * The photographs. These are the leak that needs no configuration and no
   * click — the browser fetches them and there he is, on a stranger's domain.
   * The file NAMES are the needle because the bytes are `.webp` and `.jpg`,
   * which no walk below reads; what has to be caught is the PATH, wherever it
   * is written — a `src` in a registry, a `url()` in a stylesheet, an `<img>`
   * in a template, a `path.join` in a build script.
   */
  { literal: 'ayman.jpg', what: "Ayman's portrait — public/team/ayman.jpg" },
  { literal: 'ayman-mark-2.webp', what: "Ayman's face, worn as the nav mark" },
  {
    literal: 'hero-ai-dragon-2.webp',
    what: 'the hero composite — Ayman cut out over the AI set',
  },
  { literal: 'portrait-baron-dragon.webp', what: 'Ayman at قصر البارون' },
];

/**
 * Every spelling of the name that reaches a reader.
 *
 * The Latin needles are the FULL name on purpose. A bare `Ayman` also matches
 * `AymanAvatar`, `latestFromAyman` and `components/assistant/ayman-avatar` —
 * identifiers no student ever sees — and it matches the correctly gated
 * `TENANT_KEY === 'ayman' ? 'Ayman Platform' : …` in `services/wa`, which is
 * this whole exercise working as designed. Three spellings because `copy/ar.ts`
 * carries three, for SEO: he is transliterated inconsistently in the wild and
 * the alternate-name list has to match what people type.
 *
 * ⚠️ `أيمن` is also the Arabic for «right-hand», so «الزر الأيمن» would fail
 * this check. No such string exists today, and if one ever does the fix is to
 * narrow the needle to «أيمن أبو», not to widen the allow-list.
 */
const NAME_LITERALS: readonly { literal: string; what: string }[] = [
  { literal: 'أيمن', what: 'the name' },
  { literal: 'ايمن', what: 'the name without the hamza' },
  { literal: 'Ayman Abo El Ela', what: 'the name in Latin' },
  { literal: 'Ayman Aboelela', what: 'the name in Latin, run together' },
  { literal: 'Ayman Abo Elela', what: 'the name in Latin, third spelling' },
];

/** Source roots, relative to the repo root. Walked all the way down. */
const ROOTS = [
  'apps/api/src',
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/cache-handler',
  /**
   * Served byte-for-byte, so nothing under it is ever reviewed as code:
   * `sw.js`, `js-runner.js` and `python-worker.js` reach the browser exactly as
   * they sit on disk, with no bundler and no lint between. His photograph lives
   * here too (`team/ayman.jpg`) — the binary has no extension this walk reads,
   * which is precisely why the file NAME is a forbidden literal above.
   */
  'apps/web/public',
  'packages/contracts/src',
  'packages/ui/src',
  'services/wa/src',
  'scripts',
  /**
   * Operator tooling — and it runs against whatever zone the operator owns.
   * `verify-links-host.mjs` asserted a heading of «أيمن أبو العلا» and
   * `apply-link-header.mjs` defaulted `SITE_URL` to his apex, so a second
   * instructor running either one verifies, or patches, HIS site instead of
   * theirs and is told everything is fine.
   */
  'deploy',
];

/**
 * Roots read ONE level deep, files only.
 *
 * `apps/web` itself is where `next.config.ts` and `proxy.ts` live — the CSP,
 * the `Permissions-Policy` and the rewrites, every one of them a long line full
 * of hostnames, and none of them under any root above. Walking `apps/web` deep
 * instead would re-read `app/`, `components/` and `lib/` a second time and drag
 * in `e2e/`, `playwright-report/` and `node_modules`; one level is exactly the
 * gap that was open. A new config file dropped beside them is covered the day
 * it lands rather than the day someone remembers to add it here.
 */
const SHALLOW_ROOTS = ['apps/web'];

/**
 * The two files whose job IS to hold these values.
 *
 * `site-profiles.ts` is the source of truth the seed reads through
 * `TENANT_CONTACT_SEED`, and `check-tenant-env.mjs` is the preflight that
 * REJECTS a tenant config containing them — a checker that cannot name what it
 * is looking for cannot look for it. Every other file under these roots,
 * scripts included, is covered.
 */
const ALLOWED_FILES = new Set([
  join('packages', 'contracts', 'src', 'site-profiles.ts'),
  join('scripts', 'check-tenant-env.mjs'),

  /*
   * ── Tooling that GENERATES Ayman's own assets ───────────────────────────
   *
   * None of these three ships. They are run by hand, on his machine, to
   * re-cut the share card and the PWA icons FROM HIS PHOTOGRAPH — so the
   * literal is the input, not a default that a second deployment inherits.
   * Gating them would mean a script that refuses to regenerate the only
   * assets it exists to regenerate.
   *
   * What DOES ship from them — `public/og.jpg`, `public/icons/*` — is gated
   * where it is read: `FALLBACK_OG_IMAGE` in `apps/web/lib/seo/metadata.ts`
   * and the `icons` array in `apps/web/app/manifest.ts`, both behind
   * `IS_AYMAN`. A tenant supplies its own through /admin/settings.
   */
  join('scripts', 'og-card', 'card.html'),
  join('scripts', 'og-card', 'build.mjs'),
  join('scripts', 'build-mobile-icons.mjs'),

  /*
   * ── Cloudflare configuration for HIS zone ───────────────────────────────
   *
   * These operate on `aymanaboelela.com` through his Cloudflare account. The
   * hostname is the TARGET of the script, the way a deploy key names the
   * server it deploys to — a second instructor's stack does not run them at
   * all; it gets its own records under its own zone.
   */
  join('deploy', 'cloudflare', 'apply-link-header.mjs'),
  join('deploy', 'cloudflare', 'verify-links-host.mjs'),
  join('deploy', 'cloudflare', 'link-header.json'),

  /*
   * ── A one-off reconciliation script ─────────────────────────────────────
   *
   * `finance-reconcile.ts` matches historical rows in HIS database, where the
   * string is a value that already exists in the data. It is not shipped, it
   * is not a default, and rewriting it would stop it finding the rows it was
   * written to find.
   */
  join('apps', 'api', 'src', 'scripts', 'finance-reconcile.ts'),

  /*
   * ── `code-lab.tsx` used to sit here, and it is why this block is short ──
   *
   * Its entry said the component «already reads `TENANT_DISPLAY_NAME` and
   * falls back to the name only for Ayman's own stack». That is the exact
   * thing the failure message below calls not-a-gate — the literal was `||
   * 'أيمن'`, one unset variable away from printing him — and the entry read as
   * reassuring for as long as nobody opened the file. It was harmless only
   * because no route renders the component, which the entry ALSO said, and
   * which is the sentence that should have been the whole entry.
   *
   * It has since become a precedent twice: `ai-catalog.json/route.ts` cited it
   * by name while copying the pattern. So the file now calls `tenantName()`
   * like everything else, carries no literal, and needs no entry at all.
   */

  /*
   * ── Gated at the element, not in the stylesheet ─────────────────────────
   *
   * `linkhub.css` paints `.linkhub__stage` with
   * `background-image: url('/brand/hero-ai-dragon-2.webp')` — his hero
   * composite, blurred into the `/links` atmosphere. The DIV that carries the
   * class is rendered behind `IS_AYMAN` in `apps/web/app/(link)/layout.tsx`,
   * so on another stack the element never exists and the file is never
   * requested.
   *
   * Listed rather than rewritten because the alternative — moving the URL
   * into an inline `style` — would take a background out of the stylesheet
   * that describes the surface, to satisfy a grep. The gate is real; this
   * entry records WHERE it is, so the next reader does not go looking for one
   * in the CSS.
   */
  join('apps', 'web', 'app', '(link)', 'styles', 'linkhub.css'),
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'generated',
  '.next',
  'dist',
  '__snapshots__',
  // Vendored WASM runtime under `public/`. `pyodide.asm.mjs` alone is several
  // megabytes of generated JS and reading it costs more than the entire rest of
  // this walk; it has never held an Arabic character or a hostname of ours.
  'pyodide',
  // Playwright's HTML output — one minified megabyte, rewritten on every local
  // e2e run, not shipped. It sits inside `apps/web`, which is a shallow root,
  // so this is belt and braces rather than the thing that excludes it.
  'playwright-report',
]);

/**
 * Shipped text, not "source".
 *
 * A stylesheet paints his photograph, a template prints his name and a
 * Cloudflare rule matches his hostname — see blind spot 1 at the top. `.json`
 * is in deliberately: `link-header.json` is edge config that ships, and a JSON
 * line survives `stripComments` intact because its only `//` is inside a URL,
 * which the strip skips.
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.css', '.html', '.json'];

function isTestFile(path: string): boolean {
  return /\.(test|spec|e2e)\.[a-z]+$/.test(path) || path.includes(`${sep}testing${sep}`);
}

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a root that does not exist in this checkout is not a failure
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(full);
  }
  return out;
}

/** `walk`, without the recursion — see `SHALLOW_ROOTS`. */
function walkShallow(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) continue;
    if (CODE_EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(full);
  }
  return out;
}

/**
 * Strips `//` and block comments so prose about a number is not a finding.
 *
 * Deliberately crude — it does not parse strings, so a `//` inside a string
 * literal truncates that line early. That direction is safe: it can only make
 * the check MISS something, never invent a failure. Block comments are removed
 * first so that a `//` inside one does not confuse the line pass.
 *
 * ## The second-slash bug this used to have, and what it hid
 *
 * The rule was: find the first `//`; if it belongs to a URL scheme (the
 * character before it is a `:`), assume the NEXT `//` opens the comment and cut
 * there. On a line carrying two URLs that is simply wrong — the second URL's
 * own `//` is not a comment — and everything from it to the end of the line was
 * deleted before the search ever saw it. 23 lines in this repo hit it. The
 * worst is `apps/web/proxy.ts:284`:
 *
 *     `img-src 'self' blob: data: https://i.ytimg.com https://c.clarity.ms …`
 *
 * a CSP directive whose entire job is to list hostnames, of which exactly one
 * survived the strip. Append `https://media.aymanaboelela.com` to that line —
 * the single most likely place for it to be appended — and the check reported
 * nothing at all.
 *
 * It now walks EVERY `//` on the line and cuts at the first one that is not a
 * scheme's, so a line of nothing but URLs is kept whole.
 */
function stripComments(source: string): string {
  /*
   * A block comment becomes its own length in spaces and newlines rather than
   * a single space, so an index into the stripped text is still an index into
   * the original. The literal suites below only ever ask `includes()` and do
   * not care — the consumer sweep at the bottom reports FILE AND LINE, and a
   * collapsed docblock moved every line number after it by however many lines
   * the comment was long.
   */
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  return withoutBlocks
    .split('\n')
    .map((line) => {
      for (let at = line.indexOf('//'); at !== -1; at = line.indexOf('//', at + 2)) {
        // `https://`, `postgresql://`, `rediss://` — a scheme's slashes, not a
        // comment. Keep looking instead of assuming the next pair is the one.
        if (at > 0 && line[at - 1] === ':') continue;
        return line.slice(0, at);
      }
      return line;
    })
    .join('\n');
}

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** Every shipped source file under the roots above — shared by both suites. */
const files = [
  ...ROOTS.flatMap((root) => walk(join(REPO_ROOT, root), [])),
  ...SHALLOW_ROOTS.flatMap((root) => walkShallow(join(REPO_ROOT, root), [])),
]
  .map((absolute) => relative(REPO_ROOT, absolute))
  .filter((path) => !isTestFile(path))
  .filter((path) => !ALLOWED_FILES.has(path));

/**
 * The files this suite actually asserts over.
 *
 * Both exemption lists are excluded, and they are kept as two lists rather than
 * one union because only the FIRST makes a claim a reader can check — see the
 * two docblocks. The behaviour is identical; the honesty is not.
 */
const exempt = new Set([
  ...GATED_AT_POINT_OF_USE.map((entry) => repoPath(entry.path)),
  ...IDENTITY_SOURCE_TABLES,
]);
const scanned = files.filter((path) => !exempt.has(path));

/**
 * Read once, strip once.
 *
 * The walk is ~1,100 files and there are fifteen needles between the two
 * suites; reading and stripping per needle was sixteen thousand file reads and
 * as many regex passes over them, which took longer than the rest of the
 * contracts suite put together.
 */
const strippedSource = new Map<string, string>();
function sourceOf(path: string): string {
  let text = strippedSource.get(path);
  if (text === undefined) {
    text = stripComments(readFileSync(join(REPO_ROOT, path), 'utf8'));
    strippedSource.set(path, text);
  }
  return text;
}

describe('no shipped default carries one instructor’s identity', () => {
  it('finds source files to check at all', () => {
    // Without this the suite passes vacuously the day a directory is renamed.
    expect(files.length).toBeGreaterThan(1000);
  });

  it('every allow-listed file still names the gate it is exempt for', () => {
    /*
     * The list's own warning, made mechanical.
     *
     * «A comment is not a guard» was written at the top of `GATED_AT_POINT_OF
     * _USE` and was, at that moment, describing one of its own entries:
     * `copy/outreach.ts` was exempt on the strength of a gate that did not
     * exist anywhere, and one automated message in eight from every tenant's
     * platform introduced itself as Ayman for as long as that stood.
     *
     * This cannot prove a gate is CORRECT — only a reader can do that, which
     * is what each entry's comment is for. What it does catch is the failure
     * that actually happened: a gate that is removed, renamed or never written
     * while the exemption stays behind. The file must at least still contain
     * the symbol its entry claims, in code rather than in prose (`sourceOf`
     * has stripped the comments, so a docblock mentioning `IS_AYMAN` does not
     * count — which is the entire point).
     *
     * `copy/outreach.ts` names `OUTREACH_SIGNATURE` rather than a gate symbol
     * because `packages/contracts` cannot import either tenant module and must
     * not read the environment (see that constant's docblock). The export IS
     * the seam: the literal lives under that name and nowhere else, the
     * greeting carries `{instructor}`, and `outreach/compose.spec.ts` asserts
     * from both ends that no pool line and no composed body carries the name.
     */
    for (const { path, gate } of GATED_AT_POINT_OF_USE) {
      expect(
        sourceOf(repoPath(path)),
        `${path} is exempt from this scan because of \`${gate}\`, and \`${gate}\` ` +
          `is no longer in its code. Either the gate moved — update the entry — ` +
          `or it is gone and the literal is shipping. Do not delete this ` +
          `assertion to make the suite green.`,
      ).toContain(gate);
    }
  });

  for (const { literal, what } of FORBIDDEN) {
    it(`does not hardcode ${what}`, () => {
      const offenders = scanned.filter((path) => sourceOf(path).includes(literal));

      expect(
        offenders,
        `${what} (${literal}) is hardcoded in shipped code. Read it from ` +
          `site_settings, or from an env var that defaults to nothing — a ` +
          `second deployment would publish it as its own.`,
      ).toEqual([]);
    });
  }
});

describe('the instructor’s name', () => {
  for (const { literal, what } of NAME_LITERALS) {
    it(`does not print ${what}`, () => {
      // Unlike the phone and the domain, a NAME needs no configuration to reach
      // a student — it is simply printed. There is nothing to misconfigure and
      // nothing to click.
      const carrying = scanned.filter((path) => sourceOf(path).includes(literal));

      expect(
        carrying,
        `${what} («${literal}») is hardcoded in shipped code. On the web side ` +
          `call tenantName(copy.site.name) from apps/web/lib/tenant.ts, which ` +
          `hands a non-ayman stack TENANT_DISPLAY_NAME or «المنصة»; on the API ` +
          `side read TENANT_DISPLAY_NAME directly. A fallback to his name is ` +
          `not a gate — a stack that forgets the variable prints him.`,
      ).toEqual([]);
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE CONSUMER SWEEP — the other half, and the half that was missing
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The same question, asked from the other end: not «which file WRITES his
 * name», but «which file READS a copy key that contains it, without a gate».
 *
 * ## Why the scan above could never have caught this
 *
 * `copy/ar.ts` is exempt from every needle loop (see `IDENTITY_SOURCE_TABLES`),
 * and that exemption is correct — the table is where the name is SUPPOSED to
 * live. The consumer is the thing that has to gate it. But a consumer carries
 * no literal for a text search to find:
 *
 *     const c = copy.assistant;        // assistant-widget.tsx:155
 *     …
 *     <span>{c.subtitle}</span>        // assistant-widget.tsx:814
 *
 * `assistant-widget.tsx` is scanned, is on no allow-list, and is CLEAN by
 * every check above — while rendering «ولو مالقيتش اللي بتدوّر عليه بوصّلك
 * لأيمن» at the top of another instructor's support panel, six hundred lines
 * below two constants in the same file that gate the name correctly. The name
 * travels from an exempt file, through a property access, into a scanned and
 * blameless one. No list of spellings and no extra file extension reaches it.
 *
 * Thirty-two more reads were hiding underneath that one, and the worst of them
 * was not on a page at all: `assistant-knowledge.ts` handed ten of the written
 * answers to the model verbatim — «الأسئلة المقالية بيصحّحها أيمن بنفسه» —
 * where a corpus-only deployment quotes them back to the student as fact.
 *
 * ## What this does instead
 *
 * Three mechanical steps, no hand-kept inventory of keys:
 *
 * 1. Walk the copy object itself and collect the DOTTED PATH of every string
 *    whose value carries a spelling from `NAME_LITERALS`. That is the list —
 *    derived, so a key reworded to include the name joins it the same day, and
 *    a key reworded to drop it leaves.
 * 2. Walk the same roots the literal scan walks, resolving the one alias shape
 *    every consumer in this repo uses (`const c = copy.assistant;`) against
 *    the real object, so a read is only counted when the path EXISTS.
 * 3. Fail on any read that is not inside `tenantName(` / `tenantSentence(` /
 *    `tenantFaq(` / `aymanOnly(`, and not inside a conditional on `IS_AYMAN`,
 *    `TENANT_KEY` or `SEEDS_OFFICIAL_SEO`.
 *
 * ## What it still cannot see, stated plainly
 *
 * It reads text, not types. It cannot follow a tainted string through a
 * function argument into another module, it resolves aliases one level deep,
 * and for a whole TABLE read (`copy.assistant.knowledge.map(…)`) it can only
 * see that the expression consuming the table mentions a gate — not that every
 * element goes through one. Those are the seams, and `GATED_BY_THE_RECEIVING_
 * COMPONENT` below is where the first of them is written down by hand.
 *
 * The version of this that has no seams is a TYPE: brand the tainted keys so
 * `{c.subtitle}` in JSX is a compile error rather than a finding here. That is
 * worth doing and is not what this is. This is the check that can exist today,
 * and it is the difference between thirty-three leaks and none.
 */

/** Gate calls. A read inside one of these parens has been through the swap. */
const COPY_GATES = ['tenantName', 'tenantSentence', 'tenantFaq', 'aymanOnly'] as const;

/**
 * Identifiers that decide WHICH STACK this is, at the head of a conditional.
 *
 * `IS_AYMAN` and `TENANT_KEY` are the two tenant switches. `SEEDS_OFFICIAL_SEO`
 * is the third and is not named for them: it is `INHERITS_OFFICIAL_PROFILES`
 * from `seed-data/tenant-contact.ts`, the one decision that governs whether a
 * database gets his settings row seeded into it at all — and `seed.ts` reads
 * `copy.seo.defaultTitle` behind exactly that ternary, on purpose, with a long
 * note explaining that a seeded title BEAT the tenant-aware fallback on the
 * page. A gate that is not spelled `IS_AYMAN` is still a gate.
 */
const TENANT_SWITCHES = ['IS_AYMAN', 'TENANT_KEY', 'SEEDS_OFFICIAL_SEO'] as const;

/**
 * The gate modules themselves, which necessarily read what they gate.
 *
 * `tenant-sentence.ts` holds the ordered list of spellings; the two
 * `tenant-copy.ts` files pass `copy.site.name` to `tenantName()` as the
 * fallback argument. Exempting them is not a promise about a consumer — there
 * is no consumer here. It is the same shape as excluding a dictionary from a
 * spell-check.
 */
const COPY_GATE_MODULES = new Set(
  [
    'packages/contracts/src/copy/tenant-sentence.ts',
    'apps/web/lib/tenant-copy.ts',
    'apps/api/src/common/tenant-copy.ts',
  ].map(repoPath),
);

/**
 * Reads whose gate is in the component they are HANDED TO, one hop away.
 *
 * ⚠️ Every line here is a promise, and the docblock on `GATED_AT_POINT_OF_USE`
 * records what this repo's promises have been worth. Open the file, find the
 * call, then leave the entry.
 *
 * `wraps` is what keeps the assertion below from being one of those promises.
 * Naming the gate alone would pass on a file that calls `tenantSentence()` on
 * some OTHER string — which is exactly the shape of the bug this whole sweep
 * exists for, `assistant-widget.tsx` gating two constants and rendering a
 * third raw. Naming the ARGUMENT means the check is `tenantSentence(body)`,
 * the expression that actually has to be there. It still cannot prove the
 * prop reaching that expression is the one this page passed; one hop is the
 * limit of a text scan, and the entry is a promise about that hop.
 *
 * `/privacy` and `/terms` hand their section bodies to `<LegalSection>`, and
 * `components/site/legal-page.tsx` renders every one of them through
 * `tenantSentence()`. The gate sits there ON PURPOSE and that file says why in
 * as many words: a per-page gate is a list somebody has to remember to add to,
 * and these are the two pages that name a data controller and a copyright
 * holder. Pulling the gate back onto the pages to satisfy this sweep would
 * trade a property that holds for new sections automatically for one that
 * holds until the next section is written.
 */
const GATED_BY_THE_RECEIVING_COMPONENT: readonly {
  path: string;
  key: string;
  renderedBy: string;
  gate: string;
  /** The identifier the gate is called ON, inside `renderedBy`. */
  wraps: string;
}[] = [
  {
    path: 'apps/web/app/(site)/privacy/page.tsx',
    key: 'legal.ownerBody',
    renderedBy: 'apps/web/components/site/legal-page.tsx',
    gate: 'tenantSentence',
    wraps: 'body',
  },
  {
    path: 'apps/web/app/(site)/terms/page.tsx',
    key: 'legal.ownerBody',
    renderedBy: 'apps/web/components/site/legal-page.tsx',
    gate: 'tenantSentence',
    wraps: 'body',
  },
  {
    path: 'apps/web/app/(site)/terms/page.tsx',
    key: 'legal.termsContentBody',
    renderedBy: 'apps/web/components/site/legal-page.tsx',
    gate: 'tenantSentence',
    wraps: 'body',
  },
];

/** A read this sweep has been told about. */
const isHandedOff = (path: string, key: string): boolean =>
  GATED_BY_THE_RECEIVING_COMPONENT.some(
    (entry) => repoPath(entry.path) === path && entry.key === key,
  );

/**
 * Every dotted path in the copy table whose value carries a spelling.
 *
 * `taintedLeaves` are the strings themselves. `taintedTables` are the objects
 * and arrays ABOVE them — `assistant.knowledge`, `assistant.script` — because
 * a consumer that maps the whole table never names the leaf, and the elements
 * it hands on are the same strings.
 */
const taintedLeaves = new Set<string>();
const taintedTables = new Set<string>();
(function collect(node: unknown, path: string[]): boolean {
  if (typeof node === 'string') {
    if (!NAME_LITERALS.some(({ literal }) => node.includes(literal))) return false;
    taintedLeaves.add(path.join('.'));
    return true;
  }
  if (node === null || typeof node !== 'object') return false;
  let any = false;
  for (const [key, value] of Object.entries(node)) if (collect(value, [...path, key])) any = true;
  if (any && path.length > 0) taintedTables.add(path.join('.'));
  return any;
})(copy, []);

/**
 * Walk a dotted path against the real object, consuming as far as it goes.
 *
 * Resolving against the VALUE rather than against a list of strings is what
 * makes `copy.assistant.knowledge.map` resolve to the table (`map` is not a
 * key, so the walk stops) while `c.somethingElse` on an alias resolves to
 * nothing at all. A local variable that happens to share a name with an alias
 * therefore drops out instead of being reported.
 */
function resolveCopyPath(base: readonly string[], segments: readonly string[]): string[] | null {
  const path = [...base];
  let node: unknown = base.reduce<unknown>(
    (current, key) =>
      current !== null && typeof current === 'object'
        ? (current as Record<string, unknown>)[key]
        : undefined,
    copy,
  );
  let consumed = 0;
  for (const segment of segments) {
    if (node === null || typeof node !== 'object') break;
    if (!Object.prototype.hasOwnProperty.call(node, segment)) break;
    node = (node as Record<string, unknown>)[segment];
    path.push(segment);
    consumed++;
  }
  return consumed > 0 ? path : null;
}

/** `[start, end]` of every gate call's parentheses. */
function gateCallSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const gate of COPY_GATES) {
    const opener = new RegExp(`\\b${gate}\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = opener.exec(source))) {
      let depth = 0;
      let at = match.index + match[0].length - 1;
      for (; at < source.length; at++) {
        if (source[at] === '(') depth++;
        else if (source[at] === ')' && --depth === 0) break;
      }
      spans.push([match.index, at]);
    }
  }
  return spans;
}

/**
 * `[start, end]` of every `<switch> ? … : …`, from the switch to the end of
 * the conditional.
 *
 * The end is found by walking forward to the first `;` or `,` at depth zero,
 * or to the closer of a bracket this expression is inside — which is what
 * makes `...(IS_AYMAN ? { keywords: [...copy.seo.keywords] } : {})` one span
 * rather than three.
 */
function conditionalSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  const switches = new RegExp(`\\b(?:${TENANT_SWITCHES.join('|')})\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = switches.exec(source))) {
    // Up to the `?`, and only if nothing has ended the expression first.
    const ahead = source.slice(match.index, match.index + 60);
    const question = ahead.indexOf('?');
    if (question === -1 || /[;{}]/.test(ahead.slice(0, question))) continue;
    let depth = 0;
    let at = match.index + question + 1;
    for (; at < source.length; at++) {
      const char = source[at] ?? '';
      if ('([{'.includes(char)) depth++;
      else if (')]}'.includes(char)) {
        if (depth === 0) break;
        depth--;
      } else if ((char === ';' || char === ',') && depth === 0) break;
    }
    spans.push([match.index, at]);
  }
  return spans;
}

/** The expression that CONSUMES a table read — `…knowledge.filter(…).map(…)`. */
function consumingExpression(source: string, from: number): string {
  let depth = 0;
  let at = from;
  for (; at < source.length; at++) {
    const char = source[at] ?? '';
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) {
      if (depth === 0) break;
      depth--;
    } else if ((char === ';' || char === ',') && depth === 0) break;
  }
  return source.slice(from, at);
}

interface Declaration {
  name: string;
  start: number;
  end: number;
}

/** `const NAME = …` — name, and the span of the initialiser. */
function declarations(source: string): Declaration[] {
  const found: Declaration[] = [];
  /*
   * `[^=\n]*` allows a `;` between the name and the `=`, because a TYPE
   * ANNOTATION contains them: `const DEFAULT_HOME_BLOCKS: readonly { key:
   * string; props: HomeBlockProps }[] = […]`. Excluding `;` here silently
   * skipped exactly the declarations that are long enough to need one, which
   * is to say the tables. The newline is the real boundary — an `=` that ends
   * up on the next line is a declaration this does not claim to have found.
   */
  const declaration = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)[^=\n]*=/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source))) {
    let depth = 0;
    let at = match.index + match[0].length;
    for (; at < source.length; at++) {
      const char = source[at] ?? '';
      if ('([{'.includes(char)) depth++;
      else if (')]}'.includes(char)) {
        if (depth === 0) break;
        depth--;
      } else if (char === ';' && depth === 0) break;
    }
    found.push({ name: match[1] ?? '', start: match.index + match[0].length, end: at });
  }
  return found;
}

const isInside = (spans: readonly [number, number][], at: number): boolean =>
  spans.some(([start, end]) => at > start && at < end);

/** Only files that could read the table at all. */
const IMPORTS_COPY = /from\s+'(?:@ayman\/contracts(?:\/copy[\w/-]*)?|[./]+copy\/(?:ar|admin))'/;

/** Consumers: everything the literal scan walks, minus the tables and the gates. */
const consumerFiles = files.filter(
  (path) => !IDENTITY_SOURCE_TABLES.includes(path) && !COPY_GATE_MODULES.has(path),
);

interface Finding {
  path: string;
  line: number;
  read: string;
  key: string;
}

function sweep(): Finding[] {
  const findings: Finding[] = [];
  for (const path of consumerFiles) {
    if (!IMPORTS_COPY.test(readFileSync(join(REPO_ROOT, path), 'utf8'))) continue;
    const source = sourceOf(path);
    const spans = [...gateCallSpans(source), ...conditionalSpans(source)];
    const declared = declarations(source);

    /**
     * ONE level of aliasing, which is the only level this repo uses: eighty-odd
     * files open with `const c = copy.<something>;` and read `c.key` from
     * there. Two levels would need a resolver; nothing here asks for one.
     */
    const bases: [string, string[]][] = [['copy', []]];
    const alias = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*copy((?:\.[A-Za-z_$][\w$]*)+)\s*;/g;
    let aliasMatch: RegExpExecArray | null;
    while ((aliasMatch = alias.exec(source))) {
      const resolved = resolveCopyPath([], (aliasMatch[2] ?? '').slice(1).split('.'));
      if (resolved) bases.push([aliasMatch[1] ?? '', resolved]);
    }

    /** Every read of this identifier outside its own declaration is gated. */
    const readsAllGated = (name: string): boolean => {
      // An exported constant can be read from a file this function cannot see.
      // Comments are already stripped, so a docblock naming it does not count.
      const elsewhere = consumerFiles.some(
        (other) => other !== path && new RegExp(`\\b${name}\\b`).test(sourceOf(other)),
      );
      if (elsewhere) return false;
      const mine = declared.filter((entry) => entry.name === name);
      const uses = new RegExp(`\\b${name}\\b`, 'g');
      let use: RegExpExecArray | null;
      let seen = 0;
      while ((use = uses.exec(source))) {
        if (mine.some((entry) => use!.index >= entry.start && use!.index < entry.end)) continue;
        if (mine.some((entry) => use!.index < entry.start && entry.start - use!.index < 200))
          continue; // the `const NAME` of the declaration itself
        seen++;
        if (!isInside(spans, use.index)) return false;
      }
      return seen > 0;
    };

    for (const [base, basePath] of bases) {
      const reads = new RegExp(`\\b${base}((?:\\.[A-Za-z_$][\\w$]*)+)`, 'g');
      let read: RegExpExecArray | null;
      while ((read = reads.exec(source))) {
        // `keyof typeof copy.assistant.script` is a TYPE. It renders nothing.
        if (/\btypeof\s+$/.test(source.slice(Math.max(0, read.index - 12), read.index))) continue;
        const resolved = resolveCopyPath(basePath, (read[1] ?? '').slice(1).split('.'));
        if (!resolved) continue;
        const key = resolved.join('.');
        const leaf = taintedLeaves.has(key);
        const table = taintedTables.has(key);
        if (!leaf && !table) continue;
        // `const c = copy.assistant;` is a hand-off, not a render.
        if (base === 'copy' && table && bases.some(([, aliased]) => aliased.join('.') === key))
          continue;
        if (isInside(spans, read.index)) continue;
        // A whole-table read: the best this can see is that the expression
        // consuming it goes through a gate. See the docblock's last section.
        if (table && new RegExp(`\\b(?:${COPY_GATES.join('|')})\\s*\\(`).test(consumingExpression(source, read.index)))
          continue;
        const holder = declared.find(
          (entry) => read!.index >= entry.start && read!.index < entry.end,
        );
        if (holder && readsAllGated(holder.name)) continue;
        if (isHandedOff(path, key)) continue;
        findings.push({
          path,
          line: source.slice(0, read.index).split('\n').length,
          read: `${base}${read[1]}`,
          key,
        });
      }
    }
  }
  return findings;
}

describe('a copy key that carries the name is never read without a gate', () => {
  it('finds consumers to check at all', () => {
    // Without this the sweep passes vacuously the day the import regex stops
    // matching — the copy table is imported under four different specifiers.
    expect(taintedLeaves.size).toBeGreaterThan(50);
    expect(
      consumerFiles.filter((path) =>
        IMPORTS_COPY.test(readFileSync(join(REPO_ROOT, path), 'utf8')),
      ).length,
    ).toBeGreaterThan(100);
  });

  it('every hand-off entry still shows the gate wrapping the prop', () => {
    for (const { path, key, renderedBy, gate, wraps } of GATED_BY_THE_RECEIVING_COMPONENT) {
      expect(
        sourceOf(repoPath(renderedBy)).replace(/\s+/g, ''),
        `${path} reads \`${key}\` ungated because ${renderedBy} renders it through ` +
          `\`${gate}(${wraps})\`, and that call is no longer in that file's code. ` +
          `Either the gate moved — update the entry — or it is gone and both legal ` +
          `pages are publishing the wrong data controller.`,
      ).toContain(`${gate}(${wraps})`);
    }
  });

  it('has no ungated read anywhere under the scanned roots', () => {
    const findings = sweep();
    expect(
      findings.map(({ path, line, read, key }) => `${path}:${line}  ${read}  (copy.${key})`),
      `A copy key whose VALUE contains the instructor's name is read here and ` +
        `rendered as-is. Wrap it: \`tenantName()\` when the key IS a name, ` +
        `\`tenantSentence()\` when the name sits inside a sentence, \`aymanOnly()\` ` +
        `when the string is a fact about him that no substitution makes true. ` +
        `The grep above cannot see this class of leak — the literal is in ` +
        `copy/ar.ts, which is exempt, and the file that prints it contains no ` +
        `spelling of the name at all.`,
    ).toEqual([]);
  });
});
