# Plan 7 — Motion, Atmosphere, and Security Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform its motion layer and its "programming atmosphere" without spending a millisecond of LCP on them, then close the security pass — CSP under observation, Redis-backed rate limiting, an append-only audit log the runtime role cannot delete from, an authorization matrix that actually catches IDOR, CI gates that cannot be bypassed with `--no-verify`, and Playwright + axe coverage on the flows and routes that matter. This is the last plan; after it the product is done, measured, and gated.

**Architecture:** Motion is a *client leaf* concern. `<LazyMotion features={loadFeatures} strict>` + `<MotionConfig reducedMotion="user">` sit in one client provider in the root layout; `children` stay Server Components because they arrive as props. Every animation variant is plain data in `packages/ui`, so the tokens that drive CSS transitions and the variants that drive Motion cannot drift — a test asserts they are the same numbers. The three heavy atmosphere pieces (Shiki, WebGL, 3D) are each isolated behind their own boundary: Shiki runs only on the server, the shader is a dynamically imported client leaf, and the 3D object is gated on `useReducedMotion()` **and** a desktop media query so the `three` chunk is never fetched on mobile. Security is enforced at three layers that do not trust each other: the proxy (headers), the NestJS guards (authorization), and Postgres (least-privilege roles).

**Tech Stack:** `motion@12.42.2` · `@bprogress/next@3.2.12` · `shiki@4.3.1` · `ogl@1.0.11` · `three@0.185.1` + `@react-three/fiber@9.6.1` + `@react-three/drei@10.7.7` · `@nest-lab/throttler-storage-redis@1.2.0` + `ioredis@5.11.1` · `@playwright/test@1.62.0` + `@axe-core/playwright@4.12.1` · gitleaks (CI binary) · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md` §4.4, §4.5, §4.6, §4.7, §7, §8
**Research brief:** `docs/research/2026-07-25-research-brief.md` §3.4–3.7, §6

**Prerequisite:** Plans 1–6 complete. Every version above was verified against the npm registry on 2026-07-26; `@react-three/fiber@9.6.1` declares `react: ">=19 <19.3"`, which our pinned React 19.2.8 satisfies.

---

## Reconciliation notes (cross-plan pass, 2026-07-26)

Reconciled against Plans 3–6. `docs/superpowers/plans/README.md` is normative. This plan runs last
and creates almost no shared interface, so most corrections are to what it *expects*:

1. **There is no `/learn` route in this product.** The player is
   `/courses/[slug]/lessons/[lessonId]` (Plan 4, `(app)` route group) and the quiz runner is
   `/quizzes/[lessonId]` (Plan 5). Task 11's `AUTHENTICATED_PREFIXES` and Task 14's E2E specs are
   corrected. `/courses` and `/courses/[slug]` are **public** and must stay cacheable — the lesson
   path is matched by shape, not by a `/courses` prefix, or a nonce would land on the catalog and
   disable PPR on the surface that carries the SEO.
2. **Plan attribution corrected.** The player is Plan 4, not Plan 5. The quiz engine is Plan 5, not
   Plan 6. Plan 6 is the admin dashboard and platform configuration.
3. **The attempt endpoint is `POST /api/quiz/attempts`**, not `POST /api/attempts` (Plan 5 owns the
   `/api/quiz/*` prefix). Task 14's answer-leak assertion is corrected.
4. **Copy keys:** `copy.admin` is a shared namespace split by sub-key between Plan 3 and Plan 6, so
   flat keys under it collide. This plan expects `copy.admin.course.{new,title,statusPublished}`
   and `copy.admin.common.{save,publish}`, not `copy.admin.{newCourse,courseTitle,save,publish,published}`.
   Namespaces this plan **owns**: `copy.a11y`, `copy.code`, `copy.showpiece`.
5. **`app.audit_log` and its `DELETE`/`UPDATE`/`TRUNCATE` revokes are written by Plan 6's
   `*_platform_config` migration** (Plan 6 Constraint 17). Plan 5's migration does the same for
   `app.attempt_events`. **Task 10 verifies both and adds the session/statement/lock timeouts**; it
   does not create either table and does not re-issue either revoke — a second
   `REVOKE`/`CREATE TABLE` migration against an existing object is at best a no-op and at worst a
   drift report on every `prisma migrate dev`.
6. **Task 9 must preserve Plan 4's throttler tracker.** Plan 1 created `ThrottlerModule.forRoot`;
   Plan 4 Task 4 rewrote it to add `getTracker: trackerFromRequest` to all three named throttlers.
   Task 9 swaps only the `storage` for `@nest-lab/throttler-storage-redis` — copy the existing
   `throttlers` array forward rather than re-authoring it, and add a test asserting the tracker is
   still session-keyed after the swap.
7. **Test-file globs are partitioned three ways and must stay that way:** `apps/api` Jest owns
   `*.spec.ts`, `apps/api` integration owns `*.int-spec.ts`, `apps/web` + `packages/ui` vitest owns
   `*.test.ts(x)` (harness stood up in Plan 3 Task 10 Step 0), and Playwright owns `*.e2e.ts`.
8. **`resolveRedirect` extraction (Task 11 Step 1) is a move, not a rewrite.** Plan 3 Task 11
   Step 3b already turned `proxy.ts`'s protected list into an exported `PROTECTED_PREFIXES`
   constant; keep it, and keep `AUTHENTICATED_PREFIXES` (a CSP concern) separate from it — the two
   lists answer different questions and happen to overlap.

---

## Global Constraints

> **Canonical set.** These nine are identical in Plans 3–7 and are restated in
> `docs/superpowers/plans/README.md` § Global Constraints, which is normative: single origin / no
> CORS · ports 3200 web + 3300 api · RTL logical utilities only · no user-facing literals outside
> `packages/contracts` · extensionless relative imports · `@@schema("app")` on every Prisma model ·
> deny-by-default guards with `resource:action` permissions · no gradients / glass / emoji, radius
> ≤ 8px, no dark-mode shadows · **green and red reserved for quiz correctness**. Never
> `$queryRawUnsafe` / `$executeRawUnsafe` — the ESLint `no-restricted-syntax` rule hard-fails both.

Every task's requirements implicitly include this section. Constraints 1–10 are inherited and still binding; 11–20 are new to this plan.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.** Never hardcode `http://localhost:3300` in web code.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine.
3. **RTL-native.** Logical Tailwind utilities only — `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e`. The `ayman/no-physical-direction` rule sees through `cn()`/`clsx()`/template literals/ternaries/arrays/object keys **and** module-level class constants.
4. **No user-facing string literals outside `packages/contracts`.** `app/dev/*` pages are exempt.
5. **Extensionless relative imports.** `apps/api` uses `module: Preserve` + `moduleResolution: Bundler` with `noEmit: true`; SWC does the real CommonJS emit.
6. **All Prisma models get `@@schema("app")`.** Prisma 7 keeps connection strings out of `schema.prisma`; `prisma generate` does not auto-run after `migrate`.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` strings, never role equality checks. Deny by default.
8. **Separate DTOs per role** with `whitelist: true` + `forbidNonWhitelisted: true`. The realistic attack is a student PATCHing `{completed:true}` or `{score:100}` onto their own row.
9. **Design:** no gradients, no glassmorphism, no emoji icons, radius ≤ 8px on cards, no shadows in dark mode, amber accent used **flat**. Green/red are RESERVED for quiz correctness and must never be decorative.
10. **Commit after every task**, explicit `git add` paths, conventional messages.
11. **Animate only `transform` and `opacity`.** Never `width`/`height`/`top`/`left`/`filter` — those force layout + paint every frame and are the classic cause of 300ms+ INP. The single sanctioned exception is the `clip-path` reveal in Task 6, which is paint-only (no layout), runs once, and is skipped entirely under reduced motion.
12. **Never `motion.*`.** Import `m` from `motion/react` in Client Components and from `motion/react-client` in Server Components. `<LazyMotion strict>` throws at runtime on `motion.*`; `ayman/no-layout-animation` (Task 2) catches it at lint time.
13. **Exits are faster than entrances. Nothing exceeds 400ms. Never `ease-in` on an exit.**
14. **Never an `opacity: 0` entrance on above-the-fold LCP content.** Motion SSRs `opacity: 0` into the HTML — crawlable but invisible until hydration, which directly tanks LCP. The hero animates `y`/`scale` only, or uses `initial={false}`.
15. **One orchestrated scroll moment per page, maximum.** Enforced by a Playwright assertion in Task 15, not by convention.
16. **`loading.tsx` must be a Server Component.** It wraps `page.js`, `not-found.js` and *nested* `layout.js` — **but not the same-segment `layout.js`**. A `cookies()` call in that layout is the #1 reason a `loading.tsx` appears not to work; Task 5 enforces this mechanically.
17. **CSP ships as `Content-Security-Policy-Report-Only` with a live report endpoint for 1–2 weeks before it is enforced.** A strict CSP deployed blind will break the app. Flipping to enforcement is one env var.
18. **`'strict-dynamic'` makes browsers ignore host allowlists in `script-src`.** Adding a domain there is a no-op. The CSP builder in Task 11 *throws* if you try.
19. **The throttler must be Redis-backed before a second replica exists.** The in-memory store is per-instance and silently multiplies effective limits by replica count. Task 9 proves both halves of that sentence with tests.
20. **gitleaks is a required CI check, not just a pre-commit hook.** Pre-commit alone is bypassed with `--no-verify`.

---

## File Structure

```
.github/workflows/ci.yml                          lint · typecheck · unit · integration · e2e · gitleaks

packages/config/eslint/rules/
  no-layout-animation.js                          bans layout-property animation, motion.*, >400ms
  no-layout-animation.test.js
packages/config/eslint/index.js                   (modify) register the new rule

packages/ui/src/motion/variants.ts                Motion variants as plain data — no motion dependency
packages/ui/src/motion/variants.test.ts           asserts variants and CSS tokens are the same numbers
packages/ui/src/tokens/tokens.ts                  (modify) accentSolidHex for WebGL/three consumers
packages/ui/src/components/skeleton.tsx           (modify) + SkeletonText / SkeletonCardGrid
packages/ui/src/components/code-block.css         Shiki dual-theme mapping + reveal container
packages/ui/src/index.ts                          (modify) export motionPresets + new skeletons

packages/contracts/src/copy/ar.ts                 (modify) a11y, code, showpiece copy keys

apps/web/components/motion/features.ts            the async-loaded domAnimation chunk
apps/web/components/motion/motion-provider.tsx    LazyMotion strict + MotionConfig reducedMotion="user"
apps/web/components/motion/route-progress.tsx     @bprogress/next provider
apps/web/components/motion/reveal.tsx             the ONE orchestrated scroll moment per page
apps/web/components/code/code-block.tsx           async Server Component — Shiki, zero client JS
apps/web/components/code/code-reveal.tsx          client clip-path sweep over pre-highlighted markup
apps/web/components/atmosphere/hero-shader.tsx    ogl full-screen quad (client leaf)
apps/web/components/atmosphere/hero-shader-layer.tsx  gating + next/dynamic ssr:false
apps/web/components/atmosphere/showpiece.tsx      r3f scene (client leaf, desktop only)
apps/web/components/atmosphere/showpiece-mount.tsx    poster + double gate + dynamic import
apps/web/public/showpiece-poster.webp             reserves the exact box → CLS 0

apps/web/lib/shiki.ts                             cached fine-grained highlighter singleton
apps/web/lib/security/theme-script.ts             the one inline script we author
apps/web/lib/security/csp.ts                      policy builders + its sha256 hash
apps/web/lib/security/csp.test.ts
apps/web/lib/auth/route-guard.ts                  (from Plan 2, extracted) resolveRedirect()
apps/web/lib/loading-coverage.test.ts             every route has a Server-Component loading.tsx
apps/web/proxy.ts                                 (modify) split CSP by route + security headers
apps/web/app/layout.tsx                           (modify) providers, theme script, Reporting-Endpoints
apps/web/app/**/loading.tsx                       the skeleton pass

apps/web/playwright.config.ts                     two webServers, ar-EG locale, *.e2e.ts only
apps/web/e2e/signup-onboarding-lesson.e2e.ts
apps/web/e2e/quiz-attempt-review.e2e.ts
apps/web/e2e/admin-publish-course.e2e.ts
apps/web/e2e/a11y.e2e.ts                          axe on every public route
apps/web/e2e/visual.e2e.ts                        token gallery light+dark, one-reveal, no-three-on-mobile

apps/api/src/redis/redis.module.ts                one shared ioredis client, fail-closed
apps/api/src/modules/security/csp-report.controller.ts
apps/api/src/modules/security/csp-report.controller.spec.ts
apps/api/src/modules/security/csp-report.module.ts
apps/api/src/app.module.ts                        (modify) Redis throttler storage + SecurityModule
apps/api/src/test/route-inventory.ts              DiscoveryService route enumeration
apps/api/src/test/authorization-matrix.int-spec.ts
apps/api/src/test/db-hardening.int-spec.ts
apps/api/src/test/throttler-storage.int-spec.ts
apps/api/jest.integration.config.js               *.int-spec.ts, separate from the unit suite
apps/api/prisma/seed-admin.ts                     upserts the E2E admin account
apps/api/prisma/migrations/<ts>_audit_log_append_only/migration.sql
scripts/db-bootstrap.sql                          (modify) lock_timeout on the runtime role
```

---

## Task 1: Motion foundation — variants as data, provider as a client leaf

The variants live in `packages/ui` as **plain objects with no `motion` import**, so the design-system package never takes a runtime animation dependency and the numbers can be unit-tested against the CSS tokens they must match.

**Files:**
- Create: `packages/ui/src/motion/variants.ts`
- Test: `packages/ui/src/motion/variants.test.ts`
- Modify: `packages/ui/package.json` (exports), `packages/ui/src/index.ts`
- Create: `apps/web/components/motion/features.ts`, `apps/web/components/motion/motion-provider.tsx`
- Modify: `apps/web/package.json`, `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: `tokens.motion` from `@ayman/ui/tokens` (`{ easing: { out, pop, inOut, base, linear, outNumbers }, duration: { hover: 160, popover: 200, modal: 300, exit: 120 } }`, milliseconds).
- Produces:
  - `@ayman/ui` → `motionPresets` with exact shape:
    ```ts
    type Bezier = [number, number, number, number];
    const EASE_OUT: Bezier; const EASE_POP: Bezier; const EASE_IN_OUT: Bezier; const EASE: Bezier;
    const SECONDS: { hover: number; popover: number; modal: number; exit: number };
    interface VariantSet { initial: Record<string, unknown>; animate: Record<string, unknown>; exit?: Record<string, unknown> }
    const popover: VariantSet; const modal: VariantSet; const fadeUp: VariantSet;
    const heroLcpSafe: VariantSet; const staggerParent: VariantSet; const staggerChild: VariantSet;
    ```
  - `apps/web` → `<MotionProvider>{children}</MotionProvider>` (client component; `children` passed through as props stay Server Components).

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/motion/variants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { motion as motionTokens } from '../tokens/tokens';
import {
  EASE_IN_OUT,
  EASE_OUT,
  EASE_POP,
  SECONDS,
  fadeUp,
  heroLcpSafe,
  modal,
  popover,
  staggerChild,
  staggerParent,
} from './variants';

/** Everything Motion may legally animate here: transforms, opacity, the one
 *  sanctioned clip-path exception, and the transition/stagger metadata keys. */
const ALLOWED_KEYS = new Set([
  'opacity',
  'x',
  'y',
  'scale',
  'scaleX',
  'scaleY',
  'rotate',
  'clipPath',
  'transition',
  'transitionEnd',
]);

const ALL: Record<string, unknown> = { popover, modal, fadeUp, heroLcpSafe, staggerParent, staggerChild };

function states(set: unknown): Array<[string, Record<string, unknown>]> {
  const out: Array<[string, Record<string, unknown>]> = [];
  for (const [name, value] of Object.entries(set as Record<string, unknown>)) {
    if (value && typeof value === 'object') out.push([name, value as Record<string, unknown>]);
  }
  return out;
}

function durationOf(state: Record<string, unknown>): number | undefined {
  const t = state.transition as { duration?: number; staggerChildren?: number } | undefined;
  return t?.duration;
}

describe('motion variants', () => {
  it('uses exactly the durations the CSS tokens declare, in seconds', () => {
    expect(SECONDS.hover).toBeCloseTo(motionTokens.duration.hover / 1000, 6);
    expect(SECONDS.popover).toBeCloseTo(motionTokens.duration.popover / 1000, 6);
    expect(SECONDS.modal).toBeCloseTo(motionTokens.duration.modal / 1000, 6);
    expect(SECONDS.exit).toBeCloseTo(motionTokens.duration.exit / 1000, 6);
  });

  it('mirrors the CSS easing curves exactly', () => {
    expect(`cubic-bezier(${EASE_OUT.join(', ')})`).toBe(motionTokens.easing.out);
    expect(`cubic-bezier(${EASE_POP.join(', ')})`).toBe(motionTokens.easing.pop);
    expect(`cubic-bezier(${EASE_IN_OUT.join(', ')})`).toBe(motionTokens.easing.inOut);
  });

  it('caps every duration at 400ms', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      for (const [stateName, state] of states(set)) {
        const d = durationOf(state);
        if (d === undefined) continue;
        expect(d, `${setName}.${stateName}`).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('makes every exit faster than its own entrance', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      const record = set as Record<string, Record<string, unknown> | undefined>;
      const enter = record.animate ? durationOf(record.animate) : undefined;
      const leave = record.exit ? durationOf(record.exit) : undefined;
      if (enter === undefined || leave === undefined) continue;
      expect(leave, `${setName}.exit`).toBeLessThan(enter);
    }
  });

  it('never uses an ease-in curve on an exit', () => {
    // An ease-out shape accelerates immediately: y1 > x1. An ease-in curve
    // (y1 <= x1) on an exit is the classic mistake that makes UI feel sluggish.
    for (const [setName, set] of Object.entries(ALL)) {
      const record = set as Record<string, Record<string, unknown> | undefined>;
      if (!record.exit) continue;
      const t = record.exit.transition as { ease?: number[] } | undefined;
      expect(t?.ease, `${setName}.exit.transition.ease`).toBeDefined();
      const [x1, y1] = t!.ease!;
      expect(y1, `${setName}.exit`).toBeGreaterThan(x1);
    }
  });

  it('animates nothing that forces layout or paint', () => {
    for (const [setName, set] of Object.entries(ALL)) {
      for (const [stateName, state] of states(set)) {
        for (const key of Object.keys(state)) {
          expect(ALLOWED_KEYS.has(key), `${setName}.${stateName}.${key}`).toBe(true);
        }
      }
    }
  });

  it('never puts opacity in the hero entrance — Motion SSRs opacity:0 and tanks LCP', () => {
    expect(Object.keys(heroLcpSafe.initial)).not.toContain('opacity');
    expect(Object.keys(heroLcpSafe.animate)).not.toContain('opacity');
    expect(heroLcpSafe.exit).toBeUndefined();
  });

  it('starts popovers at scale(0.96) + opacity 0 and pops them over 200ms', () => {
    expect(popover.initial).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(popover.animate).toMatchObject({ opacity: 1, scale: 1 });
    expect((popover.animate.transition as { ease: number[] }).ease).toEqual(EASE_POP);
    expect(durationOf(popover.animate)).toBeCloseTo(0.2, 6);
    expect(durationOf(popover.exit!)).toBeCloseTo(0.12, 6);
  });

  it('gives the stagger parent a child delay that keeps the whole run under 400ms', () => {
    const t = staggerParent.animate.transition as { staggerChildren: number };
    const childDuration = durationOf(staggerChild.animate) ?? 0;
    // 5 children is the most any orchestrated moment in this product uses.
    expect(t.staggerChildren * 4 + childDuration).toBeLessThanOrEqual(0.4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @ayman/ui test
```
Expected: FAIL — `Failed to resolve import "./variants"`.

- [ ] **Step 3: Implement `packages/ui/src/motion/variants.ts`**

```ts
/**
 * Motion variants as plain data.
 *
 * This module deliberately does NOT import `motion`. The design-system package
 * stays dependency-free, and — more importantly — these numbers are unit-tested
 * against the CSS custom properties in `tokens/motion.css`, so a transition
 * written in CSS and an animation written in Motion can never drift apart.
 *
 * Consumers spread these into `m.*` components:
 *   <m.div variants={popover} initial="initial" animate="animate" exit="exit" />
 * or use the states directly:
 *   <m.div initial={popover.initial} animate={popover.animate} />
 */

/** Motion's `BezierDefinition`. Mutable on purpose — Motion's types reject readonly tuples. */
export type Bezier = [number, number, number, number];

export const EASE: Bezier = [0.25, 0.1, 0.25, 1];
/** DEFAULT for anything entering or exiting. */
export const EASE_OUT: Bezier = [0.3, 0.8, 0.6, 1];
/** Anything moving or morphing in place. */
export const EASE_IN_OUT: Bezier = [0.6, 0, 0.2, 1];
/** Popovers and menus. The trailing 1.1 is a deliberate slight overshoot. */
export const EASE_POP: Bezier = [0.175, 0.885, 0.32, 1.1];

/** Motion works in seconds; `tokens.motion.duration` is in milliseconds. */
export const SECONDS = {
  hover: 0.16,
  popover: 0.2,
  modal: 0.3,
  exit: 0.12,
} as const;

export interface VariantSet {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit?: Record<string, unknown>;
}

/**
 * Popovers, menus, dropdowns, tooltips.
 * scale(0.96) + opacity is the highest-ROI motion detail in the whole design system.
 */
export const popover: VariantSet = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: SECONDS.popover, ease: EASE_POP } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: SECONDS.exit, ease: EASE_OUT } },
};

/** Dialogs and sheets. Slightly longer in, same fast out. */
export const modal: VariantSet = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: SECONDS.exit, ease: EASE_OUT } },
};

/** Below-the-fold content entering on scroll. Safe to fade — it is never the LCP element. */
export const fadeUp: VariantSet = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
};

/**
 * ABOVE-THE-FOLD ONLY. No `opacity` key anywhere, by design.
 *
 * Motion server-renders `initial` into the HTML's inline style. An `opacity: 0`
 * initial state therefore ships invisible text to the browser: crawlable, but
 * not painted until hydration finishes — which is a direct LCP regression on the
 * one element whose paint time is being measured. Translate only.
 */
export const heroLcpSafe: VariantSet = {
  initial: { y: 14 },
  animate: { y: 0, transition: { duration: SECONDS.modal, ease: EASE_OUT } },
};

/** The parent of the ONE orchestrated scroll moment a page is allowed. */
export const staggerParent: VariantSet = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerChild: VariantSet = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: SECONDS.hover, ease: EASE_OUT } },
};
```

- [ ] **Step 4: Export it**

Add to `packages/ui/package.json` `exports`:
```json
    "./motion": "./src/motion/variants.ts",
```

Add to `packages/ui/src/index.ts` (append after the existing `tokens` line):
```ts
export * as motionPresets from './motion/variants';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @ayman/ui test
```
Expected: PASS — 8 new tests, existing token tests still green.

- [ ] **Step 6: Add `motion` to the web app**

```bash
pnpm --filter @ayman/web add motion@12.42.2
```

- [ ] **Step 7: Create `apps/web/components/motion/features.ts`**

```ts
/**
 * The lazily-loaded feature bundle. Keeping it in its own module is what makes
 * `<LazyMotion features={() => import('./features')}>` produce a separate chunk:
 * the initial bundle carries only `m` (~5kB) and the ~15kB of DOM animation
 * features arrive after hydration. Importing `domAnimation` directly into the
 * provider would defeat the split and ship the full ~34kB up front.
 *
 * `domAnimation`, not `domMax`: layout projection and drag are not used anywhere
 * in this product, and they are the expensive half.
 */
export { domAnimation as default } from 'motion/react';
```

- [ ] **Step 8: Create `apps/web/components/motion/motion-provider.tsx`**

```tsx
'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** Resolved after hydration, in its own chunk. See ./features. */
const loadFeatures = () => import('./features').then((mod) => mod.default);

/**
 * Wraps the whole app.
 *
 * `strict` makes `motion.div` throw at runtime — only `m.div` is legal — which is
 * the mechanical guarantee that nobody accidentally re-imports the 34kB bundle.
 * The `ayman/no-layout-animation` lint rule catches the same mistake earlier.
 *
 * `reducedMotion="user"` is on from day one: it removes transforms and layout
 * animations app-wide for users who asked for that, while PRESERVING opacity
 * fades. That combination — not "disable everything" — is the vestibular-safe
 * behaviour, and retrofitting it later means auditing every component.
 *
 * `children` is a prop, so passing Server Components through this client
 * component does not turn them into Client Components.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
```

- [ ] **Step 9: Mount it in `apps/web/app/layout.tsx`**

Add the import alongside the existing ones:
```tsx
import { MotionProvider } from '@/components/motion/motion-provider';
```

and replace the `{children}` line inside `<body>` with:
```tsx
        <MotionProvider>{children}</MotionProvider>
```

- [ ] **Step 10: Prove `strict` and the Server-Component import path both work**

Create a throwaway probe at `apps/web/app/dev/motion/page.tsx` (the `app/dev/*` string-literal exemption applies):

```tsx
import { m } from 'motion/react-client';
import { motionPresets } from '@ayman/ui';

/**
 * `motion/react-client` is the Server-Component entry point: it re-exports the
 * same components already marked with the client directive, so a Server
 * Component can render one without becoming a Client Component itself.
 */
export default function MotionProbePage() {
  return (
    <main className="mx-auto max-w-[var(--w-prose)] px-6 py-16">
      <m.div
        initial={motionPresets.heroLcpSafe.initial}
        animate={motionPresets.heroLcpSafe.animate}
        className="rounded-lg border border-line p-6"
      >
        server component · m from motion/react-client
      </m.div>
    </main>
  );
}
```

Run `pnpm --filter @ayman/web dev`, open `http://localhost:3200/dev/motion`, and confirm:
1. The box slides up. No console error.
2. `curl -s http://localhost:3200/dev/motion | grep -o 'opacity:0'` prints **nothing** — the LCP-safe variant put no `opacity` in the SSR'd HTML.
3. Temporarily change `import { m }` to `import { motion }` and render `<motion.div>`. Reload. Expected: a thrown error reading *"You have rendered a `motion` component within a `LazyMotion` component."* Revert.
4. In DevTools → Network, filter by JS and confirm a separate chunk containing `domAnimation` loads **after** the document, not inside the main bundle.

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/motion packages/ui/src/index.ts packages/ui/package.json \
  apps/web/components/motion apps/web/app/layout.tsx apps/web/app/dev/motion \
  apps/web/package.json pnpm-lock.yaml
git commit -m "feat(motion): LazyMotion strict + reducedMotion=user, variants tested against CSS tokens"
```

---

## Task 2: The motion lint rule

Constraint 11 ("only transform and opacity") and constraint 12 ("never `motion.*`") are both invisible in review and expensive in production. This rule makes them mechanical, exactly as `no-physical-direction` did for RTL.

**Files:**
- Create: `packages/config/eslint/rules/no-layout-animation.js`
- Create: `packages/config/eslint/rules/no-layout-animation.test.js`
- Modify: `packages/config/eslint/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the rule `ayman/no-layout-animation`, set to `error` in the shared `base` preset, with message ids `layoutProperty`, `useLazyMotionM`, `durationCap`.

- [ ] **Step 1: Write the failing test**

Create `packages/config/eslint/rules/no-layout-animation.test.js`:

```js
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-layout-animation.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-layout-animation', () => {
  it('passes valid and rejects invalid', () => {
    ruleTester.run('no-layout-animation', rule, {
      valid: [
        { code: "import { m, AnimatePresence } from 'motion/react';" },
        { code: "import { m } from 'motion/react-client';" },
        // `motion` imported from something unrelated is not our business.
        { code: "import { motion } from './local-helpers';" },
        { code: 'const a = <m.div animate={{ opacity: 1, y: 0 }} />;' },
        { code: 'const a = <m.div transition={{ duration: 0.2 }} />;' },
        { code: 'const a = <m.div animate={{ y: 0, transition: { duration: 0.3 } }} />;' },
        // The sanctioned exception: paint-only, runs once, skipped under reduced motion.
        { code: "const a = <m.div animate={{ clipPath: 'inset(0 0 0 0)' }} />;" },
        // Static styles are not animations.
        { code: 'const a = <div style={{ width: 200, left: 0 }} />;' },
        // Non-numeric durations (a token reference) are not the rule's business.
        { code: 'const a = <m.div transition={{ duration: SECONDS.popover }} />;' },
      ],
      invalid: [
        {
          code: "import { motion } from 'motion/react';",
          errors: [{ messageId: 'useLazyMotionM' }],
        },
        {
          code: "import motion from 'motion/react';",
          errors: [{ messageId: 'useLazyMotionM' }],
        },
        {
          code: 'const a = <m.div animate={{ width: 200 }} />;',
          errors: [{ messageId: 'layoutProperty', data: { prop: 'width', replacement: 'scaleX' } }],
        },
        {
          code: "const a = <m.div whileHover={{ filter: 'blur(4px)' }} />;",
          errors: [{ messageId: 'layoutProperty', data: { prop: 'filter', replacement: 'opacity' } }],
        },
        {
          code: 'const a = <m.aside initial={{ left: -300, height: 0 }} />;',
          errors: [
            { messageId: 'layoutProperty', data: { prop: 'left', replacement: 'x' } },
            { messageId: 'layoutProperty', data: { prop: 'height', replacement: 'scaleY' } },
          ],
        },
        {
          code: 'const a = <m.div transition={{ duration: 0.6 }} />;',
          errors: [{ messageId: 'durationCap', data: { duration: '0.6' } }],
        },
        {
          code: 'const a = <m.div animate={{ y: 0, transition: { duration: 0.5 } }} />;',
          errors: [{ messageId: 'durationCap', data: { duration: '0.5' } }],
        },
        {
          code: 'const a = <m.li variants={{ animate: { marginTop: 0 } }} />;',
          errors: [{ messageId: 'layoutProperty', data: { prop: 'marginTop', replacement: 'y' } }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @ayman/config test
```
Expected: FAIL — `Cannot find module './no-layout-animation.js'`.

- [ ] **Step 3: Implement `packages/config/eslint/rules/no-layout-animation.js`**

```js
/**
 * Three motion invariants, enforced statically.
 *
 * 1. Animating a layout property (`width`, `height`, `top`, `left`, `filter`, …)
 *    forces layout and paint on EVERY frame. Measured cost: 30–60ms of INP on a
 *    page that does it once, and it is the classic cause of 300ms+ INP on
 *    scroll-driven pages. Transforms and opacity are composited; they are free.
 * 2. `motion.*` pulls the full ~34kB bundle. `<LazyMotion strict>` throws on it
 *    at runtime — this catches it at lint time instead, in CI, before deploy.
 * 3. Nothing animates longer than 400ms. Past that a transition reads as lag.
 *
 * `clipPath` is deliberately absent from the ban list: it is paint-only (no
 * layout), it is used exactly once (the Shiki code reveal), and it is skipped
 * under reduced motion.
 */

/** Layout/paint-forcing property → the composited property to use instead. */
const BANNED = new Map([
  ['width', 'scaleX'],
  ['height', 'scaleY'],
  ['minWidth', 'scaleX'],
  ['minHeight', 'scaleY'],
  ['maxWidth', 'scaleX'],
  ['maxHeight', 'scaleY'],
  ['top', 'y'],
  ['bottom', 'y'],
  ['left', 'x'],
  ['right', 'x'],
  ['inset', 'x/y'],
  ['insetInlineStart', 'x'],
  ['insetInlineEnd', 'x'],
  ['insetBlockStart', 'y'],
  ['insetBlockEnd', 'y'],
  ['margin', 'y'],
  ['marginTop', 'y'],
  ['marginBottom', 'y'],
  ['marginInlineStart', 'x'],
  ['marginInlineEnd', 'x'],
  ['padding', 'scale'],
  ['paddingTop', 'scale'],
  ['paddingInlineStart', 'scale'],
  ['filter', 'opacity'],
  ['backdropFilter', 'opacity'],
  ['boxShadow', 'opacity'],
  ['borderWidth', 'opacity'],
  ['fontSize', 'scale'],
  ['lineHeight', 'scale'],
]);

/** JSX props whose object value Motion interprets as an animation target. */
const ANIMATION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'variants',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
]);

const MOTION_PACKAGES = new Set(['motion/react', 'motion/react-client']);

/** 400ms, expressed the way Motion expresses it. */
const MAX_DURATION_SECONDS = 0.4;

/** Depth-first walk of an object literal, visiting every Property node. */
function walkObject(node, visit) {
  if (!node || node.type !== 'ObjectExpression') return;
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'Literal'
          ? String(prop.key.value)
          : null;
    if (key !== null) visit(prop, key);
    if (prop.value.type === 'ObjectExpression') walkObject(prop.value, visit);
  }
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Animate only composited properties, use `m` not `motion`, and cap durations at 400ms.',
    },
    schema: [],
    messages: {
      layoutProperty:
        'Animating "{{prop}}" forces layout and paint every frame. Animate "{{replacement}}" instead.',
      useLazyMotionM:
        'Import `m`, not `motion`. `motion` ships the full ~34kB bundle and throws inside <LazyMotion strict>.',
      durationCap:
        'A {{duration}}s animation exceeds the 400ms ceiling. Nothing in this product animates longer.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!MOTION_PACKAGES.has(node.source.value)) return;
        for (const spec of node.specifiers) {
          const isNamedMotion =
            spec.type === 'ImportSpecifier' && spec.imported.name === 'motion';
          const isDefaultImport = spec.type === 'ImportDefaultSpecifier';
          const isNamespaceImport = spec.type === 'ImportNamespaceSpecifier';
          if (isNamedMotion || isDefaultImport || isNamespaceImport) {
            context.report({ node: spec, messageId: 'useLazyMotionM' });
          }
        }
      },

      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        if (!ANIMATION_PROPS.has(node.name.name)) return;
        const value = node.value;
        if (!value || value.type !== 'JSXExpressionContainer') return;

        walkObject(value.expression, (prop, key) => {
          const replacement = BANNED.get(key);
          if (replacement) {
            context.report({
              node: prop,
              messageId: 'layoutProperty',
              data: { prop: key, replacement },
            });
            return;
          }
          if (key !== 'duration') return;
          const literal = prop.value;
          if (literal.type !== 'Literal' || typeof literal.value !== 'number') return;
          if (literal.value <= MAX_DURATION_SECONDS) return;
          context.report({
            node: prop,
            messageId: 'durationCap',
            data: { duration: String(literal.value) },
          });
        });
      },
    };
  },
};
```

- [ ] **Step 4: Register the rule**

In `packages/config/eslint/index.js`, add the import beside the existing one:
```js
import noLayoutAnimation from './rules/no-layout-animation.js';
```

extend the plugin object:
```js
const ayman = {
  rules: {
    'no-physical-direction': noPhysicalDirection,
    'no-layout-animation': noLayoutAnimation,
  },
};
```

and add to the `rules` block next to `'ayman/no-physical-direction': 'error'`:
```js
      'ayman/no-layout-animation': 'error',
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @ayman/config test
```
Expected: PASS — both rule suites green.

- [ ] **Step 6: Prove it fires on real code**

In `apps/web/app/dev/motion/page.tsx`, temporarily change the `animate` prop to `animate={{ height: 40 }}`, then run:
```bash
pnpm --filter @ayman/web lint
```
Expected: FAIL with *"Animating "height" forces layout and paint every frame. Animate "scaleY" instead."* Revert and re-run — expected: PASS.

- [ ] **Step 7: Run the whole repo through it**

```bash
pnpm lint
```
Expected: PASS across all packages. If any pre-existing component trips the rule, fix the component — never widen the rule.

- [ ] **Step 8: Commit**

```bash
git add packages/config/eslint
git commit -m "feat(config): lint rule banning layout-property animation, motion.*, and >400ms"
```

---

## Task 3: The one orchestrated moment, and the LCP-safe hero

**Files:**
- Create: `apps/web/components/motion/reveal.tsx`
- Modify: `apps/web/app/page.tsx` (hero uses `heroLcpSafe`)
- Modify: `packages/contracts/src/copy/ar.ts` (a11y keys)

**Interfaces:**
- Consumes: `motionPresets.{staggerParent, staggerChild, heroLcpSafe}` from `@ayman/ui`.
- Produces: `<Reveal>{children}</Reveal>` and `<RevealItem>{children}</RevealItem>` — a client component pair. `<Reveal>` renders `data-orchestrated-reveal` on its root; Task 15 asserts at most one per page.

- [ ] **Step 1: Add the copy keys**

In `packages/contracts/src/copy/ar.ts`, add two new top-level keys before the closing `} as const;`:

```ts
  a11y: {
    skipToContent: 'تخطَّ إلى المحتوى',
    decorative: 'عنصر زخرفي',
  },
  code: {
    copy: 'انسخ الكود',
    copied: 'اتنسخ',
    label: 'مثال كود',
  },
```

- [ ] **Step 2: Create `apps/web/components/motion/reveal.tsx`**

```tsx
'use client';

import { m } from 'motion/react';
import { motionPresets } from '@ayman/ui';
import type { ReactNode } from 'react';

/**
 * The ONE orchestrated scroll moment a page is allowed.
 *
 * Scroll-triggered fade-in on every section is the single loudest "AI-built
 * website" tell in the ban list. One moment per page, at most — enforced by the
 * Playwright assertion in Plan 7 Task 15, which counts `[data-orchestrated-reveal]`.
 *
 * `viewport={{ once: true }}` matters for more than taste: without it the
 * observer stays subscribed and re-runs the whole stagger every time the section
 * scrolls back into view, which is both distracting and a needless main-thread cost.
 *
 * `amount: 0.3` fires when 30% is visible. Firing at 0 makes the animation
 * finish before the user has looked at it.
 *
 * Under reduced motion, MotionConfig strips the `y` transform and leaves the
 * opacity fade — no extra branch is needed here.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div
      data-orchestrated-reveal=""
      className={className}
      variants={motionPresets.staggerParent}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </m.div>
  );
}

/** A direct child of <Reveal>. Inherits the parent's animation state by name. */
export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={motionPresets.staggerChild}>
      {children}
    </m.div>
  );
}
```

- [ ] **Step 3: Make the hero LCP-safe**

`apps/web/app/page.tsx` currently renders the eyebrow, `<h1>`, and tagline as static markup. Keep the `<h1>` — the LCP element — **outside** any Motion component, and animate only the surrounding block with the translate-only preset:

```tsx
import { m } from 'motion/react-client';
import { copy } from '@ayman/contracts';
import { motionPresets } from '@ayman/ui';
import { HeroShaderLayer } from '@/components/atmosphere/hero-shader-layer';

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[var(--w-shell)] flex-col justify-center px-6">
      <HeroShaderLayer />

      {/*
        The <h1> is the LCP element. It carries no motion props at all, so its
        text paints on the server-rendered frame with no inline opacity.
        Only the metadata above and below it moves, and only on the y axis:
        `heroLcpSafe` has no `opacity` key precisely because Motion serialises
        `initial` into the SSR'd inline style.
      */}
      <m.p
        className="eyebrow mb-3"
        initial={motionPresets.heroLcpSafe.initial}
        animate={motionPresets.heroLcpSafe.animate}
      >
        {copy.home.eyebrow}
      </m.p>

      <h1 className="text-[length:var(--fs-display-2)] font-semibold leading-[var(--lh-display-2)]">
        {copy.site.name}
      </h1>

      <m.p
        className="mt-4 max-w-[var(--w-prose)] text-fg-muted"
        initial={motionPresets.heroLcpSafe.initial}
        animate={motionPresets.heroLcpSafe.animate}
      >
        {copy.site.tagline}
      </m.p>
    </main>
  );
}
```

> `HeroShaderLayer` does not exist until Task 7. Until then, delete that import and its usage, and add both back in Task 7 Step 6.

- [ ] **Step 4: Verify no `opacity: 0` reaches the SSR'd hero**

```bash
pnpm --filter @ayman/web build && pnpm --filter @ayman/web start &
sleep 5
curl -s http://localhost:3200 | grep -c 'opacity:0'
```
Expected: `0`. If it prints anything above zero, an above-the-fold component is using an opacity entrance — find it and switch it to `heroLcpSafe` or `initial={false}`. Stop the server.

- [ ] **Step 5: Verify reduced motion**

In Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce", reload `/`. Expected: the eyebrow and tagline appear at their final positions with no slide; the page is fully usable; nothing jumps.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/copy/ar.ts apps/web/components/motion/reveal.tsx apps/web/app/page.tsx
git commit -m "feat(web): one orchestrated reveal primitive and an LCP-safe hero entrance"
```

---

## Task 4: Route progress

**Files:**
- Create: `apps/web/components/motion/route-progress.tsx`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `<RouteProgress>{children}</RouteProgress>` mounted inside `<MotionProvider>`.

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add @bprogress/next@3.2.12
```

> `nprogress` and `next-nprogress-bar` are rejected: `nprogress` has been unmaintained since 2015. `@bprogress/next` is 6.5kB gzip and, like nprogress, drives the bar with `transform: translate3d()` rather than `width`, so it does not violate Constraint 11.

- [ ] **Step 2: Create `apps/web/components/motion/route-progress.tsx`**

```tsx
'use client';

import { ProgressProvider } from '@bprogress/next/app';
import type { ReactNode } from 'react';

/**
 * A 2px amber bar at the top of the viewport during App Router navigations.
 *
 * `showSpinner: false` — the spinner is the nprogress default and reads as a
 * 2013 template. The bar alone is the signal.
 *
 * `shallowRouting` keeps the bar quiet when only the query string changes, which
 * matters because the admin tables drive their filters through `nuqs`: without
 * it, every keystroke in a filter box flashes a progress bar.
 *
 * The colour is read from the design token, so it follows the theme swap with
 * no second source of truth.
 */
export function RouteProgress({ children }: { children: ReactNode }) {
  return (
    <ProgressProvider
      height="2px"
      color="var(--a-9)"
      options={{ showSpinner: false }}
      shallowRouting
    >
      {children}
    </ProgressProvider>
  );
}
```

- [ ] **Step 3: Typecheck the prop names against the shipped types**

```bash
pnpm --filter @ayman/web typecheck
```
Expected: PASS. If a prop name differs in 3.2.x, the compiler names it — open `apps/web/node_modules/@bprogress/next/dist/app.d.ts`, use the declared name, and do not guess.

- [ ] **Step 4: Mount it**

In `apps/web/app/layout.tsx`:
```tsx
import { RouteProgress } from '@/components/motion/route-progress';
```
```tsx
        <MotionProvider>
          <RouteProgress>{children}</RouteProgress>
        </MotionProvider>
```

- [ ] **Step 5: Respect reduced motion at the CSS layer**

Append to `apps/web/app/globals.css`:

```css
/* BProgress renders a fixed bar with the id `bprogress`. The library's own
   easing is a linear tween, which matches --ease-linear (progress bars and
   loaders only). Two corrections:
   - the bar must sit above the sticky header, below modals
   - the "peg" glow is a gradient, and this product ships no gradients */
#bprogress .bar {
  z-index: 60;
}
#bprogress .peg {
  display: none;
}
```

- [ ] **Step 6: Verify**

Run `pnpm --filter @ayman/web dev`, then navigate between two routes (e.g. `/` → `/dev/tokens`). Expected: a thin amber bar sweeps across the top and disappears. In DevTools → Elements, confirm the bar element animates via `transform`, not `width`. Toggle dark mode — the bar stays amber and legible on `#08090A`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/motion/route-progress.tsx apps/web/app/layout.tsx \
  apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): route progress bar via @bprogress/next"
```

---

## Task 5: The skeleton pass across every route

**Files:**
- Modify: `packages/ui/src/components/skeleton.tsx` (add `SkeletonText`, `SkeletonCardGrid`)
- Modify: `packages/ui/src/index.ts`
- Create: `apps/web/lib/loading-coverage.test.ts`
- Create: `apps/web/app/**/loading.tsx` — one per route segment the test reports as missing

**Interfaces:**
- Consumes: `Skeleton` from `@ayman/ui` (existing: `{ width?: 'full' | 'wide' | 'narrow' }`, 1.8s `translateX` shimmer with a 180ms delay).
- Produces:
  - `SkeletonText({ lines }: { lines: number })` — renders `lines` bars cycling `full → wide → narrow`.
  - `SkeletonCardGrid({ count, columns }: { count: number; columns: 2 | 3 })` — bordered card boxes sharing the real grid's `gap` and `radius`.
  - A vitest suite that fails the build if any route segment is missing a `loading.tsx`, if one is a Client Component, or if a same-segment `layout.tsx` reads request state.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/loading-coverage.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = join(import.meta.dirname, '..', 'app');

/** `app/dev/*` is the design-system playground, not a product route. */
const EXEMPT = /(^|[\\/])dev([\\/]|$)/;

/** Route groups `(x)` and parallel/intercepted segments are still real segments. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_') || entry === 'api' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    out.push(full);
    walk(full, out);
  }
  return out;
}

const segments = [APP_DIR, ...walk(APP_DIR)];
const has = (dir: string, file: RegExp) => readdirSync(dir).some((f) => file.test(f));
const rel = (dir: string) => relative(APP_DIR, dir) || '.';

const withPage = segments.filter((d) => has(d, /^page\.tsx?$/) && !EXEMPT.test(rel(d)));
const withLoading = segments.filter((d) => has(d, /^loading\.tsx?$/));

describe('loading.tsx coverage', () => {
  it('gives every product route a skeleton', () => {
    const missing = withPage.filter((d) => !has(d, /^loading\.tsx?$/)).map(rel);
    expect(missing, `route segments with no loading.tsx: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps every loading.tsx a Server Component', () => {
    // A client loading.tsx is not in the SSR'd HTML, which is the entire point
    // of having one — the skeleton would appear only after the JS bundle lands.
    const clientish = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(clientish).toEqual([]);
  });

  it('never reads request state in a layout that sits beside a loading.tsx', () => {
    // loading.tsx wraps page.js, not-found.js and NESTED layout.js — but NOT the
    // layout.js in its own segment. A cookies()/headers()/draftMode() call in
    // that same-segment layout blocks the shell, so the skeleton never renders.
    // This is the #1 reason a loading.tsx "doesn't work".
    const offenders: string[] = [];
    for (const dir of withLoading) {
      const layout = readdirSync(dir).find((f) => /^layout\.tsx?$/.test(f));
      if (!layout) continue;
      const source = readFileSync(join(dir, layout), 'utf8');
      if (/\b(cookies|headers|draftMode|connection)\s*\(/.test(source)) {
        offenders.push(`${rel(dir)}/${layout}`);
      }
    }
    expect(
      offenders,
      `these same-segment layouts block their own loading.tsx: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('never imports next/headers from a loading.tsx', () => {
    const offenders = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => /from ['"]next\/headers['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('builds every skeleton from the shared primitives', () => {
    // Geometry parity is what makes the swap invisible. A hand-rolled div grid
    // drifts from the real component the first time its padding changes.
    const offenders = withLoading
      .map((d) => join(d, readdirSync(d).find((f) => /^loading\.tsx?$/.test(f))!))
      .filter((f) => !/from ['"]@ayman\/ui['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(APP_DIR, f));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and record the exact list**

```bash
pnpm --filter @ayman/web test
```
Expected: FAIL. The first assertion prints the exact route segments missing a `loading.tsx`. **Copy that list** — it is the work list for Step 5. Do not guess at route names; the filesystem is the source of truth.

- [ ] **Step 3: Add the shared skeleton primitives**

Append to `packages/ui/src/components/skeleton.tsx`:

```tsx
/**
 * A paragraph of bars whose widths cycle 100% / 85% / 60%.
 *
 * Uniform-width bars are the single biggest "cheap skeleton" tell — real text
 * does not have a flush right edge, and the eye reads the difference instantly.
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const cycle: Width[] = ['full', 'wide', 'narrow'];
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={cycle[i % cycle.length]} />
      ))}
    </div>
  );
}

/**
 * Card placeholders that share the real grid's gap, radius and border so the
 * swap does not shift a single pixel. `--r-lg` (8px) is the card ceiling.
 */
export function SkeletonCardGrid({
  count = 3,
  columns = 3,
  className,
}: {
  count?: number;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-lg border border-line-subtle p-5"
          style={{ borderRadius: 'var(--r-lg)' }}
        >
          <Skeleton width="narrow" className="mb-4 h-3" />
          <Skeleton width="wide" className="mb-3 h-5" />
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}
```

Export them from `packages/ui/src/index.ts`:
```ts
export {
  Skeleton,
  SkeletonText,
  SkeletonCardGrid,
  type SkeletonProps,
} from './components/skeleton';
```

- [ ] **Step 4: Confirm the shimmer never flashes on a fast load**

The existing `Skeleton` already animates `after:animate-[shimmer_1.8s_infinite_180ms]` — 1.8s duration, **180ms delay**, driven by `translateX` on an overlay rather than `background-position` (which would repaint the whole element). Verify the keyframe exists in `apps/web/app/globals.css`; if `@keyframes shimmer` is absent, add it:

```css
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
```

RTL note: `translateX(100%)` sweeps left→right in both directions because the element is `overflow:hidden` and the sweep is decorative, not directional. Do not mirror it.

- [ ] **Step 5: Write one `loading.tsx` per missing segment**

Use the list from Step 2. Every file follows this shape — a Server Component, geometry taken from the real page, three to five items, never a full grey screen. This is the catalog example; adapt the primitives per route, do not copy it blindly:

```tsx
import { Skeleton, SkeletonCardGrid } from '@ayman/ui';

/**
 * Server Component, so this ships inside the SSR'd HTML rather than after
 * hydration. Geometry is lifted from the real page: same shell max-width, same
 * horizontal padding, same grid gap, same 8px card radius.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <div className="mb-10 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <SkeletonCardGrid count={6} columns={3} />
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @ayman/web test
```
Expected: PASS — 5 tests.

- [ ] **Step 7: Verify a skeleton actually renders**

Run the dev server, open a data-backed route in DevTools with network throttled to "Slow 4G", and confirm:
1. The skeleton appears in the **initial HTML** (view-source, not the inspector).
2. It does not flash on a fast reload — the 180ms delay covers that.
3. The swap to real content shifts nothing. Check DevTools → Performance → Layout Shift; expect CLS contribution 0.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/skeleton.tsx packages/ui/src/index.ts \
  apps/web/lib/loading-coverage.test.ts apps/web/app apps/web/app/globals.css
git commit -m "feat(web): skeleton pass across every route with mechanical loading.tsx coverage"
```

---

## Task 6: Shiki server-highlighted code with a clip-path reveal

**Files:**
- Create: `apps/web/lib/shiki.ts`
- Create: `apps/web/components/code/code-block.tsx`, `apps/web/components/code/code-reveal.tsx`
- Create: `packages/ui/src/components/code-block.css`
- Modify: `apps/web/app/globals.css`, `apps/web/package.json`

**Interfaces:**
- Consumes: `copy.code` from `@ayman/contracts`; `motionPresets.EASE_OUT`.
- Produces:
  - `getHighlighter(): Promise<HighlighterCore>` — a module-level cached singleton.
  - `<CodeBlock code={string} lang={CodeLang} title?={string} />` — an **async Server Component**. Zero client JS for the highlighter; the real code text lands in the SSR HTML for crawlers.
  - `CODE_LANGS: readonly ['javascript','typescript','python','json','bash']` and `type CodeLang`.

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add shiki@4.3.1
```

- [ ] **Step 2: Create `apps/web/lib/shiki.ts`**

```ts
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * A fine-grained highlighter, not `shiki`'s full bundle.
 *
 * The full bundle carries every grammar and theme Shiki ships (megabytes). We
 * load five grammars and two themes explicitly. This runs only on the server —
 * `CodeBlock` is an async Server Component — so none of it reaches the browser,
 * but it still governs cold-start time and server memory.
 *
 * The JavaScript RegExp engine replaces the Oniguruma WASM binary entirely:
 * ~0 bytes of WASM to load and no `onig.wasm` asset to serve. `forgiving: true`
 * downgrades the handful of grammar patterns the JS engine cannot express into
 * no-ops rather than throwing — the affected patterns are edge-case shell
 * constructs, and the alternative is shipping WASM for them.
 */

export const CODE_LANGS = ['javascript', 'typescript', 'python', 'json', 'bash'] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

/** Module-level cache. Next keeps the module alive across requests in one worker. */
let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ],
    langs: [
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/bash.mjs'),
    ],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

/** Line height (21px) + vertical padding (2 × 16px) — must match code-block.css. */
const LINE_HEIGHT_PX = 21;
const BLOCK_PADDING_PX = 16;

/**
 * The exact rendered height, computed on the server.
 *
 * The reveal animates a clip-path over a container that must already be its
 * final size. If the container grows as the reveal runs, every element below it
 * moves and the page books a layout shift.
 */
export function codeBlockMinHeight(code: string): number {
  const lines = code.replace(/\n$/, '').split('\n').length;
  return lines * LINE_HEIGHT_PX + BLOCK_PADDING_PX * 2;
}
```

- [ ] **Step 3: Create `apps/web/components/code/code-block.tsx`**

```tsx
import { copy } from '@ayman/contracts';
import { CODE_LANGS, codeBlockMinHeight, getHighlighter, type CodeLang } from '@/lib/shiki';
import { CodeReveal } from './code-reveal';

/**
 * An async Server Component.
 *
 * Shiki never crosses the client boundary: the highlighted markup is produced
 * here and streamed as HTML, so crawlers get real code text and the browser gets
 * zero bytes of highlighter. The only client code involved is `CodeReveal`,
 * which is ~1kB on top of the already-loaded Motion `m` runtime.
 */
export async function CodeBlock({
  code,
  lang,
  title,
}: {
  code: string;
  lang: CodeLang;
  title?: string;
}) {
  if (!CODE_LANGS.includes(lang)) {
    // Fail loudly at render time rather than silently emitting unhighlighted
    // markup that nobody notices until a screenshot review.
    throw new Error(`Unsupported code language: ${lang}`);
  }

  const highlighter = await getHighlighter();
  const html = highlighter.codeToHtml(code, {
    lang,
    // Both themes are emitted as CSS variables on the same markup, so a theme
    // swap is a CSS cascade change — no re-highlight, no second request, and it
    // works before hydration. `defaultColor: false` is what suppresses the
    // inline `color:` that would otherwise pin one theme.
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    cssVariablePrefix: '--sh-',
  });

  return (
    <figure className="my-8">
      {title ? (
        <figcaption className="mono flex items-center gap-2 rounded-t-lg border border-b-0 border-line px-4 py-2 text-[length:var(--fs-mono-label)] text-fg-muted">
          {title}
        </figcaption>
      ) : null}
      <CodeReveal
        html={html}
        minHeight={codeBlockMinHeight(code)}
        label={copy.code.label}
        rounded={title ? 'bottom' : 'all'}
      />
    </figure>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/code/code-reveal.tsx`**

```tsx
'use client';

import { m, useReducedMotion } from 'motion/react';
import { motionPresets } from '@ayman/ui';

/**
 * Sweeps a clip-path down over markup Shiki already highlighted on the server.
 *
 * Why not per-character `setState`: that is one render plus a full reconcile
 * every ~40ms for the duration of the animation, on the main thread, while the
 * user is trying to interact. It is a documented INP killer and it is the
 * obvious implementation, which is why it is called out here explicitly.
 *
 * `clip-path` is the one non-transform property this codebase animates. It
 * triggers paint but never layout, the container is already at its final height,
 * it runs once, and it is skipped entirely under reduced motion — where
 * `initial={false}` mounts the block fully revealed with no animation at all.
 *
 * The wipe is vertical (`inset(0 0 X% 0)`), which is direction-neutral: there is
 * no RTL mirror to get wrong.
 */
export function CodeReveal({
  html,
  minHeight,
  label,
  rounded,
}: {
  html: string;
  minHeight: number;
  label: string;
  rounded: 'all' | 'bottom';
}) {
  const reduced = useReducedMotion();

  return (
    <m.div
      role="figure"
      aria-label={label}
      className={
        rounded === 'all'
          ? 'overflow-hidden rounded-lg border border-line'
          : 'overflow-hidden rounded-b-lg border border-line'
      }
      style={{ minHeight }}
      initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)' }}
      whileInView={{ clipPath: 'inset(0 0 0% 0)' }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.4, ease: motionPresets.EASE_OUT }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

> `dangerouslySetInnerHTML` is safe here by construction: the string comes from Shiki's own serialiser applied to code the *admin* authored, never from a student, and it is produced on the server. Rich text authored through the admin still goes through `sanitize-html` on write and DOMPurify at render — that path is unchanged.

- [ ] **Step 5: Create `packages/ui/src/components/code-block.css`**

```css
/* Shiki emits `--sh-light` / `--sh-dark` per token because CodeBlock passes
   `defaultColor: false`. Mapping them here mirrors exactly the light/dark
   strategy the colour tokens use: a media query for first paint before JS, and
   an attribute selector for an explicit user choice. */

.shiki,
.shiki span {
  color: var(--sh-light);
  background-color: var(--sh-light-bg);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .shiki,
  :root:not([data-theme='light']) .shiki span {
    color: var(--sh-dark);
    background-color: var(--sh-dark-bg);
  }
}

:root[data-theme='dark'] .shiki,
:root[data-theme='dark'] .shiki span {
  color: var(--sh-dark);
  background-color: var(--sh-dark-bg);
}

/* These four values are the contract `codeBlockMinHeight()` computes against.
   Changing any of them without changing that function reintroduces the layout
   shift the fixed min-height exists to prevent. */
.shiki {
  margin: 0;
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  line-height: 21px;
  tab-size: 4;
  overflow-x: auto;
}

/* Arabic comments inside a code sample must not inherit the Latin tracking the
   global `.mono` rule applies — the connected script breaks. */
.shiki span:lang(ar) {
  font-family: var(--font-sans);
  letter-spacing: 0 !important;
}
```

Import it from `apps/web/app/globals.css`, after the token import:
```css
@import "@ayman/ui/components/code-block.css";
```

and add the subpath to `packages/ui/package.json` `exports`:
```json
    "./components/code-block.css": "./src/components/code-block.css",
```

> The existing `"./components/*": "./src/components/*.tsx"` pattern only resolves `.tsx`, so the CSS file needs its own explicit entry — the same reason `packages/contracts` gives leaf modules explicit subpath exports.

- [ ] **Step 6: Verify**

Render a `<CodeBlock>` on `/dev/motion` with a ~12-line TypeScript sample, then check:
1. `curl -s http://localhost:3200/dev/motion | grep -c 'class="shiki'` → `1`, and the code text is present verbatim in the HTML (crawlable).
2. DevTools → Network → JS: no chunk containing `shiki` or `onig` is requested.
3. Scroll the block into view: it wipes top-to-bottom over 400ms, and nothing below it moves. Performance panel → Layout Shift: 0.
4. Toggle light/dark: the syntax colours swap with no re-request.
5. Emulate `prefers-reduced-motion: reduce`, reload: the block is fully visible immediately with no wipe.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/shiki.ts apps/web/components/code packages/ui/src/components/code-block.css \
  packages/ui/package.json apps/web/app/globals.css apps/web/app/dev/motion apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): Shiki server-highlighted code with a clip-path reveal"
```

---

## Task 7: The one WebGL moment

A single shader plane in a fixed layer behind the hero. Hand-rolled `ogl`, not react-three-fiber: r3f's reconciler plus three.js is ~200kB for what is one full-screen quad, and `@paper-design/shaders-react` is at `0.0.77` — pre-1.0, which this repo has already rejected as a class (`@dnd-kit/react`, TanStack Table v9, RHF v8).

**Files:**
- Create: `apps/web/components/atmosphere/hero-shader.tsx`, `apps/web/components/atmosphere/hero-shader-layer.tsx`
- Modify: `packages/ui/src/tokens/tokens.ts` (hex accent), `packages/ui/src/tokens/tokens.test.ts`
- Modify: `apps/web/app/page.tsx`, `apps/web/package.json`

**Interfaces:**
- Consumes: `tokens.color.accentSolidHex`.
- Produces: `<HeroShaderLayer />` — renders nothing on the server and nothing at all when WebGL is unavailable; otherwise mounts a fixed, `pointer-events: none`, `aria-hidden` canvas at `z-index: -1`.

- [ ] **Step 1: Add the hex accent token and its test**

WebGL and three.js both parse CSS colour strings, but neither parses `oklch()`. Add the sRGB equivalent alongside the authoritative OKLCH value.

In `packages/ui/src/tokens/tokens.ts`, extend the `color` object:
```ts
  /** sRGB equivalent of `accentSolid`, for consumers that cannot parse oklch()
   *  — WebGL uniforms and three.js materials. Keep in sync by conversion, never
   *  by eye. */
  accentSolidHex: '#EFA22C',
```

Add to `packages/ui/src/tokens/tokens.test.ts`:
```ts
  it('keeps the hex accent a faithful sRGB conversion of the OKLCH accent', () => {
    // oklch(0.770 0.152 72) → #EFA22C. Recompute if the accent ever moves;
    // a hand-picked hex silently desaturates the WebGL layer against the UI.
    expect(color.accentSolidHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(color.accentSolidHex).toBe('#EFA22C');
    expect(color.accentSolid).toBe('oklch(0.770 0.152 72)');
  });
```

Run `pnpm --filter @ayman/ui test` — expect FAIL, then add the token, then expect PASS.

- [ ] **Step 2: Install**

```bash
pnpm --filter @ayman/web add ogl@1.0.11
```

- [ ] **Step 3: Create `apps/web/components/atmosphere/hero-shader.tsx`**

```tsx
'use client';

import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import { tokens } from '@ayman/ui';

/** A full-screen triangle. Cheaper than a quad: one primitive, no diagonal seam. */
const VERTEX = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * A drifting amber field with a scanline at the 24px pitch of the dot-grid
 * backdrop, faded out radially so it never competes with the hero text.
 * Near-monochrome and low-alpha by construction — this is atmosphere, not decoration.
 */
const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec3  uAccent;
  uniform float uIntensity;
  varying vec2  vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),                hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv;
    vec2 p  = uv * vec2(uResolution.x / uResolution.y, 1.0);

    float n = noise(p * 3.0 + vec2(uTime * 0.03, uTime * 0.02));
    n += 0.5 * noise(p * 6.0 - vec2(uTime * 0.02, 0.0));

    // 2*PI/24 — one cycle per 24 device-independent pixels, the same grid pitch
    // the CSS dot-grid uses, so the two layers read as one system.
    float scan  = 0.5 + 0.5 * sin(uv.y * uResolution.y * 0.2617993878);
    float field = smoothstep(0.35, 1.0, n) * (0.85 + 0.15 * scan);

    float vignette = 1.0 - smoothstep(0.15, 0.85, length(uv - vec2(0.5, 0.35)));
    float a = field * vignette * uIntensity;

    // Premultiplied alpha: the renderer is created with premultipliedAlpha:true,
    // so RGB must already be multiplied by A or the edges fringe.
    gl_FragColor = vec4(uAccent * a, a);
  }
`;

/** '#EFA22C' → [0.937, 0.635, 0.173] */
function hexToRgbTriplet(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export default function HeroShader({ frozen }: { frozen: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      // Capping DPR at 1.5 costs nothing visually on a noise field and roughly
      // halves the fragment count on a 3x phone.
      dpr: Math.min(window.devicePixelRatio, 1.5),
    });
    const gl = renderer.gl;
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    gl.canvas.style.display = 'block';
    host.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uAccent: { value: hexToRgbTriplet(tokens.color.accentSolidHex) },
        uIntensity: { value: 0.16 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(host.clientWidth, host.clientHeight);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
      renderer.render({ scene: mesh });
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    if (!frozen) {
      const start = performance.now();
      const tick = (now: number) => {
        program.uniforms.uTime.value = (now - start) / 1000;
        renderer.render({ scene: mesh });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Without this the context stays alive after navigation and the browser
      // starts evicting the oldest contexts — the canvas silently goes black on
      // the third or fourth visit.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, [frozen]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
```

> `frozen` renders exactly one frame and never starts the RAF loop, so a reduced-motion user still gets the texture without any animation and without a persistent main-thread callback.

- [ ] **Step 4: Create `apps/web/components/atmosphere/hero-shader-layer.tsx`**

```tsx
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * `next/dynamic` with `ssr: false` throws inside a Server Component in Next 15/16,
 * which is why this wrapper carries the client directive and the home page
 * imports the wrapper rather than the shader.
 */
const HeroShader = dynamic(() => import('./hero-shader'), { ssr: false });

/** WebGL can be absent (old browser, disabled, headless CI). Detect once. */
function useWebglSupported(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      setSupported(Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl')));
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

/**
 * The single WebGL moment in the product. Fixed, behind everything, inert.
 *
 * `pointer-events: none` is not optional: a full-viewport canvas that swallows
 * clicks is a total interaction failure that looks like a routing bug.
 */
export function HeroShaderLayer() {
  const reduced = useReducedMotion();
  const supported = useWebglSupported();

  if (supported !== true) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ contain: 'strict' }}
    >
      <HeroShader frozen={reduced === true} />
    </div>
  );
}
```

- [ ] **Step 5: Mount it on the home page**

Restore the `HeroShaderLayer` import and usage in `apps/web/app/page.tsx` from Task 3 Step 3.

- [ ] **Step 6: Verify**

1. `pnpm --filter @ayman/web build` — note the size of the chunk containing `ogl`. Expected: 30–75kB gzip. If it is materially larger, something else got pulled into that chunk.
2. Open `/`. The field drifts behind the hero. Click the hero text and any link — everything is clickable (proving `pointer-events: none`).
3. `curl -s http://localhost:3200 | grep -c '<canvas'` → `0`. The canvas is client-only; the hero HTML is unchanged for crawlers.
4. Emulate `prefers-reduced-motion: reduce`, reload: the texture is present and completely still. In Performance, record 3s and confirm there are **no** `requestAnimationFrame` callbacks.
5. Navigate away and back four times, then check the console for `WARNING: Too many active WebGL contexts`. Expected: none — the `loseContext()` teardown handles it.
6. Lighthouse on `/` (mobile preset): LCP must not regress versus the pre-shader measurement. Record both numbers in the task report.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/tokens/tokens.ts packages/ui/src/tokens/tokens.test.ts \
  apps/web/components/atmosphere apps/web/app/page.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): one WebGL moment — ogl shader plane behind the hero, frozen under reduced motion"
```

---

## Task 8: The one 3D object — below the fold, desktop-only, postered

The conversion data is unambiguous: LCP under 1s → 4.4% conversion; 3–4s → 2.9%; 4s and above → **1.7%**. A ~200kB three.js payload therefore never touches the hero, and mobile never downloads it at all.

**Files:**
- Create: `apps/web/components/atmosphere/showpiece.tsx`, `apps/web/components/atmosphere/showpiece-mount.tsx`
- Create: `apps/web/public/showpiece-poster.webp`
- Modify: `apps/web/next.config.ts`, `apps/web/package.json`, `packages/contracts/src/copy/ar.ts`

**Interfaces:**
- Consumes: `tokens.color.accentSolidHex`; `copy.showpiece.posterAlt`.
- Produces: `<ShowpieceMount />` — renders the WebP poster on the server; upgrades to the live scene only when `useReducedMotion() === false` **and** `matchMedia('(min-width:1024px)').matches`.

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7
pnpm --filter @ayman/web add -D @types/three@0.185.1
```

> r3f **v9** is mandatory. v8 crashes on React 19 with `ReactCurrentOwner` errors — it reads a React internal that 19 removed. v9.6.1's peer range is `react: ">=19 <19.3"`, which our pinned 19.2.8 satisfies.

- [ ] **Step 2: Add `three` to `transpilePackages`**

In `apps/web/next.config.ts`:
```ts
  transpilePackages: ['@ayman/ui', '@ayman/contracts', 'three'],
```
> `three` ships untranspiled modern syntax that Next's default `node_modules` handling does not process; without this the production build fails inside the three ESM entry.

- [ ] **Step 3: Add the copy key**

In `packages/contracts/src/copy/ar.ts`, add to the object:
```ts
  showpiece: {
    posterAlt: 'مجسّم ثلاثي الأبعاد بخطوط شبكية يدور ببطء',
    heading: 'الشكل اللي بنبني بيه',
  },
```

- [ ] **Step 4: Create `apps/web/components/atmosphere/showpiece.tsx`**

```tsx
'use client';

import { Canvas, useFrame } from '@react-three/fiber';
// DEEP IMPORT, NOT THE BARREL. `@react-three/drei` re-exports everything from
// its index — 484kB gzip — and tree-shaking does not reliably remove the rest
// because several of its modules have side effects. One component, one path.
import { Float } from '@react-three/drei/core/Float';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { tokens } from '@ayman/ui';

function Polyhedron() {
  const ref = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    // Delta-based, not frame-based: a 120Hz display must not spin twice as fast.
    ref.current.rotation.y += delta * 0.25;
    ref.current.rotation.x += delta * 0.08;
  });

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.15, 1]} />
      {/* Wireframe over the near-black base reads as an engineering instrument.
          `meshBasicMaterial` needs no lights, which removes an entire render pass. */}
      <meshBasicMaterial color={tokens.color.accentSolidHex} wireframe />
    </mesh>
  );
}

export default function Showpiece() {
  return (
    <Canvas
      // The canvas is decorative; it is inside an aria-hidden wrapper.
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.4}>
        <Polyhedron />
      </Float>
    </Canvas>
  );
}
```

- [ ] **Step 5: Create the poster**

Render the scene once in the browser at exactly 640×480, screenshot the canvas, and export it:

```bash
# from the repo root, after capturing showpiece-poster.png at 640x480
pnpm dlx sharp-cli -i showpiece-poster.png -o apps/web/public/showpiece-poster.webp \
  --format webp --quality 82
rm showpiece-poster.png
```

The poster must be **exactly 640×480** — the same aspect ratio the mount reserves. A mismatched poster is the CLS the poster exists to prevent.

- [ ] **Step 6: Create `apps/web/components/atmosphere/showpiece-mount.tsx`**

```tsx
'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { copy } from '@ayman/contracts';

/**
 * The import is declared at module scope but `next/dynamic` does not fetch the
 * chunk until the component is actually rendered — and with `ssr: false` Next
 * emits no preload link for it either. So a phone that never satisfies the gate
 * below never issues a request for the three.js chunk at all. Task 15 asserts
 * that with a network-level Playwright check at 390px, because "it should not
 * fetch" is exactly the kind of claim that silently stops being true.
 */
const Showpiece = dynamic(() => import('./showpiece'), { ssr: false });

const DESKTOP = '(min-width: 1024px)';

function useDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return isDesktop;
}

/**
 * BELOW THE FOLD. Never render this above it.
 *
 * The poster is the server-rendered content and the fixed 640×480 box it
 * occupies is the same box the canvas takes, so the upgrade shifts nothing
 * (CLS contribution 0). Two independent gates must both pass before the chunk
 * is fetched: the user has not asked for reduced motion, and the viewport is a
 * desktop one.
 */
export function ShowpieceMount() {
  const reduced = useReducedMotion();
  const isDesktop = useDesktop();
  const live = reduced === false && isDesktop;

  return (
    <div aria-hidden="true" className="relative mx-auto aspect-[4/3] w-full max-w-[640px]">
      {live ? (
        <Showpiece />
      ) : (
        <Image
          src="/showpiece-poster.webp"
          alt={copy.showpiece.posterAlt}
          width={640}
          height={480}
          sizes="(min-width: 1024px) 640px, 100vw"
          priority={false}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify the gates hold**

1. `pnpm --filter @ayman/web build` and note the `three` chunk size. Expected: ~200kB gzip. Confirm it is a **separate** chunk, not part of the main bundle.
2. Desktop (≥1024px), motion allowed: the poster is replaced by the spinning wireframe. Nothing on the page moves during the swap — check Performance → Layout Shift, expect 0.
3. DevTools device toolbar at **390px**: reload with the Network tab open and filtered to JS. **No** request whose name contains `three` or `showpiece` may appear. Only the WebP is fetched.
4. Desktop with `prefers-reduced-motion: reduce`: the poster stays, and again no `three` chunk is requested.
5. `curl -s http://localhost:3200/<the page that hosts it> | grep -c 'showpiece-poster.webp'` → at least `1`. The poster is in the SSR'd HTML, so the box is reserved before any JS runs.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/atmosphere/showpiece.tsx apps/web/components/atmosphere/showpiece-mount.tsx \
  apps/web/public/showpiece-poster.webp apps/web/next.config.ts \
  packages/contracts/src/copy/ar.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): one 3D object — below the fold, desktop-only, postered, double-gated"
```

---

# Part B — Security hardening

---

## Task 9: Redis-backed throttling

The in-memory `@nestjs/throttler` store is per-instance. With two replicas behind a load balancer, a limit of 5 becomes an effective limit of 10 — silently, with no error and no log line. This is the single change that must land before a second replica ever exists.

> **RECONCILED — swap the storage, keep everything else.** Plan 1 Task 11 created
> `ThrottlerModule.forRoot`; **Plan 4 Task 4 rewrote it** to add `getTracker: trackerFromRequest`
> to all three named throttlers, so the login limiter keys on session/email+IP rather than IP alone
> (spec §7-P4: IP-only locks out a whole school's NAT). Re-authoring the `throttlers` array here
> would silently revert that to IP keying. **Copy the existing array forward verbatim and change
> only `storage`**, then add an assertion to `throttler-storage.int-spec.ts` that `getTracker` is
> still present and still session-keyed after the swap.

**Files:**
- Create: `apps/api/src/redis/redis.module.ts`
- Create: `apps/api/jest.integration.config.js`
- Create: `apps/api/src/test/throttler-storage.int-spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/package.json`

**Interfaces:**
- Consumes: `loadEnv(process.env).REDIS_URL` from `apps/api/src/config/env.ts` (already validated: must start `redis://` or `rediss://`).
- Produces: `RedisModule` (`@Global`) exporting the injection token `REDIS` → a single shared `Redis` client; `ThrottlerModule` configured with `ThrottlerStorageRedisService`.

- [ ] **Step 1: Install and start Redis**

```bash
brew install redis
brew services start redis
redis-cli ping   # → PONG
pnpm --filter @ayman/api add @nest-lab/throttler-storage-redis@1.2.0 ioredis@5.11.1
```

- [ ] **Step 2: Add the integration test runner**

Create `apps/api/jest.integration.config.js`:

```js
/**
 * Integration tests run against the real local Postgres and Redis.
 *
 * They are a separate suite because they are the only tests with external
 * prerequisites — `pnpm test` must stay runnable with nothing installed.
 * The naming convention is `*.int-spec.ts`, which the unit config's
 * `.*\.spec\.ts$` regex deliberately does NOT match (`-spec` ≠ `.spec`).
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.int-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['@swc/jest'] },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  // Real network round-trips plus Argon2 verification in the auth matrix.
  testTimeout: 30000,
  // A shared Postgres and one Redis keyspace cannot take parallel workers
  // without cross-test interference.
  maxWorkers: 1,
};
```

Add to `apps/api/package.json` scripts:
```json
    "test:integration": "jest --config jest.integration.config.js",
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/test/throttler-storage.int-spec.ts`:

```ts
import 'dotenv/config';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const TTL_MS = 60_000;
const LIMIT = 10;
const BLOCK_MS = 60_000;
const NAME = 'medium';

describe('throttler storage', () => {
  it('demonstrates why the in-memory store is unusable with more than one replica', async () => {
    // Two independent stores = two replicas of the API behind a load balancer.
    const replicaA = new ThrottlerStorageService();
    const replicaB = new ThrottlerStorageService();
    const key = `demo:${randomUUID()}`;

    for (let i = 0; i < LIMIT; i += 1) {
      await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
      await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    }

    // 20 requests have been served against a limit of 10, and neither replica
    // considers the caller blocked. The effective limit is limit × replicas.
    const a = await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    expect(a.totalHits).toBe(LIMIT + 1);

    replicaA.onApplicationShutdown();
    replicaB.onApplicationShutdown();
  });

  it('shares one counter across replicas when backed by Redis', async () => {
    const clientA = new Redis(REDIS_URL);
    const clientB = new Redis(REDIS_URL);
    const replicaA = new ThrottlerStorageRedisService(clientA);
    const replicaB = new ThrottlerStorageRedisService(clientB);
    const key = `shared:${randomUUID()}`;

    let last!: Awaited<ReturnType<typeof replicaA.increment>>;
    for (let i = 0; i < LIMIT / 2; i += 1) {
      last = await replicaA.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
      last = await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    }

    // Exactly LIMIT hits have been served in total across both replicas.
    expect(last.totalHits).toBe(LIMIT);
    expect(last.isBlocked).toBe(false);

    // The next one — from either replica — is over the shared limit.
    const overflow = await replicaB.increment(key, TTL_MS, LIMIT, BLOCK_MS, NAME);
    expect(overflow.isBlocked).toBe(true);
    expect(overflow.timeToBlockExpire).toBeGreaterThan(0);

    await clientA.del(key);
    await clientA.quit();
    await clientB.quit();
  });

  it('rejects rather than buffers when Redis is unreachable', async () => {
    // Fail closed. With ioredis's default offline queue, a Redis outage silently
    // buffers every increment and each limit becomes effectively unlimited for
    // the duration of the outage — an availability incident turning into an
    // authentication brute-force window.
    const dead = new Redis('redis://127.0.0.1:6399', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    dead.on('error', () => {
      /* expected: the connection cannot be established */
    });
    const storage = new ThrottlerStorageRedisService(dead);

    await expect(storage.increment(`dead:${randomUUID()}`, TTL_MS, LIMIT, BLOCK_MS, NAME)).rejects.toBeDefined();

    dead.disconnect();
  });
});
```

- [ ] **Step 4: Run it and confirm the middle test fails**

```bash
pnpm --filter @ayman/api run test:integration -- throttler-storage
```
Expected: test 1 passes (it documents the broken behaviour), test 2 **fails** until the dependency is wired, test 3 passes. If test 2 already passes, the packages installed cleanly — proceed.

- [ ] **Step 5: Create `apps/api/src/redis/redis.module.ts`**

```ts
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { loadEnv } from '../config/env';

/** Injection token for the single shared Redis connection. */
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (): Redis =>
        new Redis(loadEnv(process.env).REDIS_URL, {
          /**
           * Fail closed. ioredis defaults to queueing commands while the
           * connection is down and replaying them on reconnect; for a rate
           * limiter that means every limit silently becomes unlimited for the
           * duration of a Redis outage. Rejecting turns that into a 500, which
           * the global exception filter already handles and which alerts.
           */
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          // Named so `CLIENT LIST` on a shared Redis identifies this service.
          connectionName: 'ayman-api-throttler',
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
```

- [ ] **Step 6: Wire it into `apps/api/src/app.module.ts`**

Replace the `ThrottlerModule.forRoot({ … })` block with:

```ts
    RedisModule,
    // Layered limits, now backed by Redis so the counters are shared across
    // every replica. The in-memory store multiplied every limit by the replica
    // count — see src/test/throttler-storage.int-spec.ts for the proof.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'short', ttl: seconds(1), limit: 10 },
          { name: 'medium', ttl: seconds(60), limit: 60 },
          { name: 'long', ttl: seconds(3600), limit: 1000 },
        ],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
```

with imports:
```ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type Redis from 'ioredis';
import { REDIS, RedisModule } from './redis/redis.module';
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @ayman/api run test:integration -- throttler-storage
pnpm --filter @ayman/api test
```
Expected: 3 integration tests pass; the existing 105 unit tests stay green.

- [ ] **Step 8: Verify the login limiter still keys on email + IP**

Start the API and hammer the login endpoint six times with a wrong password for one email from one IP; the 6th must be limited. Then repeat from the same IP with a **different** email — it must NOT be limited (proving the tracker is not IP-only). Then flush Redis and hit the same email from two source IPs — the counter must be shared (proving it is not account-only either):

```bash
redis-cli FLUSHDB
redis-cli --scan --pattern '*' | head
```
Confirm the throttle keys are present in Redis after the requests. That is the observable proof the storage swap took effect.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/redis apps/api/src/app.module.ts apps/api/src/test/throttler-storage.int-spec.ts \
  apps/api/jest.integration.config.js apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): move throttler storage to Redis so limits survive replication"
```

---

## Task 10: Postgres — append-only audit log and bounded runtime sessions

**Prerequisite:** the table `app.audit_log` exists with its `prev_hash` chain, **created by Plan 6
Task 3's `*_platform_config` migration**, which also issues the `DELETE` / `UPDATE` / `TRUNCATE`
revokes against `ayman_runtime` (Plan 6 Constraint 17). Plan 5's migration does the same for
`app.attempt_events`. If either table is missing, **stop and report** — do not create it here.

> **RECONCILED — this task VERIFIES, it does not re-issue.** The revokes already exist. Running a
> second `REVOKE` migration against them is a no-op at best and a permanent `prisma migrate dev`
> drift report at worst. What this task actually adds is: the **verification suite** below (which
> is where the guarantee becomes durable), the same append-only assertions extended to
> `app.attempt_events`, and the session bounds — `statement_timeout`,
> `idle_in_transaction_session_timeout` and `lock_timeout` — on the runtime role. Only write a
> migration here if `db-hardening.int-spec.ts` fails, and then write it as the **repair** for the
> specific missing grant it reports.

**Files:**
- Create (only if the verification fails): `apps/api/prisma/migrations/<timestamp>_audit_log_append_only/migration.sql`
- Create: `apps/api/src/test/db-hardening.int-spec.ts`
- Modify: `scripts/db-bootstrap.sql`

**Interfaces:**
- Consumes: `app.audit_log` (Plan 6 Task 3), `app.attempt_events` (Plan 5 Task 3); the roles `ayman_owner` / `ayman_runtime` / `ayman_readonly` (Plan 1 Task 8).
- Produces: `has_table_privilege('ayman_runtime', 'app.audit_log', 'DELETE') = false`, likewise for `UPDATE` and `TRUNCATE`, **and the same three for `app.attempt_events`**; `statement_timeout = 15s`, `idle_in_transaction_session_timeout = 30s`, `lock_timeout = 5s` on every `ayman_runtime` session.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/test/db-hardening.int-spec.ts`:

```ts
import 'dotenv/config';
import { Client } from 'pg';

/** DATABASE_URL is the least-privilege runtime role — the one the server uses. */
const RUNTIME_URL = process.env.DATABASE_URL!;

describe('postgres hardening', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: RUNTIME_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('connects as the runtime role, never as the owner', async () => {
    const { rows } = await client.query<{ current_user: string }>('SELECT current_user');
    expect(rows[0]!.current_user).toBe('ayman_runtime');
  });

  it('bounds runaway queries and abandoned transactions', async () => {
    // A single unbounded query on a shared pool takes the whole API down with it,
    // and an abandoned `BEGIN` holds locks that block every migration afterwards.
    const show = async (name: string) => {
      const { rows } = await client.query<Record<string, string>>(`SHOW ${name}`);
      return Object.values(rows[0]!)[0];
    };
    expect(await show('statement_timeout')).toBe('15s');
    expect(await show('idle_in_transaction_session_timeout')).toBe('30s');
    expect(await show('lock_timeout')).toBe('5s');
  });

  it('cannot execute DDL', async () => {
    // No DDL means a SQL-injection foothold cannot CREATE FUNCTION or DROP.
    await expect(client.query('CREATE TABLE app.injected_probe (id int)')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('can append to the audit log', async () => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_table_privilege('ayman_runtime', 'app.audit_log', 'INSERT') AS ok`,
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('cannot delete, update, or truncate the audit log', async () => {
    const { rows } = await client.query<{ priv: string; ok: boolean }>(
      `SELECT p AS priv, has_table_privilege('ayman_runtime', 'app.audit_log', p) AS ok
         FROM unnest(ARRAY['DELETE','UPDATE','TRUNCATE']) AS p`,
    );
    for (const row of rows) expect([row.priv, row.ok]).toEqual([row.priv, false]);

    // And prove it at the wire, not only in the catalogue.
    await expect(client.query('DELETE FROM app.audit_log WHERE true')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('still allows DELETE on ordinary tables', async () => {
    // A blanket revoke would have broken normal operation; the revoke must be
    // scoped to the append-only table only.
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_table_privilege('ayman_runtime', 'app.student_profiles', 'DELETE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('grants PUBLIC nothing on the public schema', async () => {
    const { rows } = await client.query<{ ok: boolean }>(
      `SELECT has_schema_privilege('public', 'public', 'CREATE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(false);
  });
});
```

Add `pg` as an API dev dependency for the raw-SQL assertions (Prisma cannot express a permission-denied expectation cleanly):
```bash
pnpm --filter @ayman/api add -D pg@8.16.3 @types/pg@8.15.6
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
pnpm --filter @ayman/api run test:integration -- db-hardening
```
Expected: FAIL on the audit-log privilege tests and on `lock_timeout` (which is not set yet).

- [ ] **Step 3: Write the migration**

```bash
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name audit_log_append_only
```

Replace the generated (empty) `migration.sql` with:

```sql
-- The audit log is INSERT-only for the running server.
--
-- `ALTER DEFAULT PRIVILEGES` in scripts/db-bootstrap.sql grants
-- SELECT/INSERT/UPDATE/DELETE on every new table in schema `app` to
-- ayman_runtime, so this table received DELETE the moment it was created.
-- Append-only tables must therefore have it taken back explicitly, one table at
-- a time. Any future append-only table needs its own REVOKE here — keep the
-- list greppable rather than clever.
REVOKE DELETE, UPDATE, TRUNCATE ON app.audit_log FROM ayman_runtime;

-- Sequences stay usable so INSERT still works.
-- (No REVOKE on app.audit_log_id_seq.)

-- Analytics reads it; nothing else touches it.
GRANT SELECT ON app.audit_log TO ayman_readonly;
```

Apply it:
```bash
pnpm --filter @ayman/api exec prisma migrate dev
pnpm --filter @ayman/api run db:generate
```

- [ ] **Step 4: Add `lock_timeout` to the bootstrap**

`ALTER ROLE … SET` requires superuser (or CREATEROLE over that role), and `ayman_owner` has neither — so these three settings belong in the bootstrap script that runs as the superuser, **not** in a migration. Append to the end of `scripts/db-bootstrap.sql`, beside the two that are already there:

```sql
-- A migration that waits behind a long-running SELECT blocks every write
-- behind it. Five seconds is long enough for normal contention and short
-- enough that a stuck migration reports rather than hangs.
ALTER ROLE ayman_runtime SET lock_timeout = '5s';
```

Re-run the bootstrap's role settings against the local database:
```bash
psql -d ayman_platform_dev -c "ALTER ROLE ayman_runtime SET lock_timeout = '5s';"
```

> Production note for the deployment runbook: these three `ALTER ROLE` statements are part of provisioning, not of the migration history. A fresh environment built purely from `prisma migrate deploy` will **not** have them. The `db-hardening` integration test is what catches that omission, which is why it asserts `SHOW`, not just the catalogue.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @ayman/api run test:integration -- db-hardening
```
Expected: PASS — 7 tests.

- [ ] **Step 6: Prove the audit trail cannot be rewritten from the app**

With the API running, trigger an admin action that writes an audit row, then:
```bash
psql "$DATABASE_URL" -c "DELETE FROM app.audit_log;"
```
Expected: `ERROR: permission denied for table audit_log`. Record the exact error text in the task report.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/migrations apps/api/src/test/db-hardening.int-spec.ts \
  scripts/db-bootstrap.sql apps/api/package.json pnpm-lock.yaml
git commit -m "feat(db): audit_log is append-only for the runtime role, with bounded sessions"
```

---

## Task 11: CSP — report-only, split by route, with a live report endpoint

**Files:**
- Create: `apps/web/lib/security/theme-script.ts`, `apps/web/lib/security/csp.ts`, `apps/web/lib/security/csp.test.ts`
- Create: `apps/web/lib/auth/route-guard.ts` (extracted from Plan 2)
- Modify: `apps/web/proxy.ts`, `apps/web/app/layout.tsx`
- Create: `apps/api/src/modules/security/csp-report.controller.ts`, `.../csp-report.module.ts`, `.../csp-report.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes (from Plan 2, Task 8): the redirect logic currently inline in `apps/web/proxy.ts`. Step 1 extracts it, unchanged, to `apps/web/lib/auth/route-guard.ts` as `resolveRedirect(request: NextRequest): URL | null`.
- Produces:
  - `THEME_SCRIPT: string` and `THEME_SCRIPT_HASH: string` (`'sha256-…'`, quoted, CSP-ready).
  - `isAuthenticatedRoute(pathname: string): boolean`.
  - `buildAuthenticatedCsp(opts: { nonce: string; dev: boolean; extraScriptHosts?: string[] }): string` — **throws** if `extraScriptHosts` is non-empty.
  - `buildPublicCsp(opts: { dev: boolean }): string`.
  - `POST /api/security/csp-report` — public, throttled, always `204`.

### ⚠️ Correction to the spec's "hash-based policy for the public catalog"

The spec (§7 P5) says public routes get a hash-based CSP so they stay cached. That is only half achievable, and shipping the half that does not work would break every prerendered page:

- Next.js emits its own inline bootstrap scripts (`self.__next_f.push(…)`) carrying the RSC payload. Their content varies per page and per build, so they cannot be hashed by us.
- Next only adds a `nonce` attribute to those scripts when it finds a `nonce-` source in the **request's** `content-security-policy` header — which is exactly why nonces disable static optimization, ISR and PPR.
- Per CSP2+, **the presence of any hash or nonce in `script-src` makes browsers ignore `'unsafe-inline'`.** So writing `script-src 'self' 'sha256-…' 'unsafe-inline'` on a public page does not "add a hash as well" — it *removes* `'unsafe-inline'` in every modern browser and blocks Next's own bootstrap. The page dies.

**Resolution.** Two genuinely different policies:

| | public / prerendered | authenticated |
|---|---|---|
| `script-src` | `'self' 'unsafe-inline'` | `'self' 'nonce-{v}' 'strict-dynamic' {theme hash}` |
| static optimization | preserved | already dynamic (reads cookies) |
| our one authored inline script | covered by `'unsafe-inline'` | covered by its **hash**, so the root layout never calls `headers()` |

Everything else — `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, the YouTube `frame-src`, the thumbnail `img-src` — is identical on both and is where most of the value is. The authored theme script is hash-pinned on the strict policy, which is the policy where it matters.

- [ ] **Step 1: Extract Plan 2's redirect logic**

Move the redirect body from `apps/web/proxy.ts` into `apps/web/lib/auth/route-guard.ts` **verbatim**, exported as:

```ts
import type { NextRequest } from 'next/server';

/**
 * Returns the URL an unauthenticated or not-yet-onboarded visitor must be sent
 * to, or null if the request may proceed. Behaviour is unchanged from Plan 2
 * Task 8 — this is a pure extraction so proxy.ts can also own the CSP.
 */
export function resolveRedirect(request: NextRequest): URL | null { /* moved code */ }
```

Then re-run the Plan 2 Task 8 redirect matrix by hand (anonymous → `/dashboard` redirects to login; logged-in-not-onboarded → `/dashboard` redirects to onboarding; fully onboarded → `/dashboard` renders) and confirm all three still behave identically **before** touching anything else.

- [ ] **Step 2: Create `apps/web/lib/security/theme-script.ts`**

```ts
/**
 * The only inline script this application authors.
 *
 * It lives in its own module with no imports so that both the root layout (which
 * renders it) and the CSP builder (which hashes it) read the exact same bytes.
 * A hash computed from a copy is a hash that goes stale silently.
 */
export const THEME_SCRIPT =
  `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
```

Update `apps/web/app/layout.tsx` to import it and delete the local copy:
```tsx
import { THEME_SCRIPT } from '@/lib/security/theme-script';
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/lib/security/csp.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT } from './theme-script';
import {
  THEME_SCRIPT_HASH,
  buildAuthenticatedCsp,
  buildPublicCsp,
  isAuthenticatedRoute,
} from './csp';

const NONCE = 'r4nd0mNONCEvalue';
const directive = (policy: string, name: string) =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name) ?? '';

describe('csp', () => {
  it('hashes the exact bytes of the script the layout renders', () => {
    const expected = `'sha256-${createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64')}'`;
    expect(THEME_SCRIPT_HASH).toBe(expected);
  });

  it('classifies routes', () => {
    expect(isAuthenticatedRoute('/dashboard')).toBe(true);
    expect(isAuthenticatedRoute('/dashboard/courses/1')).toBe(true);
    expect(isAuthenticatedRoute('/admin')).toBe(true);
    expect(isAuthenticatedRoute('/quizzes/abc')).toBe(true);
    expect(isAuthenticatedRoute('/courses/algo/lessons/l1')).toBe(true);
    expect(isAuthenticatedRoute('/')).toBe(false);
    expect(isAuthenticatedRoute('/courses')).toBe(false);
    // The public course detail page must stay cacheable — a nonce here would
    // disable PPR on the surface that carries the SEO.
    expect(isAuthenticatedRoute('/courses/algo')).toBe(false);
    // A public route that merely starts with the same letters is not protected.
    expect(isAuthenticatedRoute('/administrivia')).toBe(false);
  });

  it('keeps the public policy compatible with prerendering', () => {
    const policy = buildPublicCsp({ dev: false });
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain('nonce-');
    // A hash next to 'unsafe-inline' would make browsers ignore 'unsafe-inline'
    // and block Next's own inline flight scripts. See the note in Plan 7 Task 11.
    expect(scriptSrc).not.toContain('sha256-');
  });

  it('makes the authenticated policy strict and nonce-driven', () => {
    const policy = buildAuthenticatedCsp({ nonce: NONCE, dev: false });
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
    expect(scriptSrc).toContain("'strict-dynamic'");
    // The theme script is inline and un-nonced (the root layout must not call
    // headers()), so it is pinned by hash instead.
    expect(scriptSrc).toContain(THEME_SCRIPT_HASH);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('refuses to pretend a host allowlist works alongside strict-dynamic', () => {
    // 'strict-dynamic' makes browsers IGNORE every host source in script-src.
    // Adding a domain there is a silent no-op, so the builder rejects it.
    expect(() =>
      buildAuthenticatedCsp({ nonce: NONCE, dev: false, extraScriptHosts: ['https://cdn.example'] }),
    ).toThrow(/strict-dynamic/i);
  });

  it('locks down the shared directives on both policies', () => {
    for (const policy of [buildPublicCsp({ dev: false }), buildAuthenticatedCsp({ nonce: NONCE, dev: false })]) {
      expect(directive(policy, 'object-src')).toBe("object-src 'none'");
      expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
      expect(directive(policy, 'form-action')).toBe("form-action 'self'");
      expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
      expect(directive(policy, 'frame-src')).toBe('frame-src https://www.youtube-nocookie.com');
      expect(directive(policy, 'img-src')).toBe("img-src 'self' blob: data: https://i.ytimg.com");
      expect(policy).toContain('report-uri /api/security/csp-report');
      expect(policy).toContain('report-to csp-endpoint');
      expect(policy).toContain('upgrade-insecure-requests');
    }
  });

  it('never leaks the dev-only relaxations into production', () => {
    for (const policy of [buildPublicCsp({ dev: false }), buildAuthenticatedCsp({ nonce: NONCE, dev: false })]) {
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain('ws:');
    }
    // …and does include them in development, where React Refresh and the HMR
    // socket cannot run without them.
    const dev = buildPublicCsp({ dev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toContain('ws:');
    expect(dev).not.toContain('upgrade-insecure-requests');
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
pnpm --filter @ayman/web test
```
Expected: FAIL — `Failed to resolve import "./csp"`.

- [ ] **Step 5: Implement `apps/web/lib/security/csp.ts`**

```ts
import { createHash } from 'node:crypto';
import { THEME_SCRIPT } from './theme-script';

/** Quoted and ready to drop into a directive. */
export const THEME_SCRIPT_HASH = `'sha256-${createHash('sha256')
  .update(THEME_SCRIPT, 'utf8')
  .digest('base64')}'`;

/**
 * Routes that already read cookies and are therefore dynamic anyway. Only these
 * get the nonce-based policy — a nonce anywhere else would disable static
 * optimization, ISR and PPR on the public catalog, which is the cached surface
 * that carries the SEO.
 */
// RECONCILED: these are the real authenticated route prefixes shipped by
// Plans 2–6. There is no `/learn` segment in this product — the player is
// `/courses/[slug]/lessons/[lessonId]` in the `(app)` route group (Plan 4) and
// the quiz runner is `/quizzes/[lessonId]` (Plan 5). `/courses` itself is
// PUBLIC (Plan 3, `(site)` group) and must stay cacheable, so the nested lesson
// path is matched by shape rather than by prefix.
export const AUTHENTICATED_PREFIXES = [
  '/dashboard',   // Plan 2 / Plan 4
  '/onboarding',  // Plan 2
  '/settings',    // Plan 2
  '/admin',       // Plan 3 / Plan 6
  '/quizzes',     // Plan 5
] as const;

/** `/courses/:slug/lessons/:id` — authenticated; `/courses` and `/courses/:slug` — public. */
const LESSON_PATH = /^\/courses\/[^/]+\/lessons\/[^/]+/;

export function isAuthenticatedRoute(pathname: string): boolean {
  if (LESSON_PATH.test(pathname)) return true;
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Identical on both policies. This is where most of the value lives. */
function sharedDirectives(dev: boolean): string[] {
  const directives = [
    "default-src 'self'",
    // Next injects inline <style> for critical CSS, and site branding renders as
    // an inline :root block from the settings loader. Style hashes are not
    // achievable for either; style-src is a far weaker XSS vector than script-src.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://i.ytimg.com",
    "font-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    // blob: is required by the WebGL/three chunks, which instantiate workers.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Videos are reconstructed server-side as youtube-nocookie embed URLs from a
    // stored 11-character id; no other frame source is ever legitimate.
    'frame-src https://www.youtube-nocookie.com',
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    // report-uri is deprecated but is still the only mechanism Safari and
    // Firefox implement; report-to is what Chrome honours. Ship both.
    'report-uri /api/security/csp-report',
    'report-to csp-endpoint',
  ];
  // upgrade-insecure-requests would rewrite http://localhost to https and break
  // local development outright.
  if (!dev) directives.push('upgrade-insecure-requests');
  return directives;
}

/**
 * Public, prerendered routes.
 *
 * `'unsafe-inline'` is deliberate and load-bearing: Next's inline flight scripts
 * cannot be hashed by us and are not nonced on statically rendered pages. Adding
 * any hash here would cause modern browsers to IGNORE 'unsafe-inline' and block
 * the page. See the correction note in Plan 7 Task 11.
 */
export function buildPublicCsp({ dev }: { dev: boolean }): string {
  const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
  if (dev) scriptSrc.push("'unsafe-eval'");
  return [scriptSrc.join(' '), ...sharedDirectives(dev)].join('; ');
}

/**
 * Authenticated routes.
 *
 * The nonce reaches Next through the REQUEST header `content-security-policy`
 * (see proxy.ts), which is what makes Next stamp `nonce=` on its own scripts.
 * The authored theme script is un-nonced — the root layout must not call
 * headers() or every public route becomes dynamic — so it is pinned by hash.
 */
export function buildAuthenticatedCsp({
  nonce,
  dev,
  extraScriptHosts = [],
}: {
  nonce: string;
  dev: boolean;
  extraScriptHosts?: string[];
}): string {
  if (extraScriptHosts.length > 0) {
    throw new Error(
      "'strict-dynamic' makes browsers ignore host allowlists in script-src, so " +
        `adding ${extraScriptHosts.join(', ')} there is a no-op. A third-party script ` +
        'must receive the nonce instead.',
    );
  }
  const scriptSrc = [`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_SCRIPT_HASH}`];
  if (dev) scriptSrc.push("'unsafe-eval'");
  return [scriptSrc.join(' '), ...sharedDirectives(dev)].join('; ');
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @ayman/web test
```
Expected: PASS — 7 CSP tests plus the loading-coverage suite.

- [ ] **Step 7: Rewrite `apps/web/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { resolveRedirect } from '@/lib/auth/route-guard';
import { buildAuthenticatedCsp, buildPublicCsp, isAuthenticatedRoute } from '@/lib/security/csp';

/**
 * `proxy.ts`, not `middleware.ts` — the latter is deprecated in Next 16.
 * It runs on Node, so it can verify the session properly.
 */

/**
 * Flip to enforcement only after 1–2 weeks of a quiet report endpoint.
 * A strict CSP deployed blind will break the app; the report-only header is how
 * you find out which parts before your users do.
 */
const CSP_HEADER =
  process.env.CSP_ENFORCE === 'true'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';

const DEV = process.env.NODE_ENV !== 'production';

/** Headers that are unconditional and cheap. */
function applyBaseSecurityHeaders(headers: Headers): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-DNS-Prefetch-Control', 'off');
  if (!DEV) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  // Chrome's Reporting API endpoint group referenced by `report-to`.
  headers.set(
    'Reporting-Endpoints',
    'csp-endpoint="/api/security/csp-report"',
  );
}

export function proxy(request: NextRequest) {
  const redirect = resolveRedirect(request);
  if (redirect) {
    const response = NextResponse.redirect(redirect);
    applyBaseSecurityHeaders(response.headers);
    return response;
  }

  const { pathname } = request.nextUrl;

  if (!isAuthenticatedRoute(pathname)) {
    // No nonce, no request-header mutation: the response stays cacheable and the
    // route keeps its static optimization / PPR treatment.
    const response = NextResponse.next();
    applyBaseSecurityHeaders(response.headers);
    response.headers.set(CSP_HEADER, buildPublicCsp({ dev: DEV }));
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildAuthenticatedCsp({ nonce, dev: DEV });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  /**
   * Next extracts the nonce from the REQUEST header named `content-security-policy`
   * and only from that name. During the report-only soak the response carries
   * `Content-Security-Policy-Report-Only`, so without this line Next would stamp
   * no nonces at all and every report would be a false positive.
   * This header is never sent to the browser.
   */
  requestHeaders.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applyBaseSecurityHeaders(response.headers);
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except Next's own static output, the image optimizer, and
     * static asset requests — none of which execute script, and all of which
     * would otherwise pay for a proxy invocation per request.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|svg|woff2)$).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
```

- [ ] **Step 8: Build the report endpoint**

Create `apps/api/src/modules/security/csp-report.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '../../auth/decorators/public.decorator';

export interface NormalisedViolation {
  directive: string;
  blockedUri: string;
  documentUri: string;
  sample: string;
}

/** Long samples are page content; they flood logs and can carry user data. */
const SAMPLE_MAX = 120;
/** Dedupe window. A single broken page otherwise emits thousands of identical reports. */
const DEDUPE_MS = 60_000;
const DEDUPE_MAX_KEYS = 500;

function truncate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, SAMPLE_MAX) : '';
}

/** Both the legacy `report-uri` body and the Reporting API `report-to` body. */
export function normalise(body: unknown): NormalisedViolation[] {
  const out: NormalisedViolation[] = [];

  if (Array.isArray(body)) {
    for (const entry of body) {
      const report = entry as { type?: string; body?: Record<string, unknown> };
      if (report.type !== 'csp-violation' || !report.body) continue;
      out.push({
        directive: truncate(report.body.effectiveDirective),
        blockedUri: truncate(report.body.blockedURL),
        documentUri: truncate(report.body.documentURL),
        sample: truncate(report.body.sample),
      });
    }
    return out;
  }

  const legacy = (body as { 'csp-report'?: Record<string, unknown> })?.['csp-report'];
  if (legacy) {
    out.push({
      directive: truncate(legacy['effective-directive'] ?? legacy['violated-directive']),
      blockedUri: truncate(legacy['blocked-uri']),
      documentUri: truncate(legacy['document-uri']),
      sample: truncate(legacy['script-sample']),
    });
  }
  return out;
}

@Controller('security')
export class CspReportController {
  private readonly seen = new Map<string, number>();

  constructor(
    @InjectPinoLogger(CspReportController.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Always 204, never 4xx.
   *
   * A report endpoint that returns errors is an oracle (it tells an attacker
   * which shapes are recognised) and makes browsers retry noisily. Unparseable
   * bodies are dropped silently.
   *
   * Public by necessity: the browser posts these with no credentials, often on a
   * page the user is not signed in to. Throttled hard for the same reason.
   */
  @Public()
  @Throttle({ short: { limit: 20, ttl: seconds(10) } })
  @Post('csp-report')
  @HttpCode(204)
  report(@Body() body: unknown): void {
    const now = Date.now();
    for (const violation of normalise(body)) {
      if (!violation.directive) continue;
      const key = `${violation.directive}|${violation.blockedUri}`;
      const last = this.seen.get(key);
      if (last !== undefined && now - last < DEDUPE_MS) continue;
      if (this.seen.size >= DEDUPE_MAX_KEYS) this.seen.clear();
      this.seen.set(key, now);
      this.logger.warn({ csp: violation }, 'csp violation');
    }
  }
}
```

Create `apps/api/src/modules/security/csp-report.module.ts`:

```ts
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { json } from 'express';
import { CspReportController } from './csp-report.controller';

/**
 * `main.ts` bootstraps with `bodyParser: false` because Better Auth needs raw
 * bodies, so this route must parse its own — and it must accept the two content
 * types browsers actually send for violation reports, neither of which is
 * `application/json` in every engine.
 *
 * `forRoutes(Controller)` rather than a path string: passing the class lets Nest
 * resolve the route including the global `/api` prefix.
 */
@Module({ controllers: [CspReportController] })
export class SecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        json({
          type: ['application/csp-report', 'application/reports+json', 'application/json'],
          limit: '16kb',
        }),
      )
      .forRoutes(CspReportController);
  }
}
```

Register it in `apps/api/src/app.module.ts` `imports`, after `ProfileModule`:
```ts
    SecurityModule,
```

- [ ] **Step 9: Write and run the endpoint tests**

Create `apps/api/src/modules/security/csp-report.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getLoggerToken, PinoLogger } from 'nestjs-pino';
import { Reflector } from '@nestjs/core';
import { CspReportController, normalise } from './csp-report.controller';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

describe('CspReportController', () => {
  let controller: CspReportController;
  let warn: jest.Mock;

  beforeEach(async () => {
    warn = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [CspReportController],
      providers: [
        {
          provide: getLoggerToken(CspReportController.name),
          useValue: { warn } as unknown as PinoLogger,
        },
      ],
    }).compile();
    controller = moduleRef.get(CspReportController);
  });

  it('normalises the legacy report-uri body', () => {
    expect(
      normalise({
        'csp-report': {
          'document-uri': 'https://x/y',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/a.js',
          'script-sample': 'alert(1)',
        },
      }),
    ).toEqual([
      {
        directive: 'script-src-elem',
        blockedUri: 'https://evil.example/a.js',
        documentUri: 'https://x/y',
        sample: 'alert(1)',
      },
    ]);
  });

  it('normalises the Reporting API array body', () => {
    expect(
      normalise([
        {
          type: 'csp-violation',
          body: {
            documentURL: 'https://x/y',
            effectiveDirective: 'img-src',
            blockedURL: 'https://cdn.example/a.png',
            sample: '',
          },
        },
        { type: 'deprecation', body: {} },
      ]),
    ).toEqual([
      { directive: 'img-src', blockedUri: 'https://cdn.example/a.png', documentUri: 'https://x/y', sample: '' },
    ]);
  });

  it('truncates a long sample', () => {
    const [violation] = normalise({
      'csp-report': { 'effective-directive': 'script-src', 'script-sample': 'x'.repeat(500) },
    });
    expect(violation!.sample).toHaveLength(120);
  });

  it('drops an unrecognised body without throwing', () => {
    expect(() => controller.report({ nonsense: true })).not.toThrow();
    expect(() => controller.report(null)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a repeated violation once per window', () => {
    const body = {
      'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' },
    };
    controller.report(body);
    controller.report(body);
    controller.report(body);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is reachable without a session', () => {
    const isPublic = new Reflector().get(IS_PUBLIC_KEY, CspReportController.prototype.report);
    expect(isPublic).toBe(true);
  });
});
```

> If `IS_PUBLIC_KEY` is not exported from `apps/api/src/auth/decorators/public.decorator.ts`, export the metadata key there — the guard already reads it, and a test that re-declares the string would pass while the decorator drifted.

```bash
pnpm --filter @ayman/api test
```
Expected: PASS.

- [ ] **Step 10: Verify end to end**

1. `curl -sI http://localhost:3200/ | grep -i 'content-security-policy'` → the **Report-Only** header, containing `'unsafe-inline'` and no `nonce-`.
2. `curl -sI http://localhost:3200/dashboard | grep -i 'content-security-policy'` → the Report-Only header containing `nonce-` and `'strict-dynamic'`.
3. `curl -s http://localhost:3200/dashboard | grep -o 'nonce="[^"]*"' | head -3` → Next stamped nonces on its own scripts (proving the request-header trick works while the response is report-only).
4. Load `/dashboard` in a browser and confirm **zero** CSP violations in the console. Any violation here is a real finding; log it and fix the page, not the policy.
5. Force one on purpose: paste `document.body.appendChild(Object.assign(document.createElement('img'),{src:'https://example.com/x.png'}))` into the console. Confirm a `csp violation` warn line appears in the API log with `directive: 'img-src'`.
6. `curl -sI http://localhost:3200/courses | grep -i 'x-nextjs-cache\|cache-control'` → the public route is still cacheable; the nonce did not leak onto it.

- [ ] **Step 11: Start the soak clock**

Record the date in the task report. **`CSP_ENFORCE` stays unset for 1–2 weeks.** Before flipping it: read every distinct `csp violation` line from that period, fix each one at the source, and confirm a full day with zero reports. Then set `CSP_ENFORCE=true` and re-run the flow tests from Task 14.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/security apps/web/lib/auth/route-guard.ts apps/web/proxy.ts \
  apps/web/app/layout.tsx apps/api/src/modules/security apps/api/src/app.module.ts \
  apps/api/src/auth/decorators/public.decorator.ts
git commit -m "feat(security): report-only CSP split by route, with a deduping report endpoint"
```

---

## Task 12: The authorization matrix

For each protected route × each role × owner/non-owner, assert the expected status. **This is the test that actually catches IDOR** — not a code review, not a decorator audit.

**Files:**
- Create: `apps/api/src/test/route-inventory.ts`
- Create: `apps/api/src/test/authorization-matrix.int-spec.ts`

**Interfaces:**
- Consumes: `AppModule`; the `@Public()` and `@RequirePermission()` metadata keys; the seeded taxonomy.
- Produces: `enumerateRoutes(app: INestApplicationContext): RouteRef[]` where `RouteRef = { method: string; path: string; controller: string; handler: string; isPublic: boolean; permission: string | null }`.

- [ ] **Step 1: Create the route inventory**

Create `apps/api/src/test/route-inventory.ts`:

```ts
import { RequestMethod, type INestApplicationContext } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';

export interface RouteRef {
  method: string;
  path: string;
  controller: string;
  handler: string;
  isPublic: boolean;
  permission: string | null;
}

function joinPath(...parts: unknown[]): string {
  const segments = parts
    .map((part) => (typeof part === 'string' ? part : ''))
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

/**
 * Enumerates every HTTP route Nest actually registered, from the DI container
 * rather than from the Express router internals — which change shape between
 * Express 4 and 5 and are not public API.
 *
 * The point of enumerating is coverage: the matrix test fails when a route
 * exists that nobody wrote an authorization expectation for. A hand-maintained
 * list of endpoints silently stops being complete on the 41st endpoint.
 */
export function enumerateRoutes(app: INestApplicationContext): RouteRef[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const routes: RouteRef[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const basePath = Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

    for (const handlerName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[handlerName] as (...args: unknown[]) => unknown;
      const subPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (subPath === undefined) continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;

      routes.push({
        method: RequestMethod[verb] ?? 'ALL',
        // setGlobalPrefix('api') is applied in main.ts, not visible in metadata.
        path: joinPath('api', basePath, subPath),
        controller: metatype.name,
        handler: handlerName,
        isPublic:
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, metatype) === true,
        permission:
          (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler) as string | undefined) ?? null,
      });
    }
  }

  return routes;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/test/authorization-matrix.int-spec.ts`:

```ts
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { enumerateRoutes, type RouteRef } from './route-inventory';

type Actor = 'anonymous' | 'student' | 'otherStudent' | 'admin';

interface MatrixRow {
  /** Must match a registered route exactly, parameters included. */
  route: string;
  /** Concrete URL for the request, resolved from the fixtures. */
  url: (ctx: Fixtures) => string;
  body?: (ctx: Fixtures) => Record<string, unknown>;
  expected: Record<Actor, number>;
}

interface Fixtures {
  studentId: string;
  otherStudentId: string;
  cookies: Record<Exclude<Actor, 'anonymous'>, string>;
}

/**
 * THE MATRIX.
 *
 * One row per route. `expected` is exhaustive over actors on purpose: writing
 * `403` for `otherStudent` is the assertion that catches IDOR, and leaving an
 * actor out would let it pass by omission.
 *
 * 401 = not authenticated. 403 = authenticated but not permitted.
 * Distinguishing them here is deliberate: a 403 where a 401 belongs means the
 * guard ran in the wrong order.
 */
const MATRIX: MatrixRow[] = [
  {
    route: 'GET /api/health',
    url: () => '/api/health',
    expected: { anonymous: 200, student: 200, otherStudent: 200, admin: 200 },
  },
  {
    route: 'GET /api/taxonomy',
    url: () => '/api/taxonomy',
    expected: { anonymous: 200, student: 200, otherStudent: 200, admin: 200 },
  },
  {
    route: 'POST /api/security/csp-report',
    url: () => '/api/security/csp-report',
    body: () => ({ 'csp-report': { 'effective-directive': 'img-src' } }),
    expected: { anonymous: 204, student: 204, otherStudent: 204, admin: 204 },
  },
  {
    route: 'GET /api/profile/me',
    url: () => '/api/profile/me',
    expected: { anonymous: 401, student: 200, otherStudent: 200, admin: 200 },
  },
  {
    route: 'PATCH /api/profile/onboarding',
    url: () => '/api/profile/onboarding',
    body: () => ({ schoolName: `مدرسة ${randomUUID().slice(0, 6)}` }),
    expected: { anonymous: 401, student: 200, otherStudent: 200, admin: 403 },
  },
  {
    route: 'GET /api/sessions',
    url: () => '/api/sessions',
    expected: { anonymous: 401, student: 200, otherStudent: 200, admin: 200 },
  },
  // ── Add one row per route Plans 3–6 introduced. Step 3 tells you which. ──
];

describe('authorization matrix', () => {
  let app: INestApplication;
  let routes: RouteRef[];
  let fixtures: Fixtures;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    await app.init();
    routes = enumerateRoutes(app);
    fixtures = await seedActors(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('has an expectation for every registered route', () => {
    const covered = new Set(MATRIX.map((row) => row.route));
    const uncovered = routes
      .map((route) => `${route.method} ${route.path}`)
      .filter((key) => !covered.has(key));
    expect(
      uncovered,
      `routes with no authorization expectation: ${uncovered.join(', ')}`,
    ).toEqual([]);
  });

  it('has no matrix row pointing at a route that no longer exists', () => {
    const registered = new Set(routes.map((route) => `${route.method} ${route.path}`));
    const stale = MATRIX.map((row) => row.route).filter((key) => !registered.has(key));
    expect(stale).toEqual([]);
  });

  it('marks nothing public by accident', () => {
    // Every public route is a deliberate decision, so the list is asserted
    // literally: adding @Public() to anything else fails this test loudly.
    const publicRoutes = routes
      .filter((route) => route.isPublic)
      .map((route) => `${route.method} ${route.path}`)
      .sort();
    expect(publicRoutes).toEqual(
      ['GET /api/health', 'GET /api/taxonomy', 'POST /api/security/csp-report'].sort(),
    );
  });

  describe.each(MATRIX)('$route', (row) => {
    it.each<Actor>(['anonymous', 'student', 'otherStudent', 'admin'])('as %s', async (actor) => {
      const [method, routePath] = row.route.split(' ') as [string, string];
      const verb = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
      let call = request(app.getHttpServer())[verb](row.url(fixtures));
      if (actor !== 'anonymous') call = call.set('Cookie', fixtures.cookies[actor]);
      if (row.body) call = call.send(row.body(fixtures));
      const response = await call;
      expect(
        response.status,
        `${row.route} as ${actor} (declared path ${routePath})`,
      ).toBe(row.expected[actor]);
    });
  });
});

/**
 * Registers one admin and two students through the real auth endpoints and
 * returns their session cookies. Going through the real flow rather than
 * inserting rows is deliberate: a cookie minted by a test helper can be valid
 * in ways a browser's never is.
 */
async function seedActors(app: INestApplication): Promise<Fixtures> {
  const server = app.getHttpServer();
  const password = 'correct-horse-battery-staple-1';

  const signUp = async (email: string) => {
    const response = await request(server)
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: email.split('@')[0] });
    const cookie = (response.headers['set-cookie'] as unknown as string[]).join('; ');
    return { cookie, id: (response.body as { user: { id: string } }).user.id };
  };

  const student = await signUp(`s-${randomUUID()}@example.test`);
  const otherStudent = await signUp(`o-${randomUUID()}@example.test`);
  const admin = await signUp(`a-${randomUUID()}@example.test`);

  // Promotion happens out of band — there is deliberately no API for it.
  const { PrismaService } = await import('../prisma/prisma.service');
  const prisma = app.get(PrismaService);
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } });

  return {
    studentId: student.id,
    otherStudentId: otherStudent.id,
    cookies: { student: student.cookie, otherStudent: otherStudent.cookie, admin: admin.cookie },
  };
}
```

- [ ] **Step 3: Run it and let the coverage test write your work list**

```bash
pnpm --filter @ayman/api run test:integration -- authorization-matrix
```
Expected: FAIL on *"routes with no authorization expectation: …"*, printing every route Plans 3–6 added. Add one `MatrixRow` per printed route. For every route that takes an owned resource id, add **both** the owner row (`student: 200`) and the non-owner row (`otherStudent: 403`) — a route that returns `200` to `otherStudent` is an IDOR, and it is the whole reason this test exists.

- [ ] **Step 4: Run it to green**

```bash
pnpm --filter @ayman/api run test:integration -- authorization-matrix
```
Expected: PASS. Any row failing with `200` where `403` was expected is a live vulnerability — fix the repository query to scope on the actor (`WHERE id = $1 AND user_id = $2`), never by fetching and then comparing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/test/route-inventory.ts apps/api/src/test/authorization-matrix.int-spec.ts
git commit -m "test(api): authorization matrix over every route × role × ownership"
```

---

## Task 13: CI gates

A pre-commit hook is a courtesy; `git commit --no-verify` removes it. The gate that matters runs on the server.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (root scripts)

**Interfaces:**
- Consumes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @ayman/api run test:integration`, `scripts/db-bootstrap.sql`, `.gitleaks.toml`.
- Produces: five required checks — `gitleaks`, `quality`, `unit`, `integration`, `e2e`.

- [ ] **Step 1: Add the root convenience script**

In the root `package.json` scripts:
```json
    "test:integration": "pnpm --filter @ayman/api run test:integration",
    "test:e2e": "pnpm --filter @ayman/web run test:e2e",
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# A new push supersedes an in-flight run on the same ref.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '24'
  PNPM_VERSION: '11.17.0'

jobs:
  gitleaks:
    name: gitleaks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          # Full history: a secret committed three commits ago and reverted is
          # still in the history and still compromised.
          fetch-depth: 0
      - name: Install gitleaks
        run: |
          set -euo pipefail
          VERSION=8.30.0
          curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz" \
            | tar -xz -C /usr/local/bin gitleaks
          gitleaks version
      - name: Scan repository history
        # The pre-commit hook runs `gitleaks protect --staged`. This is the half
        # that `--no-verify` cannot skip.
        run: gitleaks detect --source . --config .gitleaks.toml --redact --exit-code 1

  quality:
    name: lint + typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # Prisma's client is generated, not committed, and typecheck imports it.
      - run: pnpm --filter @ayman/api run db:generate
      - run: pnpm lint
      - run: pnpm typecheck

  unit:
    name: unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ayman/api run db:generate
      - run: pnpm test

  integration:
    name: integration tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: ci_superuser_password
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      NODE_ENV: test
      API_PORT: '3300'
      APP_URL: http://localhost:3200
      BETTER_AUTH_URL: http://localhost:3300
      BETTER_AUTH_SECRET: ci-only-secret-value-at-least-32-chars
      REDIS_URL: redis://localhost:6379
      DATABASE_URL: postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev?schema=app
      DIRECT_DATABASE_URL: postgresql://ayman_owner:dev_owner_password@localhost:5432/ayman_platform_dev?schema=app
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Provision roles and schema
        # The same script developers run locally, so CI and local cannot drift.
        # The passwords in it are dev-only literals and are allowlisted in
        # .gitleaks.toml for exactly this reason.
        run: PGPASSWORD=ci_superuser_password psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/db-bootstrap.sql
      - run: pnpm --filter @ayman/api exec prisma migrate deploy
      - run: pnpm --filter @ayman/api run db:generate
      - run: pnpm --filter @ayman/api run db:seed
      - run: pnpm test:integration

  e2e:
    name: playwright
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: ci_superuser_password
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      NODE_ENV: test
      API_PORT: '3300'
      API_ORIGIN: http://localhost:3300
      APP_URL: http://localhost:3200
      BETTER_AUTH_URL: http://localhost:3300
      BETTER_AUTH_SECRET: ci-only-secret-value-at-least-32-chars
      REDIS_URL: redis://localhost:6379
      DATABASE_URL: postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev?schema=app
      DIRECT_DATABASE_URL: postgresql://ayman_owner:dev_owner_password@localhost:5432/ayman_platform_dev?schema=app
      E2E_ADMIN_EMAIL: admin@e2e.test
      E2E_ADMIN_PASSWORD: e2e-admin-password-not-a-secret
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: PGPASSWORD=ci_superuser_password psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/db-bootstrap.sql
      - run: pnpm --filter @ayman/api exec prisma migrate deploy
      - run: pnpm --filter @ayman/api run db:generate
      - run: pnpm --filter @ayman/api run db:seed
      - run: pnpm --filter @ayman/api exec tsx prisma/seed-admin.ts
      - run: pnpm build
      - run: pnpm --filter @ayman/web exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 14
```

- [ ] **Step 3: Verify the workflow parses and the gitleaks job actually blocks**

Push the branch and confirm all five jobs appear. Then prove the secret gate is real: on a scratch branch, commit a file containing a plausible AWS key shape, push, and confirm the `gitleaks` job **fails**. Delete the scratch branch afterwards.

```bash
git checkout -b scratch/gitleaks-proof
printf 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n' > leak.txt
git add leak.txt && git commit --no-verify -m "test: prove CI catches what --no-verify skipped"
git push -u origin scratch/gitleaks-proof
# confirm the gitleaks job fails, then:
git push origin --delete scratch/gitleaks-proof && git checkout - && git branch -D scratch/gitleaks-proof
```

The `--no-verify` in that commit is the point of the exercise: the local hook was bypassed and CI caught it anyway.

- [ ] **Step 4: Make the checks required**

In the GitHub repository settings → Branches → branch protection rule for `main`, mark `gitleaks`, `lint + typecheck`, `unit tests`, `integration tests` and `playwright` as **required status checks**, and enable "Require branches to be up to date before merging". A workflow that can be merged around is not a gate. Record in the task report that this was done — it is repository configuration, not code, and nothing in the repo can assert it.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: lint, typecheck, unit, integration, e2e, and gitleaks as required checks"
```

---

## Task 14: Playwright E2E on the three flows that matter

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/fixtures.ts`
- Create: `apps/web/e2e/signup-onboarding-lesson.e2e.ts`
- Create: `apps/web/e2e/quiz-attempt-review.e2e.ts`
- Create: `apps/web/e2e/admin-publish-course.e2e.ts`
- Create: `apps/api/prisma/seed-admin.ts`
- Modify: `apps/web/package.json`, `.gitignore`

**Interfaces:**
- Consumes: the Arabic copy table — every locator resolves against `copy.*`, never a hand-typed Arabic string and never a CSS class. See "Interfaces expected from other plans" at the end of this document for the exact keys.
- Produces: `pnpm --filter @ayman/web run test:e2e`; `uniqueStudent()` and `loginAs()` fixtures.

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add -D @playwright/test@1.62.0
pnpm --filter @ayman/web exec playwright install --with-deps chromium
```

Add to `apps/web/package.json` scripts:
```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
```

Add to `.gitignore`:
```
apps/web/playwright-report/
apps/web/test-results/
```

- [ ] **Step 2: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

/**
 * `*.e2e.ts`, NOT `*.spec.ts`.
 *
 * Vitest's default include pattern picks up `**​/*.spec.ts`, so a Playwright file
 * named `.spec.ts` would be loaded by `pnpm test` and fail with a confusing
 * "test.describe() can only be called in a test file" error. Different suffix,
 * no collision.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false, // one database, sequential
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3200',
    // The product is Arabic-only and RTL. Running the browser in any other
    // locale hides bidi bugs that only appear under a real RTL UA.
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  /**
   * Both servers, in the single-origin arrangement the app assumes: the browser
   * only ever touches :3200, which rewrites /api to :3300. Pointing Playwright
   * at :3300 directly would test a topology that does not exist.
   */
  webServer: [
    {
      command: 'pnpm --filter @ayman/api run start',
      url: 'http://localhost:3300/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @ayman/web run start',
      url: 'http://localhost:3200',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
```

- [ ] **Step 3: Create the admin seeder**

`apps/api/prisma/seed-admin.ts`:

```ts
/**
 * Creates (or repairs) the single admin account the E2E suite drives the admin
 * flow with. Idempotent, and refuses to run without an explicit password so it
 * can never silently create an admin with a guessable default.
 */
import 'dotenv/config';
import { hash } from 'argon2';
import { ARGON2_OPTIONS } from '../src/auth/argon2-options';
import { PrismaClient } from '../src/generated/prisma/client';

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must both be set.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('seed-admin.ts must never run against production.');
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await hash(password!, ARGON2_OPTIONS);
  const user = await prisma.user.upsert({
    where: { email: email! },
    update: { role: 'admin', emailVerified: true },
    create: { email: email!, name: 'E2E Admin', role: 'admin', emailVerified: true },
  });
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
    update: { password: passwordHash },
    create: {
      providerId: 'credential',
      accountId: user.id,
      userId: user.id,
      password: passwordHash,
    },
  });
  process.stdout.write(`seeded admin ${email}\n`);
}

void main().finally(() => prisma.$disconnect());
```

> Verify the `Account` unique constraint name against `apps/api/prisma/schema.prisma` before running — Better Auth's generated model names the compound key, and using the wrong one fails at compile time rather than silently creating duplicates.

- [ ] **Step 4: Create `apps/web/e2e/fixtures.ts`**

```ts
import type { Page } from '@playwright/test';
import { copy } from '@ayman/contracts';

/** Egyptian mobile numbers are 11 digits beginning 010/011/012/015. */
export function uniqueStudent() {
  const stamp = Date.now().toString().slice(-9);
  return {
    email: `student-${stamp}@e2e.test`,
    password: 'correct-horse-battery-staple-1',
    fullName: 'طالب اختبار',
    phone: `010${stamp.slice(0, 8)}`,
  };
}

export async function register(page: Page, student: ReturnType<typeof uniqueStudent>) {
  await page.goto('/register');
  await page.getByLabel(copy.auth.email).fill(student.email);
  await page.getByLabel(copy.auth.password).fill(student.password);
  await page.getByRole('button', { name: copy.auth.submitRegister }).click();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(copy.auth.email).fill(email);
  await page.getByLabel(copy.auth.password).fill(password);
  await page.getByRole('button', { name: copy.auth.submitLogin }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(
    page,
    process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test',
    process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-not-a-secret',
  );
}
```

- [ ] **Step 5: Flow 1 — `apps/web/e2e/signup-onboarding-lesson.e2e.ts`**

```ts
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { register, uniqueStudent } from './fixtures';

test.describe('signup → onboarding → first lesson', () => {
  test('a new student reaches a lesson without ever seeing a dead end', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);

    // Registration lands on onboarding, not the dashboard: the profile is empty.
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByLabel(copy.onboarding.fullName).fill(student.fullName);
    await page.getByLabel(copy.onboarding.phone).fill(student.phone);
    await page.getByRole('button', { name: copy.onboarding.next }).click();

    await page.getByLabel(copy.onboarding.governorate).selectOption({ label: 'القاهرة' });
    await page.getByRole('button', { name: copy.onboarding.next }).click();

    await page.getByLabel(copy.onboarding.system).selectOption({ label: 'البكالوريا' });

    // Grade 1 is common and non-specialised in both systems: the track field is
    // HIDDEN, not disabled, and its value must be cleared.
    await page.getByLabel(copy.onboarding.year).selectOption({ label: 'الصف الأول الثانوي' });
    await expect(page.getByLabel(copy.onboarding.track)).toBeHidden();

    // Switching to grade 2 reveals the track and, once chosen, the elective.
    await page.getByLabel(copy.onboarding.year).selectOption({ label: 'الصف الثاني الثانوي' });
    await expect(page.getByLabel(copy.onboarding.track)).toBeVisible();
    await page.getByLabel(copy.onboarding.track).selectOption({ index: 1 });
    await expect(page.getByLabel(copy.onboarding.electiveSubject)).toBeVisible();
    await page.getByLabel(copy.onboarding.electiveSubject).selectOption({ index: 1 });

    await page.getByRole('button', { name: copy.onboarding.finish }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Reach an actual lesson from the dashboard.
    await page.getByRole('link', { name: copy.nav.courses }).click();
    await page.getByRole('link').filter({ hasText: /./ }).first().click();
    await page.getByRole('link', { name: copy.course.startLearning }).click();

    await expect(page).toHaveURL(/\/courses\/[^/]+\/lessons\//);
    // The video is a youtube-nocookie embed reconstructed from a stored 11-char
    // id — never a user-supplied URL.
    const frame = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
    await expect(frame).toHaveCount(1);
  });

  test('an incomplete profile cannot skip past onboarding', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
```

- [ ] **Step 6: Flow 2 — `apps/web/e2e/quiz-attempt-review.e2e.ts`**

```ts
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { QUIZ_DEMO_LESSON_ID, login, register, uniqueStudent } from './fixtures';

test.describe('quiz attempt → submit → review', () => {
  test('answers are graded server-side and never leak before submission', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await page.goto('/dashboard');

    // The seeded practice quiz. `QUIZ_DEMO_LESSON_ID` is exported by
    // `prisma/seed-admin.ts` (Task 13) and the route is Plan 5's.
    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);

    // THE contract assertion: the payload that renders the paper must not carry
    // grading data. This is the highest-value single check in the whole suite.
    const [attemptResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/quiz/attempts') && res.request().method() === 'POST'),
      page.getByRole('button', { name: copy.quiz.start }).click(),
    ]);
    const raw = await attemptResponse.text();
    expect(raw).not.toContain('fraction');
    expect(raw).not.toContain('isCorrect');
    expect(raw).not.toContain('feedback');

    // Answer every question.
    const options = page.getByRole('radio');
    const count = await options.count();
    for (let i = 0; i < count; i += 1) {
      const option = options.nth(i);
      if (await option.isVisible()) await option.check();
    }

    // Confirm-before-submit with an unanswered count is deliberate: the
    // benchmarked competitor's single-attempt-no-undo trap is their biggest
    // support-ticket generator.
    await page.getByRole('button', { name: copy.quiz.submit }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: copy.quiz.confirmSubmit }).click();

    await expect(page.getByText(copy.quiz.resultHeading)).toBeVisible();

    // Review now shows correctness — and green/red appear here and nowhere else.
    await page.getByRole('link', { name: copy.quiz.review }).click();
    await expect(page.locator('[data-correctness]').first()).toBeVisible();
  });

  test('a resumed attempt keeps the same question order', async ({ page, context }) => {
    const student = uniqueStudent();
    await register(page, student);
    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);
    await page.getByRole('button', { name: copy.quiz.start }).click();

    const before = await page.getByRole('group').allInnerTexts();
    await context.clearCookies({ name: '__Host-session_data' }).catch(() => undefined);
    await login(page, student.email, student.password);
    await page.goto(`/quizzes/${QUIZ_DEMO_LESSON_ID}`);

    // option_order is snapshotted at attempt creation; without that snapshot a
    // resume-after-disconnect reshuffles the paper under the student.
    const after = await page.getByRole('group').allInnerTexts();
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 7: Flow 3 — `apps/web/e2e/admin-publish-course.e2e.ts`**

```ts
import { expect, test } from '@playwright/test';
import { copy } from '@ayman/contracts';
import { loginAsAdmin, register, uniqueStudent } from './fixtures';

test.describe('admin creates a course → publishes → a student sees it', () => {
  test('an unpublished course is invisible; publishing makes it visible', async ({ page, browser }) => {
    const title = `كورس اختبار ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto('/admin/courses');
    await page.getByRole('button', { name: copy.admin.course.new }).click();
    await page.getByLabel(copy.admin.course.title).fill(title);
    await page.getByRole('button', { name: copy.admin.common.save }).click();
    await expect(page.getByText(title)).toBeVisible();

    // A second, isolated browser context = a genuinely different student session.
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    const student = uniqueStudent();
    await register(studentPage, student);
    await studentPage.goto('/courses');
    await expect(studentPage.getByText(title)).toHaveCount(0);

    await page.getByRole('button', { name: copy.admin.common.publish }).click();
    await expect(page.getByText(copy.admin.course.statusPublished)).toBeVisible();

    // updateTag() — not revalidateTag() — is what makes the editor's own write
    // visible immediately; the student's cached catalog picks it up on reload.
    await studentPage.reload();
    await expect(studentPage.getByText(title)).toBeVisible();

    await studentContext.close();
  });

  test('a student cannot reach the admin dashboard', async ({ page }) => {
    const student = uniqueStudent();
    await register(page, student);
    await page.goto('/admin/courses');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
```

- [ ] **Step 8: Run them**

```bash
pnpm --filter @ayman/api exec tsx prisma/seed-admin.ts
pnpm build
pnpm test:e2e
```
Expected: all three flows pass on both the `desktop` and `mobile` projects. Where a locator does not resolve, fix the **component** to expose a proper accessible name — do not fall back to a CSS or test-id selector, because a locator that cannot find the element by its label is telling you a screen reader cannot either.

- [ ] **Step 9: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e apps/api/prisma/seed-admin.ts \
  apps/web/package.json .gitignore pnpm-lock.yaml
git commit -m "test(e2e): playwright coverage of signup→lesson, quiz→review, admin publish→visible"
```

---

## Task 15: Accessibility, visual, and motion-budget audits

**Files:**
- Create: `apps/web/e2e/a11y.e2e.ts`
- Create: `apps/web/e2e/visual.e2e.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: the public route list; `/dev/tokens`.
- Produces: an axe pass on every public route, light and dark screenshots of the token gallery, and two motion-budget regression tests (one orchestrated reveal per page; no three.js chunk on mobile).

- [ ] **Step 1: Install**

```bash
pnpm --filter @ayman/web add -D @axe-core/playwright@4.12.1
```

- [ ] **Step 2: Create `apps/web/e2e/a11y.e2e.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Every route reachable without a session. Keep in sync with app/ by hand —
 *  a route that is public and not listed here is the one that will regress. */
const PUBLIC_ROUTES = ['/', '/courses', '/about', '/contact', '/login', '/register'] as const;

for (const route of PUBLIC_ROUTES) {
  test.describe(`a11y ${route}`, () => {
    test('has no serious or critical axe violations', async ({ page }, testInfo) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      // Attach the full report even on success — the moderate/minor findings are
      // the backlog, and they are invisible if only failures are recorded.
      await testInfo.attach(`axe-${route.replace(/\//g, '_') || 'root'}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
      ).toEqual([]);
    });

    test('declares Arabic and RTL on the document element', async ({ page }) => {
      await page.goto(route);
      // Getting this wrong is a total accessibility failure for the entire
      // audience, and it is invisible to a sighted developer.
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    });

    test('keeps every interactive target reachable by keyboard', async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
      expect(focused).not.toBe('BODY');
      // The tokenised focus ring must actually paint — outline:none with no
      // replacement is the most common regression in a design-token refactor.
      const outline = await page.evaluate(
        () => getComputedStyle(document.activeElement!).outlineWidth,
      );
      expect(outline).not.toBe('0px');
    });
  });
}
```

- [ ] **Step 3: Create `apps/web/e2e/visual.e2e.ts`**

```ts
import { expect, test } from '@playwright/test';

test.describe('token gallery', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`renders in ${theme}`, async ({ page }) => {
      // Both mechanisms, because both exist: the media query drives first paint
      // before JS, the attribute records an explicit choice.
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => {
        window.localStorage.setItem('theme', value);
      }, theme);
      await page.goto('/dev/tokens');

      // Fonts and the shimmer must settle or the diff is noise.
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`tokens-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
      });
    });
  }

  test('casts no shadow in dark mode', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
    await page.goto('/dev/tokens');
    const shadows = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).boxShadow)
        .filter((value) => value !== 'none' && !value.startsWith('rgba(0, 0, 0, 0) 0px 0px 0px')),
    );
    expect(shadows).toEqual([]);
  });
});

test.describe('motion budget', () => {
  const ROUTES = ['/', '/courses', '/about'] as const;

  for (const route of ROUTES) {
    test(`${route} has at most one orchestrated reveal`, async ({ page }) => {
      await page.goto(route);
      // Scroll-triggered fade-in on every section is the loudest item on the
      // AI-slop ban list. One moment per page, at most — asserted, not assumed.
      await expect(page.locator('[data-orchestrated-reveal]')).toHaveCount(1, { timeout: 5000 }).catch(
        async () => {
          const count = await page.locator('[data-orchestrated-reveal]').count();
          expect(count, `${route} declared ${count} orchestrated reveals`).toBeLessThanOrEqual(1);
        },
      );
    });
  }

  test('never ships the three.js chunk to a phone', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      locale: 'ar-EG',
    });
    const page = await context.newPage();
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.goto('/');
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(2000);

    const heavy = requested.filter((url) => /three|showpiece/.test(url) && url.endsWith('.js'));
    expect(heavy, `a 390px viewport fetched: ${heavy.join(', ')}`).toEqual([]);

    // …and the poster that reserves the box IS fetched.
    expect(requested.some((url) => url.includes('showpiece-poster'))).toBe(true);
    await context.close();
  });

  test('above-the-fold HTML contains no opacity:0', async ({ page }) => {
    const response = await page.goto('/');
    const html = (await response!.text()).slice(0, 20_000);
    // Motion serialises `initial` into the SSR'd inline style. An opacity:0
    // above the fold ships invisible LCP content.
    expect(html).not.toContain('opacity:0');
  });
});
```

- [ ] **Step 4: Generate the baselines**

```bash
pnpm test:e2e -- --update-snapshots visual
git add apps/web/e2e/visual.e2e.ts-snapshots
```
Review both PNGs by eye before committing. A baseline captured from a broken render locks the bug in.

> Snapshot baselines are platform-specific. Generate them **inside CI** (or accept `maxDiffPixelRatio` noise from font rasterisation differences between macOS and Linux) — commit the CI-generated set, and record which platform produced them in the task report.

- [ ] **Step 5: Run the full audit**

```bash
pnpm test:e2e
```
Expected: all a11y, visual, and motion-budget tests pass. Fix every serious/critical axe violation at the component level. Attach the moderate/minor findings from the JSON artifacts to the task report as the accessibility backlog.

- [ ] **Step 6: Record the performance numbers**

Run Lighthouse (mobile preset) against `/`, `/courses`, and one course detail page, and record LCP, INP and CLS for each in the task report. Targets, from the conversion data in the spec: **LCP < 1s** is the 4.4%-conversion band; 4s+ is the 1.7% band. CLS must be **0** on any page carrying the poster or a skeleton. If LCP regressed against the pre-Plan-7 baseline, the shader or the 3D gate is the first suspect — say so plainly rather than shipping and hoping.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/a11y.e2e.ts apps/web/e2e/visual.e2e.ts \
  apps/web/e2e/visual.e2e.ts-snapshots apps/web/package.json pnpm-lock.yaml
git commit -m "test(e2e): axe on every public route, light+dark token baselines, motion budget guards"
```

---

## Definition of done

**Motion and atmosphere**
- [ ] `<LazyMotion features={loadFeatures} strict>` + `<MotionConfig reducedMotion="user">` wrap the app; the `domAnimation` chunk loads after the document, not with it.
- [ ] Rendering `<motion.div>` anywhere throws at runtime **and** fails `pnpm lint`.
- [ ] `curl -s http://localhost:3200 | grep -c 'opacity:0'` returns `0`.
- [ ] Every Motion duration is ≤ 400ms, every exit is faster than its entrance, and no exit uses an ease-in curve — asserted by `packages/ui/src/motion/variants.test.ts`, not by inspection.
- [ ] Shiki markup is in the SSR'd HTML and no `shiki`/`onig` chunk is requested by the browser.
- [ ] The code reveal produces zero layout shift; the container is at its final height before it starts.
- [ ] The WebGL layer is `pointer-events: none`, frozen under reduced motion (zero rAF callbacks), and releases its context on unmount.
- [ ] At a 390px viewport, **no** JS chunk matching `three` or `showpiece` is requested; the WebP poster is.
- [ ] Every product route has a Server-Component `loading.tsx`; no same-segment `layout.tsx` beside one reads request state.
- [ ] Route progress animates via `transform` and does not fire on query-only navigations.
- [ ] At most one `[data-orchestrated-reveal]` per page.

**Security**
- [ ] Throttle counters live in Redis; two storage instances share one counter, and a dead Redis rejects rather than buffers.
- [ ] `psql "$DATABASE_URL" -c "DELETE FROM app.audit_log;"` fails with `permission denied for table audit_log`.
- [ ] `statement_timeout=15s`, `idle_in_transaction_session_timeout=30s`, `lock_timeout=5s` all confirmed via `SHOW` on a runtime connection.
- [ ] `Content-Security-Policy-Report-Only` is served on every route; the authenticated policy carries a nonce, `'strict-dynamic'` and the theme-script hash; the public policy carries `'unsafe-inline'` and no hash, and public routes are still cacheable.
- [ ] `POST /api/security/csp-report` accepts both browser report shapes, always returns 204, dedupes within 60s, and truncates samples at 120 characters.
- [ ] The soak start date is recorded and `CSP_ENFORCE` is **unset**.
- [ ] The authorization matrix covers every registered route; a non-owner receives 403 on every owned resource; the public-route list is asserted literally.
- [ ] `gitleaks`, `lint + typecheck`, `unit tests`, `integration tests` and `playwright` are required status checks on `main`, and a `--no-verify` commit containing a secret was proven to fail CI.
- [ ] All three E2E flows pass on desktop and mobile projects.
- [ ] Zero serious/critical axe violations on every public route; `lang="ar"` and `dir="rtl"` asserted on each.
- [ ] Light and dark token-gallery baselines are committed, and dark mode casts no `box-shadow`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e` all green.

## Deliberately not in this plan

- **Enforcing the CSP.** `CSP_ENFORCE=true` is a deliberate follow-up after 1–2 weeks of a quiet report endpoint. Flipping it in this plan would be shipping a strict CSP blind, which is exactly what the report-only phase exists to prevent.
- **Alerting.** A09:2025 is *Logging **and Alerting** Failures* — logs nobody alerts on do not count. Wiring token-reuse, lockout and CSP-violation spikes to a real channel needs a channel to exist, and there is no deployment yet.
- **`sslmode=verify-full` with a pinned CA.** Correct for production, meaningless against a local Unix-socket Postgres. It belongs in the deployment runbook.
- **Uploads hardening** (magic-byte checks, `sharp` re-encode, presigned PUT with `ContentType`/`ContentLength` inside the signature, a separate serving origin). No upload surface ships in v1; the media library is admin-only and stores keys.
- **Refresh-token rotation with reuse detection and the 10s grace window.** Reserved for when the mobile client exists; the Better Auth `jwt` plugin is already enabled so this is additive.
- **Apple Sign In verification.** Still blocked on a staging HTTPS domain — Apple rejects `http://localhost` redirect URIs. Report it as untested, never as working.
- **Testcontainers.** The spec calls for them; this machine has no Docker. Integration tests run against the local Postgres and Redis instead, and CI uses service containers. Revisit if Docker lands.
- **A second WebGL moment, a second 3D object, or scroll-linked parallax.** The budget is one of each, by design.
- **English UI, `next-intl`, or an `[locale]` segment.** v1 is Arabic-only; the contracts copy table is what makes that a routing change later rather than a rewrite.
- **A skeleton for `app/dev/*`.** The playground is not a product surface and is exempt from the coverage test.

---

## Depends on

Plan 7 is build-order items 14–15 and runs last. These must exist for it to compile and for its
tests to run. If a name differs, reconcile **towards the earlier plan** and update this document —
do not add a shim. The register in `docs/superpowers/plans/README.md` is normative.

**Plan 1 — Foundation**
- `packages/config/eslint/index.js` — Task 2 registers `ayman/no-layout-animation` beside `ayman/no-physical-direction`
- `packages/ui/src/tokens/tokens.ts` exporting `tokens.motion = { easing: { out, pop, inOut, base, linear, outNumbers }, duration: { hover: 160, popover: 200, modal: 300, exit: 120 } }` (milliseconds) — Task 1's variants test asserts the Motion variants and these CSS tokens are the same numbers
- `packages/ui/src/components/skeleton.tsx` — Task 5 extends it with `SkeletonText` / `SkeletonCardGrid`
- `apps/api` Jest + SWC config — Task 13 adds `jest.integration.config.js` for `*.int-spec.ts` beside it
- `scripts/db-bootstrap.sql` and the three Postgres roles — Task 10 adds `lock_timeout` to the runtime role
- `ThrottlerModule.forRoot` in `app.module.ts`

**Plan 2 — Auth & onboarding**
- `apps/web/proxy.ts` — Task 11 Step 1 extracts its redirect body **verbatim** into `apps/web/lib/auth/route-guard.ts` as `resolveRedirect(request: NextRequest): URL | null`. Plan 3 Task 11 Step 3b turned the protected list into an exported `PROTECTED_PREFIXES` constant; keep it.
- `apps/api/src/auth/decorators/public.decorator.ts` must **export** its metadata key as `IS_PUBLIC_KEY`
- `apps/api/src/auth/decorators/require-permission.decorator.ts` must **export** its metadata key as `REQUIRE_PERMISSION_KEY`
- `apps/api/src/auth/argon2-options.ts` must export `ARGON2_OPTIONS` (m=19456, t=2, p=1) for `prisma/seed-admin.ts`
- Prisma `Account` with a compound unique on `(providerId, accountId)` and a `password` field, plus `User.role` and `User.emailVerified`
- `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`
- Copy: `copy.auth.{email, password, submitRegister, submitLogin}`; `copy.onboarding.{fullName, phone, next, finish}` in addition to `governorate/system/year/track/electiveSubject`

**Plan 3 — Content & catalog**
- Public routes `/courses`, `/courses/[slug]` in the `(site)` route group; `/about` and `/contact` (Task 15's `PUBLIC_ROUTES`)
- Admin routes under `/admin/*`, rendered from `apps/web/app/(admin)/layout.tsx` (Task 11's `AUTHENTICATED_PREFIXES`)
- The YouTube embed is `<iframe src="https://www.youtube-nocookie.com/embed/{id}">`, built by `youTubeEmbedUrl()` in `@ayman/contracts/video` — Task 11's CSP allows exactly that host in `frame-src`
- Copy: `copy.course.startLearning`; `copy.admin.course.{new, title, statusPublished}`; `copy.admin.common.{save, publish}`
  ⚠️ **not** flat `copy.admin.{newCourse, courseTitle, save, publish, published}` — `copy.admin` is a shared namespace split by sub-key between Plans 3 and 6, and flat keys there collide. Plan 3 owns `copy.admin.{common, nav, course, section, lesson, reorder}`.
- The vitest + jsdom harness for `apps/web` and `packages/ui`, with `*.test.ts(x)` as its include glob — this is why Task 14's Playwright specs are `*.e2e.ts` and `apps/api`'s are `*.spec.ts` / `*.int-spec.ts`. Three runners, three globs, no overlap.

**Plan 4 — Course player & progress**
- The learner routes `/courses/[slug]/lessons/[lessonId]` in the `(app)` route group — Task 11's `AUTHENTICATED_PREFIXES` and Task 14's `signup-onboarding-lesson.e2e.ts`
- `/dashboard`
- Task 4's `getTracker: trackerFromRequest` on all three named throttlers — **Task 9 swaps the storage for Redis and must preserve it**, not overwrite the module config
- `MEDIA_BASE_URL` in `env.ts`

**Plan 5 — Quiz engine**
- `/quizzes/[lessonId]`, `/quizzes/[lessonId]/attempt/[attemptId]` and `.../review` — Task 14's `quiz-attempt-review.e2e.ts`
- A seeded practice quiz reachable from a seeded lesson; `prisma/seed-admin.ts` (Task 13) also seeds it
- `POST /api/quiz/attempts/:attemptId/save` and `POST /api/quiz/attempts/:attemptId/submit` returning a paper payload containing no `fraction`, `isCorrect` or `feedback` key
- `FORBIDDEN_ANSWER_KEYS` and `@NoAnswerLeak()` — Task 12 reuses both
- `apps/api/src/modules/quiz/quiz.authz.spec.ts` — Task 12 generalises its fixture into the repo-wide matrix
- Review markup exposing `data-correctness` on each answered question
- Copy: `copy.quiz.{start, submit, confirmSubmit, resultHeading, review}`
- `app.attempt_events` with `UPDATE`/`DELETE` revoked from `ayman_runtime` — Task 10 **verifies** this; Plan 5's migration writes it

**Plan 6 — Admin dashboard & platform configuration**
- **`app.audit_log`, hash-chained, with `DELETE`/`UPDATE`/`TRUNCATE` revoked from `ayman_runtime`** — written by Plan 6's `*_platform_config` migration. **Task 10 verifies and hardens around it; it does not create the table or re-issue the revokes.**
- `AuditService.record()` and `AUDIT_ACTIONS`
- The completed `PERMISSIONS` catalogue and `GET /api/session` — Task 12's matrix enumerates every route × role against it
- `apps/web/app/(admin)/layout.tsx` in its final shell form — Task 14's `admin-publish-course.e2e.ts` drives it
- `NEXT_PUBLIC_MEDIA_ORIGIN` — Task 11's CSP `img-src` must include it

**Plan 7 produces**
- `motionPresets` from `@ayman/ui`; the `ayman/no-layout-animation` ESLint rule
- `buildPublicCsp` / `buildAuthenticatedCsp` / `isAuthenticatedRoute` / `THEME_SCRIPT_HASH` in `apps/web/lib/security/csp.ts`
- `POST /api/security/csp-report` (public)
- `REDIS` token + `RedisModule` in `apps/api`
- `enumerateRoutes()` in `apps/api/src/test/route-inventory.ts`
- `apps/api/jest.integration.config.js` (`*.int-spec.ts`) and `apps/web/playwright.config.ts` (`*.e2e.ts` — deliberately not `*.spec.ts`, which vitest would claim)

**One documented spec correction, resolved inside this plan.** The spec's "hash-based CSP on public
routes" is only half achievable: Next's inline flight scripts cannot be hashed, and adding any hash
next to `'unsafe-inline'` makes browsers ignore `'unsafe-inline'` and break every prerendered page.
Task 11 resolves it — public routes get `'self' 'unsafe-inline'` with no hash and stay cacheable;
authenticated routes get a nonce + `'strict-dynamic'` + the theme-script hash, so the root layout
never calls `headers()`.
