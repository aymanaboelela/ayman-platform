import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgentLinkHeader } from './discovery';

/**
 * The guard that keeps the `Link` header out of page responses — as a UNIT
 * test, on the merge path.
 *
 * ## Why this file exists at all, when `e2e/agent-discovery.e2e.ts` already
 * ## asserts the same invariant
 *
 * Because that suite no longer runs before a merge. `67d80eb` took Playwright
 * off the merge path — its `e2e` job is now
 * `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'` —
 * for a defensible reason (4-5 minutes against ~2 for everything else). The
 * side effect is that the two guards standing between this repo and a repeat of
 * the 2026-08-06 outage stopped running on pull requests.
 *
 * That outage: a `Link` header on page responses grew by one copy of itself on
 * every cache revalidation — measured +2595 bytes every five minutes, to
 * 38,234 — until Node's `fetch` refused the response at 16KB, the container
 * healthcheck (which used `fetch`) reported unhealthy, and Traefik depooled a
 * container that was serving perfectly well. It happened twice, the second time
 * within hours of a redeploy that had "fixed" the first.
 *
 * ## What this can and cannot check
 *
 * The e2e tests assert the EFFECT: bytes on the wire, on a real server. A unit
 * test cannot do that, and pretending otherwise would produce a test that
 * passes on a broken build — which is the failure mode
 * `e2e/agent-discovery.e2e.ts` already documents at length about the "thirty
 * requests do not grow it" test that could never work.
 *
 * So this asserts the CAUSE instead, and the cause is enumerable. A header
 * reaches a page response through exactly two doors:
 *
 *   1. `proxy.ts` — `response.headers.set('Link', …)` on a page response.
 *   2. `next.config.ts` — an `async headers()` rule matching a page path.
 *
 * Nothing else can put one there: pages themselves have no access to the
 * response headers, and `metadata` produces `<link>` ELEMENTS, which are part
 * of the cached HTML and therefore replaced on re-render rather than appended
 * to. Both doors are watched below.
 *
 * Route handlers are deliberately NOT restricted. A rewrite to a route handler
 * is not a cached page shell — that is why the markdown twin can carry the
 * header safely, and it is verified in production rather than assumed.
 *
 * The e2e assertions stay where they are. They still run nightly, and they are
 * still the only thing that can catch the header growing for a reason nobody
 * predicted. This file is the fast half, not a replacement.
 */

const WEB_ROOT = path.join(import.meta.dirname, '..', '..');

/**
 * Comment-stripped source. Not optional: both files discuss this header at
 * length in prose — `proxy.ts` quotes `headers.delete('Link')` while explaining
 * why it did not help, and `next.config.ts` carries a ⚠️ block telling the next
 * maintainer not to add a `Link` rule. Scanning the raw text would flag those
 * comments as violations, and the natural fix for the resulting red build would
 * be to delete the warnings.
 */
function stripComments(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      // `(^|\s)` before `//` is what keeps `https://…` inside a string literal
      // intact — there the slashes follow a colon, not whitespace.
      .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
      .join('\n')
  );
}

const read = (relative: string): string =>
  stripComments(readFileSync(path.join(WEB_ROOT, relative), 'utf8'));

/**
 * The `[start, end)` span of the block opened by the first `{` at or after
 * `needle`, by brace matching.
 *
 * ⚠️ Brace matching rather than "the next interesting line", and that is a
 * correction rather than a flourish. The first version of this file bounded the
 * markdown branch by the index of `resolveRedirect(request)` — the call that
 * begins page handling — which looks equivalent and is not: everything sitting
 * BETWEEN the branch's closing brace and that call falls inside the window. A
 * `Link` set moved to exactly that spot kept the count at one, sat outside the
 * branch, and the test went green. Verified by injecting it.
 */
function blockSpan(code: string, needle: string): [number, number] {
  const from = code.indexOf(needle);
  if (from < 0) return [-1, -1];
  const open = code.indexOf('{', from);
  if (open < 0) return [-1, -1];

  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return [open, i];
    }
  }
  return [open, code.length];
}

describe('proxy.ts — door 1', () => {
  const code = read('proxy.ts');
  const sets = [...code.matchAll(/headers\.(?:set|append)\(\s*['"]Link['"]/gi)];

  it('sets the Link header exactly once', () => {
    expect(
      sets.length,
      'a second `Link` on a page response is the outage; the only legitimate one is the markdown rewrite',
    ).toBe(1);
  });

  it('sets it inside the markdown-rewrite branch, not on a page response', () => {
    /*
     * Positional rather than syntactic, and that is enough here: the markdown
     * branch is the first thing `proxy()` does after the dev-route checks, and
     * everything that serves a PAGE comes after `resolveRedirect`. A `Link` set
     * anywhere below that line is on a cached shell.
     *
     * ⚠️ EVERY match, not `sets[0]`. The first draft checked only the first one
     * and passed against an injected violation — a `Link` set added further down
     * left the legitimate markdown one as match zero, so this assertion looked
     * at the innocent line and went green. The count test above happened to
     * catch that particular case; the one it would NOT catch is a `Link` set
     * MOVED onto the page path, where the count stays at one. Verified by
     * injecting both before trusting either.
     */
    const [branchOpen, branchClose] = blockSpan(code, 'if (markdownTarget)');

    expect(branchOpen, 'the markdown branch has moved or been renamed').toBeGreaterThan(-1);

    for (const match of sets) {
      const at = match.index ?? -1;
      const line = code.slice(0, at).split('\n').length;
      expect(
        at > branchOpen && at < branchClose,
        `the \`Link\` set at line ~${line} is OUTSIDE the markdown-rewrite branch. On a page ` +
          `response this header is captured into the cached shell and re-added on every ` +
          `revalidation — see the outage note in proxy.ts.`,
      ).toBe(true);
    }
  });
});

describe('next.config.ts — door 2', () => {
  const code = read('next.config.ts');

  it('declares no Link header rule', () => {
    /*
     * The door that looks safe and is not. `router-server.js` applies config
     * header rules with `res.setHeader` BEFORE the render, and
     * `app-render.js`'s `setMetadataHeader` then does
     * `metadata.headers[name] = res.getHeader(name)` when React appends its
     * font preloads — so the value is captured into the cache entry exactly the
     * way a middleware-set one is. Measured on a real standalone build on
     * 2026-08-12: one forced revalidation took the stored value from one copy
     * (901 bytes) to two (1081).
     *
     * `Cache-Control` rules are fine and expected here; nothing reads those
     * back.
     */
    expect(
      code,
      'a Link rule here accumulates into the cached shell — publish it from Cloudflare instead (deploy/cloudflare/)',
    ).not.toMatch(/key:\s*['"]Link['"]/i);
  });
});

describe('the relation list stays small', () => {
  /*
   * Not the accumulation guard — that is structural and lives above. This is
   * the other way the header got dangerous: seven relations is 466 bytes, and
   * a list that grows one well-meaning entry at a time is how a header ends up
   * mattering. The ceiling is deliberately far below the 8KB the e2e asserts on
   * the wire, because this value is only one of several `Link` headers a
   * response carries — Next adds its own ~723 bytes of font preloads.
   */
  it('is well under any limit a client imposes', () => {
    const value = buildAgentLinkHeader(null);
    expect(value.length, `Link value is ${value.length} bytes`).toBeLessThan(1024);
  });

  it('still carries a relation the readiness scan counts', () => {
    // Serving a correct header of relations nobody counts reads as a pass in
    // review and a failure in the scan.
    const counted = ['api-catalog', 'service-desc', 'service-doc', 'describedby'];
    expect(counted.some((rel) => buildAgentLinkHeader(null).includes(`rel="${rel}"`))).toBe(true);
  });
});
