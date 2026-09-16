import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  // `representativeQueries` — the search phrases the catalog claims to answer.
  // Hamza-less on purpose: it is how students actually type it. Verified:
  // `...(IS_AYMAN ? ['ايمن ابو العلا برمجة'] : [])`, and the `name` beside it
  // goes through `tenantName(copy.site.platformName)`.
  { path: 'apps/web/app/.well-known/ai-catalog.json/route.ts', gate: 'IS_AYMAN' },
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
   * ── Rendered by nothing ─────────────────────────────────────────────────
   *
   * `code-lab.tsx` already reads `TENANT_DISPLAY_NAME` and falls back to the
   * name only for Ayman's own stack, and its own docblock records that no
   * route renders the component today. Listed rather than rewritten so the
   * gate that IS there is not mistaken for an oversight.
   */
  join('apps', 'web', 'components', 'site', 'code-lab.tsx'),

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
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
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
