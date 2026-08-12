import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The counterpart to `loading-coverage.test.ts`, and it exists for a blunter
 * reason than that one does.
 *
 * Until this pass, `git ls-tree -r origin/main -- apps/web/app | grep error`
 * returned NOTHING. Every unhandled throw under `app/` — a Server Component
 * that could not reach the API, a cache read that came back empty, anything —
 * fell through to Next's built-in error page: unstyled, left-to-right, in
 * English, on a product that is Arabic and RTL everywhere else. A student was
 * handed that mid-lesson.
 *
 * Nothing in the toolchain notices that absence. A missing `error.tsx` is not
 * a type error, not a lint error and not a build warning; the app builds,
 * boots and works, and the gap is visible only at the moment it is too late to
 * do anything about. It went unnoticed through three phases of performance and
 * UX work for exactly that reason. This file is the thing that notices.
 *
 * Deliberately cheap: it reads files off disk and matches strings. No render,
 * no jsdom, no Next runtime — so it costs milliseconds and cannot flake, which
 * is what makes it safe to keep on the merge path.
 */
const APP_DIR = join(import.meta.dirname, '..', 'app');

/**
 * The route groups — `app/(app)`, `app/(site)`, `app/(admin)`, `app/(auth)`.
 *
 * Discovered rather than listed, so a fifth group added later is covered on
 * the day it is created rather than on the day someone remembers this file.
 * A group with no `layout.tsx` is not a surface with its own chrome, so it has
 * nothing of its own to keep on screen and nothing to test.
 */
const ROUTE_GROUPS = readdirSync(APP_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
  .map((entry) => entry.name)
  .filter((name) => readdirSync(join(APP_DIR, name)).some((f) => /^layout\.tsx?$/.test(f)))
  .sort();

const boundaryIn = (dir: string) =>
  readdirSync(join(APP_DIR, dir)).find((f) => /^error\.tsx?$/.test(f));

/**
 * Comments out, code in — and this is not tidiness, it is what makes the
 * assertions below mean anything in THIS repo.
 *
 * Every module here explains itself at length, and an error boundary explains
 * itself more than most: four of these five files carry a paragraph on why
 * `error.message` is never rendered. A naive scan for `error.message` finds
 * those paragraphs and reports the documentation as the violation it
 * describes — which is exactly what the first run of this file did. A guard
 * that fires on its own rationale is a guard people learn to skip.
 *
 * Block comments cover `{/* … *\/}` too, since a JSX comment is a block
 * comment inside braces. The `[^:'"\`\\]` guard on the line-comment rule is
 * there so a `https://` inside a string is not mistaken for one.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/**
 * Every boundary in the app as `[label, code]`, `global-error.tsx` included.
 * `code` is comment-stripped — see above.
 */
function allBoundaries(): [string, string][] {
  const files: [string, string][] = ROUTE_GROUPS.filter(boundaryIn).map((dir) => [
    `${dir}/${boundaryIn(dir)}`,
    stripComments(readFileSync(join(APP_DIR, dir, boundaryIn(dir)!), 'utf8')),
  ]);
  const global = readdirSync(APP_DIR).find((f) => /^global-error\.tsx?$/.test(f));
  if (global) files.push([global, stripComments(readFileSync(join(APP_DIR, global), 'utf8'))]);
  return files;
}

/** The comment-stripped source of `app/global-error.tsx`, or `null` if absent. */
function globalErrorSource(): string | null {
  const file = readdirSync(APP_DIR).find((f) => /^global-error\.tsx?$/.test(f));
  return file ? stripComments(readFileSync(join(APP_DIR, file), 'utf8')) : null;
}

describe('error boundary coverage', () => {
  it('gives every route group with its own chrome an error.tsx', () => {
    const missing = ROUTE_GROUPS.filter((dir) => !boundaryIn(dir));
    expect(
      missing,
      `route groups with a layout but no error.tsx — a throw under these falls all the way to global-error.tsx, which replaces the whole document: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the root error.tsx that catches the GROUP LAYOUTS themselves', () => {
    // The group boundaries above cannot catch a throw in their own segment's
    // `layout.tsx` — Next's `error.tsx` wraps what is BELOW it. Two live paths
    // depend on this file existing: `(admin)/layout.tsx` awaits `getSession()`,
    // which throws on any non-401 non-ok (a 429 from the shared throttle bucket
    // is one), and the Suspense-wrapped chrome slots the group layouts render
    // all do server I/O. Delete this and both land on `global-error.tsx`, which
    // throws away the fonts and the stylesheet along with the page.
    //
    // It also covers the routes in no group at all: /offline, /md, /docs/api,
    // /dev/*.
    const root = readdirSync(APP_DIR).find((f) => /^error\.tsx?$/.test(f));
    expect(root, 'app/error.tsx is missing').toBeDefined();
  });

  it('keeps a global-error.tsx for a failure in the root layout', () => {
    // The only boundary that catches `app/layout.tsx` itself. Without it, a
    // throw in `getBranding()` — the one await that layout does — takes the
    // entire product to Next's default page on every single route at once.
    const global = readdirSync(APP_DIR).find((f) => /^global-error\.tsx?$/.test(f));
    expect(global, 'app/global-error.tsx is missing').toBeDefined();
  });

  it('keeps every boundary a Client Component', () => {
    // Not a style rule. An error boundary is React's `componentDidCatch`, and
    // catching requires a class component in the client runtime — Next builds
    // one around this module. A Server Component here is a build error, but
    // finding it here costs milliseconds and finding it in `next build` costs
    // a full compile.
    const offenders = allBoundaries()
      .filter(([, code]) => !/^\s*['"]use client['"]/m.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these error boundaries are missing 'use client': ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('wires reset() to a control the user can press', () => {
    // `reset` is half the contract, and accepting the prop is not the same as
    // offering it: a boundary that renders an apology and no way to re-attempt
    // the render is a dead end for anyone whose failure was transient — which
    // is most of them, since the two causes this net was hung under (a
    // throttled API read, a purged cache cluster) both clear on their own
    // within a minute.
    //
    // Matched on the CALL SITE rather than on the prop, because the destructured
    // parameter is what a boundary gets for free and the handler is what it has
    // to have been given on purpose.
    const offenders = allBoundaries()
      .filter(([, code]) => !/onClick=\{\s*reset\s*\}|\breset\(\)/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries never let anyone retry the render: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('shows error.digest so a failure can be quoted', () => {
    // The digest is the hash Next prints in the server log beside the real
    // stack, and in production it is the ONLY handle anyone — a student
    // messaging المساعد, an editor grepping the log — has on one specific
    // failure. It is rendered conditionally everywhere, because it is
    // undefined in development and for a client-side throw.
    const offenders = allBoundaries()
      .filter(([, code]) => !/\berror\.digest\b/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries never show error.digest, so a failure on them cannot be traced to a log line: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('offers a real navigation beside reset()', () => {
    // `reset()` alone strands anyone whose error is DETERMINISTIC: it
    // re-renders the identical segment and reproduces the identical throw, for
    // as long as they keep pressing. Every boundary therefore carries a second
    // action that leaves the failing route.
    //
    // `global-error.tsx` is exempt and has to be: it fires when the ROOT
    // layout threw, so every route in the product goes through the same broken
    // code and there is nowhere to send anyone. Its second action is a full
    // document load instead — a different kind of retry, not a destination.
    const offenders = allBoundaries()
      .filter(([label]) => !/^global-error\./.test(label))
      .filter(([, code]) => !/<a\s[^>]*href=|<Link\s/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries offer no way out of the failing route: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('never renders error.message', () => {
    // In a production build Next replaces a Server Component error's message
    // with one fixed generic sentence before it reaches the client, so
    // printing it says nothing; in development it is a stack trace, which on
    // the student surface is noise and on the public surface is a leak.
    // `error.digest` is the value meant to be shown, and every boundary shows
    // that instead.
    const offenders = allBoundaries()
      .filter(([, code]) => /\berror\.message\b/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries render error.message; render error.digest instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('takes every string from the contracts copy table', () => {
    const offenders = allBoundaries()
      .filter(([, code]) => !/from ['"]@ayman\/contracts\/copy(\/admin)?['"]/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries do not import the copy table: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('hardcodes no Arabic in a boundary', () => {
    // The rule the whole product runs on — no user-facing literal in a
    // component — and the one an error screen is likeliest to break, because
    // it gets written in a hurry while something is on fire. It matters more
    // here than on an ordinary page: these five are the screens most likely to
    // be the first thing a future English routing layer has to translate, and
    // the ones nobody thinks to check.
    //
    // Comments are already gone (see `stripComments`), which is what makes
    // scanning the Arabic codepoint range possible at all — several of these
    // files quote the Arabic they are explaining.
    const offenders = allBoundaries()
      .filter(([, code]) => /[؀-ۿ]/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries contain an Arabic literal; add the key to packages/contracts/src/copy/ar.ts (or copy/admin.ts) instead: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('does not swallow the error', () => {
    // A boundary is a `catch`, and a `catch` that only draws a calm screen is
    // a `catch` that hides the failure. `useErrorReport` (lib/report-error.ts)
    // is the single seam where that is handed on, and its header records that
    // this repo currently has no client error reporting at all — so the day a
    // reporter is added, one file changes and all five boundaries start
    // reporting. This keeps them all wired to it.
    const offenders = allBoundaries()
      .filter(([, code]) => !/useErrorReport\(/.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries never report the error they caught: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('renders its own <html lang="ar" dir="rtl"> from global-error.tsx', () => {
    // It REPLACES the root layout rather than rendering inside it, so nothing
    // else emits the document element. Without these two attributes the one
    // screen shown when the whole app is down is the one screen with no
    // language and no direction — Arabic laid out left-to-right, which is the
    // exact failure this whole pass was written to stop.
    const code = globalErrorSource();
    if (code === null) return; // the dedicated test above owns this failure.
    expect(code).toMatch(/<html\b[^>]*\blang="ar"/);
    expect(code).toMatch(/<html\b[^>]*\bdir="rtl"/);
    expect(code, 'global-error.tsx must render its own <body>').toMatch(/<body\b/);
  });

  it('imports no stylesheet into global-error.tsx', () => {
    // The page exists because the root layout failed, and the root layout is
    // what imports `globals.css`. A stylesheet is also a plausible thing to
    // have BEEN the failure. So this one screen is styled inline and assumes
    // nothing: no CSS import, and no `className` that would resolve through a
    // build artifact it cannot count on.
    const code = globalErrorSource();
    if (code === null) return;
    expect(code, 'global-error.tsx must not import a stylesheet').not.toMatch(
      /import\s+['"][^'"]+\.css['"]/,
    );
  });

  it('uses logical CSS properties only', () => {
    // Every document in this product is `dir="rtl"`, so a physical
    // `left`/`right` is a bug and not a preference — `ms-`/`me-`, `ps-`/`pe-`,
    // `text-start`/`text-end` and `inline-start`/`inline-end` are the
    // spellings that survive.
    //
    // Only checkable because comments are stripped first: the sentence most
    // likely to be written in one of these files is the one warning the next
    // author off the physical spelling, and over raw text this would flag that
    // warning as the violation it describes.
    //
    // Both dialects, because these five files use both: physical Tailwind
    // utilities in the four that render inside a shell, and physical CSS
    // properties in `global-error.tsx`, which is styled inline and could carry
    // a `marginLeft` no utility would.
    const physical =
      /\b(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r)-\d|\btext-(?:left|right)\b|\b(?:margin|padding|border)(?:Left|Right)\b/;
    const offenders = allBoundaries()
      .filter(([, code]) => physical.test(code))
      .map(([label]) => label);
    expect(
      offenders,
      `these boundaries use physical left/right in an RTL document; use the logical property: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
