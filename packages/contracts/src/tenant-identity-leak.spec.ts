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
 */

/** Real-world identity that must never be a fallback in shipped code. */
/**
 * Files that still carry the instructor's NAME in shipped strings.
 *
 * Recorded rather than asserted away, the same shape as the clipping colours
 * in `packages/ui/src/lib/oklch.test.ts`. The string tables under `copy/` are
 * Ayman's copy by design — de-Aymanizing them is its own piece of work, and
 * doing it badly is worse than not yet doing it. The assistant files now
 * interpolate `copy.site.instructor` rather than the bare name, so they carry
 * it only through that table.
 *
 * What the list buys is that a TENTH file fails this test. The name is the one
 * leak that needs no configuration to reach a student — it is simply printed.
 */
const KNOWN_NAME_FILES = [
  // A GATED fallback, not a hardcoded identity: the snippet reads
  // `TENANT_DISPLAY_NAME` and only falls back to the name when this deployment
  // has not been given one — the same rule `TENANT_CONTACT_SEED` follows. The
  // file is listed because the literal is still present, which is what this
  // test measures.
  'apps/web/components/site/code-lab.tsx',
  // The same GATED shape, found by this very test. Two `representativeQueries`
  // in the ARD manifest were the name written out, on the one document the
  // site publishes specifically to be believed by assistants — so another
  // instructor's stack was claiming Ayman's books and Ayman's teaching. Both
  // now read `TENANT_DISPLAY_NAME` and fall back to the name, which is why the
  // literal is still here and why the file is listed rather than cleared.
  'apps/web/app/.well-known/ai-catalog.json/route.ts',
  'apps/api/src/modules/assistant/ai/assistant-knowledge.ts',
  'apps/api/src/modules/marketing/marketing.controller.ts',
  'apps/api/src/scripts/create-admin.ts',
  'apps/api/src/scripts/finance-reconcile.ts',
  'packages/contracts/src/copy/admin.ts',
  'packages/contracts/src/copy/ar.ts',
  'packages/contracts/src/copy/outreach.ts',
];

const FORBIDDEN: readonly { literal: string; what: string }[] = [
  { literal: '+201021196367', what: "Ayman's personal WhatsApp number" },
  { literal: '201021196367', what: "Ayman's WhatsApp number without the +" },
  { literal: 'aymanaboelela.com', what: "Ayman's domain (and its subdomains)" },
];

/** Source roots, relative to the repo root. */
const ROOTS = [
  'apps/api/src',
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/cache-handler',
  'packages/contracts/src',
  'packages/ui/src',
  'services/wa/src',
  'scripts',
];

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
]);

const SKIP_DIRS = new Set(['node_modules', 'generated', '.next', 'dist', '__snapshots__']);

const CODE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

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

/**
 * Strips `//` and block comments so prose about a number is not a finding.
 *
 * Deliberately crude — it does not parse strings, so a `//` inside a string
 * literal truncates that line early. That direction is safe: it can only make
 * the check MISS something, never invent a failure, and the things it would
 * miss (a URL literal containing `//` before the host) do not exist for these
 * three needles, all of which appear after `https://`. Block comments are
 * removed first so that a `//` inside one does not confuse the line pass.
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return withoutBlocks
    .split('\n')
    .map((line) => {
      const at = line.indexOf('//');
      if (at === -1) return line;
      // Keep `https://` and friends: only treat `//` as a comment when it is
      // not immediately preceded by a colon.
      if (at > 0 && line[at - 1] === ':') {
        const next = line.indexOf('//', at + 2);
        return next === -1 ? line : line.slice(0, next);
      }
      return line.slice(0, at);
    })
    .join('\n');
}

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** Every shipped source file under the roots above — shared by both suites. */
const files = ROOTS.flatMap((root) => walk(join(REPO_ROOT, root), []))
  .map((absolute) => relative(REPO_ROOT, absolute))
  .filter((path) => !isTestFile(path))
  .filter((path) => !ALLOWED_FILES.has(path));

describe('no shipped default carries one instructor’s identity', () => {

  it('finds source files to check at all', () => {
    // Without this the suite passes vacuously the day a directory is renamed.
    expect(files.length).toBeGreaterThan(300);
  });

  for (const { literal, what } of FORBIDDEN) {
    it(`does not hardcode ${what}`, () => {
      const offenders = files.filter((path) =>
        stripComments(readFileSync(join(REPO_ROOT, path), 'utf8')).includes(literal),
      );

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
  it('appears in exactly the files already known, and no new one', () => {
    // Unlike the phone and the domain, a NAME needs no configuration to reach
    // a student — it is printed. `code-lab.tsx` was the last file outside the
    // string tables to hardcode it.
    const carrying = files.filter((path) =>
      stripComments(readFileSync(join(REPO_ROOT, path), 'utf8')).includes('أيمن'),
    );

    expect(carrying.sort()).toEqual([...KNOWN_NAME_FILES].sort());
  });
});
