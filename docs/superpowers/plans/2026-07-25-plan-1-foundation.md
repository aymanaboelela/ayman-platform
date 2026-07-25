# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, the design system, the database with seeded البكالوريا taxonomy, and the NestJS core — ending with a real Arabic RTL page that renders the 27 governorates fetched from Postgres through NestJS.

**Architecture:** pnpm workspace orchestrated by Turborepo. `apps/web` (Next.js 16) and `apps/api` (NestJS 11) share Zod contracts from `packages/contracts` and design tokens from `packages/ui`. Web reaches the API through a same-origin `/api` rewrite, so no CORS exists in any environment. NestJS is the only process that talks to Postgres.

**Tech Stack:** pnpm 11.17 · Turborepo 2.10 · TypeScript 5.9 · Next.js 16.2.11 · React 19.2.8 · Tailwind CSS 4.3.3 · NestJS 11.1.28 · Prisma 7.9.0 · PostgreSQL 16.14 · Zod 4.4.3 · Vitest (web/packages) · Jest+SWC (api)

**Spec:** `docs/superpowers/specs/2026-07-25-ayman-platform-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. Never configure CORS. Never hardcode `http://localhost:3300` in web code — always call `/api/...`.
2. **Ports:** web `3200`, api `3300`. Port 3000 is occupied by an unrelated service on this machine.
3. **RTL is native, not mirrored.** Logical CSS properties only. `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`, `text-right`, `border-l-*`, `border-r-*` are **lint errors**. Use `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s-*`, `border-e-*`.
4. **No user-facing string literals in components.** All Arabic copy lives in `packages/contracts/src/copy/ar.ts` and is imported. This is what makes English a routing change later instead of a rewrite.
5. **Font weights are 400 / 500 / 600 / 700 only.** No variable build of IBM Plex Sans Arabic exists (verified 2026-07-25). Weights 510/590/680 are unreachable.
6. **Never apply negative `letter-spacing` to Arabic.** Global `[lang="ar"] * { letter-spacing: 0 !important }` with tracking re-enabled only on `.latin, code, kbd, .mono`.
7. **Never `line-height: normal`.** Explicit unitless line-heights. Arabic body = Latin body + 0.15.
8. **Digits are Western (0123)** everywhere, with `font-variant-numeric: tabular-nums` on tables, timers, and scores.
9. **No shadows in dark mode.** `--shadow-*` resolves to `0 0 0 transparent` under `[data-theme="dark"]`.
10. **Radius never exceeds 8px on a card.** `--r-full` is for pills only.
11. **Accent is amber** `oklch(0.770 0.152 72)`. Green and red are reserved for quiz correctness and must never be used as brand or decoration.
12. **Prisma 7 gotchas, all three required:** generator must be `provider = "prisma-client"` with `moduleFormat = "cjs"` and `output` **inside `apps/api/src/`**; env vars are no longer auto-loaded (`import 'dotenv/config'`); `prisma generate` no longer runs automatically after `migrate`.
13. **Config is validated by Zod at boot.** A missing or malformed env var crashes startup — it never falls through to `undefined`.
14. **Commit after every task.** Conventional commit messages.

---

## File Structure

```
ayman-platform/
├─ package.json                     workspace root, scripts, packageManager
├─ pnpm-workspace.yaml              workspace globs + dependency catalog
├─ turbo.json                       task graph: build, dev, lint, typecheck, test
├─ .nvmrc / .gitignore / .env.example
├─ .githooks/pre-commit             gitleaks + lint-staged
│
├─ packages/config/
│  ├─ tsconfig.base.json            strict TS settings shared by every package
│  ├─ eslint/index.js               flat config preset
│  └─ eslint/rules/no-physical-direction.js   the RTL rule (custom, tested)
│
├─ packages/contracts/
│  ├─ src/copy/ar.ts                every Arabic string in the product
│  ├─ src/taxonomy.ts               Zod schemas + inferred types for taxonomy
│  └─ src/index.ts
│
├─ packages/ui/
│  ├─ src/tokens/color.css          Radix-12-step OKLCH scales, light + dark
│  ├─ src/tokens/typography.css     dual-track type scale
│  ├─ src/tokens/space.css          spacing, radius, layout widths
│  ├─ src/tokens/motion.css         easing curves + durations
│  ├─ src/tokens/index.css          imports the four above
│  ├─ src/tokens/tokens.ts          the same values as typed JS (for tests + JS consumers)
│  ├─ src/lib/cn.ts                 clsx + tailwind-merge
│  └─ src/components/{button,card,badge,skeleton,field}.tsx
│
├─ apps/web/
│  ├─ next.config.ts                cacheComponents, /api rewrite, transpilePackages
│  ├─ app/layout.tsx                <html lang="ar" dir="rtl">, fonts, theme script
│  ├─ app/globals.css               @import tailwindcss + tokens + base layer
│  ├─ app/page.tsx                  temporary landing
│  ├─ app/dev/tokens/page.tsx       the design-system gallery
│  ├─ lib/fonts.ts                  next/font/local wiring for both faces
│  ├─ lib/api.ts                    typed same-origin fetch helper
│  └─ components/theme-toggle.tsx
│
└─ apps/api/
   ├─ prisma/schema.prisma          taxonomy models (Plan 1 scope)
   ├─ prisma/seed.ts                27 governorates, systems, years, tracks, subjects
   ├─ prisma.config.ts              Prisma 7 config (replaces package.json#prisma)
   ├─ src/config/env.ts             Zod env schema, validated at boot
   ├─ src/prisma/prisma.service.ts  PrismaClient lifecycle
   ├─ src/common/filters/all-exceptions.filter.ts
   ├─ src/modules/taxonomy/*        controller + service + module
   ├─ src/health/health.controller.ts
   └─ src/main.ts
```

---

## Task 1: Workspace skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.env.example`
- Create: `packages/config/tsconfig.base.json`, `packages/config/package.json`

**Interfaces:**
- Produces: a `pnpm -w` workspace where `pnpm turbo run typecheck` exits 0 with no packages yet. Every later task adds a workspace member.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

catalog:
  typescript: 5.9.3
  zod: 4.4.3
  '@types/node': 24.10.1
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "ayman-platform",
  "private": true,
  "packageManager": "pnpm@11.17.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter @ayman/api exec prisma migrate dev",
    "db:seed": "pnpm --filter @ayman/api run db:seed",
    "db:studio": "pnpm --filter @ayman/api exec prisma studio"
  },
  "devDependencies": {
    "turbo": "2.10.6",
    "typescript": "catalog:",
    "@types/node": "catalog:",
    "prettier": "3.6.2"
  }
}
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

- [ ] **Step 4: Create `packages/config/tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create `packages/config/package.json`**

```json
{
  "name": "@ayman/config",
  "version": "0.0.0",
  "private": true,
  "files": ["tsconfig.base.json", "eslint"],
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint": "./eslint/index.js"
  }
}
```

- [ ] **Step 6: Create `.nvmrc` and `.env.example`**

`.nvmrc`:
```
24
```

`.env.example`:
```bash
# ── database ──────────────────────────────────────────────────────────
DATABASE_URL="postgresql://ayman_runtime:CHANGE_ME@localhost:5432/ayman_platform_dev?schema=app"
# migrations only; has DDL rights. Never used by the running server.
DIRECT_DATABASE_URL="postgresql://ayman_owner:CHANGE_ME@localhost:5432/ayman_platform_dev?schema=app"

# ── app ───────────────────────────────────────────────────────────────
NODE_ENV="development"
API_PORT="3300"
APP_URL="http://localhost:3200"

# ── redis (throttler + cache handler) ─────────────────────────────────
REDIS_URL="redis://localhost:6379"
```

- [ ] **Step 7: Install and verify**

Run:
```bash
cd /Users/cairocamerarentals/Documents/GitHub/ayman-platform
pnpm install
pnpm turbo run typecheck
```
Expected: install succeeds; `turbo run typecheck` reports "No tasks were executed" (no packages define it yet) and exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: pnpm workspace + turborepo skeleton"
```

---

## Task 2: The RTL lint rule

This rule is the mechanical guarantee behind Global Constraint 3. It ships before any UI so no violating code is ever written.

**Files:**
- Create: `packages/config/eslint/rules/no-physical-direction.js`
- Create: `packages/config/eslint/rules/no-physical-direction.test.js`
- Create: `packages/config/eslint/index.js`
- Modify: `packages/config/package.json` (add devDeps + test script)

**Interfaces:**
- Consumes: nothing.
- Produces: ESLint flat-config preset exported as `@ayman/config/eslint`, containing the rule `ayman/no-physical-direction`. Later tasks extend it in `apps/web` and `apps/api`.

- [ ] **Step 1: Write the failing test**

Create `packages/config/eslint/rules/no-physical-direction.test.js`:

```js
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import rule from './no-physical-direction.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-physical-direction', () => {
  it('passes valid and rejects invalid', () => {
    ruleTester.run('no-physical-direction', rule, {
      valid: [
        { code: 'const a = <div className="ms-4 pe-2 text-start border-s" />;' },
        { code: 'const a = <div className="flex gap-4 rounded-md" />;' },
        // "left" inside an unrelated word must not trip the rule
        { code: 'const a = <div className="leftover-thing" />;' },
        // margin-left in a comment or plain string is out of scope
        { code: 'const s = "ml-4";' },
      ],
      invalid: [
        {
          code: 'const a = <div className="ml-4" />;',
          errors: [{ messageId: 'physical', data: { klass: 'ml-4', suggestion: 'ms-4' } }],
        },
        {
          code: 'const a = <div className="flex pr-2 text-right" />;',
          errors: [
            { messageId: 'physical', data: { klass: 'pr-2', suggestion: 'pe-2' } },
            { messageId: 'physical', data: { klass: 'text-right', suggestion: 'text-end' } },
          ],
        },
        {
          code: 'const a = <div className={"border-l-2"} />;',
          errors: [{ messageId: 'physical', data: { klass: 'border-l-2', suggestion: 'border-s-2' } }],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ayman/config test`
Expected: FAIL — `Cannot find module './no-physical-direction.js'`.

- [ ] **Step 3: Implement the rule**

Create `packages/config/eslint/rules/no-physical-direction.js`:

```js
/**
 * Bans physical-direction Tailwind utilities in favour of logical ones.
 * The platform is RTL-native: a physical `ml-4` is correct in LTR and wrong in RTL,
 * and the bug is invisible to anyone testing in English.
 */

/** Ordered longest-prefix-first so `border-l-` is matched before `b`. */
const PREFIX_MAP = [
  ['border-l-', 'border-s-'],
  ['border-r-', 'border-e-'],
  ['rounded-l-', 'rounded-s-'],
  ['rounded-r-', 'rounded-e-'],
  ['scroll-ml-', 'scroll-ms-'],
  ['scroll-mr-', 'scroll-me-'],
  ['scroll-pl-', 'scroll-ps-'],
  ['scroll-pr-', 'scroll-pe-'],
  ['ml-', 'ms-'],
  ['mr-', 'me-'],
  ['pl-', 'ps-'],
  ['pr-', 'pe-'],
  ['left-', 'start-'],
  ['right-', 'end-'],
  ['inset-l-', 'inset-s-'],
  ['inset-r-', 'inset-e-'],
];

/** Exact class names with no numeric suffix. */
const EXACT_MAP = new Map([
  ['text-left', 'text-start'],
  ['text-right', 'text-end'],
  ['float-left', 'float-start'],
  ['float-right', 'float-end'],
  ['clear-left', 'clear-start'],
  ['clear-right', 'clear-end'],
  ['border-l', 'border-s'],
  ['border-r', 'border-e'],
  ['rounded-l', 'rounded-s'],
  ['rounded-r', 'rounded-e'],
]);

/** Returns the logical replacement for a physical class, or null. */
function suggest(klass) {
  // Strip variant prefixes (`md:`, `hover:`, `dark:`) and a leading `!`.
  const lastColon = klass.lastIndexOf(':');
  const variants = lastColon === -1 ? '' : klass.slice(0, lastColon + 1);
  let base = lastColon === -1 ? klass : klass.slice(lastColon + 1);
  const bang = base.startsWith('!') ? '!' : '';
  if (bang) base = base.slice(1);

  const exact = EXACT_MAP.get(base);
  if (exact) return variants + bang + exact;

  for (const [from, to] of PREFIX_MAP) {
    if (base.startsWith(from) && base.length > from.length) {
      return variants + bang + to + base.slice(from.length);
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require logical direction utilities so RTL works natively.' },
    fixable: 'code',
    schema: [],
    messages: {
      physical:
        'Use the logical utility "{{suggestion}}" instead of the physical "{{klass}}". This app is RTL-native.',
    },
  },
  create(context) {
    /** Report every offending class inside one string literal node. */
    function checkLiteral(node, value) {
      let cursor = 0;
      for (const klass of value.split(/\s+/)) {
        if (!klass) continue;
        const index = value.indexOf(klass, cursor);
        cursor = index + klass.length;
        const suggestion = suggest(klass);
        if (!suggestion) continue;
        context.report({
          node,
          messageId: 'physical',
          data: { klass, suggestion },
          fix(fixer) {
            // +1 skips the opening quote of the literal.
            const start = node.range[0] + 1 + index;
            return fixer.replaceTextRange([start, start + klass.length], suggestion);
          },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className' && node.name.name !== 'class') return;
        const v = node.value;
        if (!v) return;
        if (v.type === 'Literal' && typeof v.value === 'string') {
          checkLiteral(v, v.value);
        } else if (
          v.type === 'JSXExpressionContainer' &&
          v.expression.type === 'Literal' &&
          typeof v.expression.value === 'string'
        ) {
          checkLiteral(v.expression, v.expression.value);
        }
      },
    };
  },
};
```

- [ ] **Step 4: Add the package test wiring**

Modify `packages/config/package.json` to:

```json
{
  "name": "@ayman/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "files": ["tsconfig.base.json", "eslint"],
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint": "./eslint/index.js"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "echo 'no lint for config package'",
    "typecheck": "echo 'no typecheck for config package'"
  },
  "devDependencies": {
    "eslint": "9.39.5",
    "vitest": "3.2.4"
  },
  "dependencies": {
    "typescript-eslint": "8.47.0",
    "eslint-plugin-react-hooks": "7.1.0",
    "@eslint/js": "9.39.5"
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @ayman/config test`
Expected: PASS — 1 test, all valid cases accepted and all 4 invalid cases reported with the right suggestions.

- [ ] **Step 6: Create the shared flat config**

Create `packages/config/eslint/index.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import noPhysicalDirection from './rules/no-physical-direction.js';

/** The plugin that carries our project-specific rules. */
const ayman = {
  rules: { 'no-physical-direction': noPhysicalDirection },
};

/** Rules every package gets. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { ayman },
    rules: {
      'ayman/no-physical-direction': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message:
            'Raw unsafe SQL is banned. Use parameterised $queryRaw or the Prisma query API.',
        },
      ],
    },
  },
];

/** Extra rules for React packages. */
export const react = [
  ...base,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];

export default base;
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(config): RTL-native lint rule banning physical direction utilities"
```

---

## Task 3: Design tokens

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`
- Create: `packages/ui/src/tokens/{color,typography,space,motion,index}.css`
- Create: `packages/ui/src/tokens/tokens.ts`
- Create: `packages/ui/src/tokens/tokens.test.ts`

**Interfaces:**
- Produces: `@ayman/ui/tokens.css` (the single CSS import that defines every custom property) and `@ayman/ui/tokens` exporting `typed` token objects `{ color, space, radius, type, motion }` for tests and JS consumers.

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/tokens/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, radius, space, type as typeScale } from './tokens.js';

const css = (name: string) =>
  readFileSync(join(import.meta.dirname, `${name}.css`), 'utf8');

describe('design tokens', () => {
  it('exposes the pixel-named spacing scale from the spec', () => {
    expect(space).toEqual([2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80]);
  });

  it('never allows a card radius above 8px', () => {
    const cardRadii = [radius.xs, radius.sm, radius.md, radius.lg];
    for (const r of cardRadii) expect(r).toBeLessThanOrEqual(8);
    expect(radius.full).toBe(999);
  });

  it('gives Arabic body text 0.15 more line-height than Latin', () => {
    expect(typeScale.textBase.lineHeightAr - typeScale.textBase.lineHeightEn).toBeCloseTo(0.15, 5);
  });

  it('makes exits faster than entrances', () => {
    expect(motion.duration.exit).toBeLessThan(motion.duration.modal);
    expect(motion.duration.exit).toBeLessThan(motion.duration.popover);
  });

  it('caps every duration at 400ms', () => {
    for (const d of Object.values(motion.duration)) expect(d).toBeLessThanOrEqual(400);
  });

  it('never uses ease-in for an exit', () => {
    // ease-in curves start with a slow first control point (x1 high, y1 ~0).
    // Our exit curve must be an ease-out shape: y1 must exceed x1.
    const [x1, y1] = motion.easing.outNumbers;
    expect(y1).toBeGreaterThan(x1);
  });

  it('kills shadows in dark mode', () => {
    const colorCss = css('color');
    const darkBlock = colorCss.slice(colorCss.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toMatch(/--shadow-sm:\s*0 0 0 transparent/);
    expect(darkBlock).toMatch(/--shadow-md:\s*0 0 0 transparent/);
    expect(darkBlock).toMatch(/--shadow-lg:\s*0 0 0 transparent/);
  });

  it('never lets Arabic receive letter-spacing', () => {
    expect(css('typography')).toMatch(
      /\[lang="ar"\][^{]*\{[^}]*letter-spacing:\s*0\s*!important/s,
    );
  });

  it('uses a near-black with a blue lean, never pure black', () => {
    const colorCss = css('color');
    expect(colorCss).toContain('#08090A');
    expect(colorCss).not.toMatch(/--n-1:\s*#000000/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ayman/ui test`
Expected: FAIL — package does not exist yet.

- [ ] **Step 3: Create `packages/ui/package.json`**

```json
{
  "name": "@ayman/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tokens": "./src/tokens/tokens.ts",
    "./tokens.css": "./src/tokens/index.css",
    "./components/*": "./src/components/*.tsx"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "clsx": "2.1.1",
    "tailwind-merge": "3.4.0"
  },
  "devDependencies": {
    "@ayman/config": "workspace:*",
    "@types/react": "19.2.7",
    "react": "19.2.8",
    "typescript": "catalog:",
    "vitest": "3.2.4"
  },
  "peerDependencies": { "react": ">=19" }
}
```

- [ ] **Step 4: Create `packages/ui/src/tokens/color.css`**

```css
/* Radix 12-step semantics in OKLCH. The step number IS the contract:
   1 app bg · 2 subtle bg · 3 UI bg · 4 hover · 5 active · 6 subtle border
   7 border+focus · 8 hover border · 9 solid · 10 solid hover · 11 low-contrast text
   12 high-contrast text. Identical names across themes → a theme swap is a class change. */

:root {
  color-scheme: light;

  /* neutral — blue-leaning */
  --n-1: #FCFCFD; --n-2: #F7F8F9; --n-3: #F1F2F4; --n-4: #E9EBEE;
  --n-5: #E1E4E8; --n-6: #E4E6EA; --n-7: #D6D9DE; --n-8: #B9BEC6;
  --n-9: #8B9099; --n-10: #7A7F88; --n-11: #60646C; --n-12: #14171A;

  /* accent — terminal amber. Green/red are reserved for quiz correctness,
     so neither can be the brand; indigo is the AI default and is disqualified. */
  --a-9:  oklch(0.770 0.152 72);
  --a-10: oklch(0.725 0.155 68);
  --a-11: oklch(0.520 0.120 62);
  --a-12: oklch(0.300 0.060 60);

  /* semantic — never brand, never decorative */
  --ok:   oklch(0.68 0.16 150);
  --err:  oklch(0.62 0.20 25);
  --warn: oklch(0.75 0.14 85);
  --info: oklch(0.62 0.14 245);

  /* borders are ALPHA, never solid: a solid #eaeaea looks wrong on any tinted bg */
  --border-subtle: #00000014;
  --border:        #0000001F;
  --border-strong: #00000033;
  --hairline: 1px;

  /* two-layer shadows, light mode only */
  --shadow-sm: 0 2px 5px 0 #00000012;
  --shadow-md: 0 7px 14px 0 #00000012, 0 3px 6px 0 #0000000f;
  --shadow-lg: 0 15px 35px 0 #00000014, 0 5px 15px 0 #00000012;

  --header-blur: 20px;
}

@media (min-resolution: 2dppx) {
  :root { --hairline: 0.5px; }
}

/* The dark palette lives in one place and is applied by both the media query
   (first paint, before JS) and the attribute (explicit user choice). */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --n-1: #08090A; --n-2: #0E1011; --n-3: #141618; --n-4: #1B1E20;
    --n-5: #212528; --n-6: #232629; --n-7: #2E3236; --n-8: #3B4045;
    --n-9: #6B7178; --n-10: #7C838B; --n-11: #A9AFB6; --n-12: #EDEFF1;
    --a-9:  oklch(0.780 0.150 74);
    --a-10: oklch(0.820 0.150 76);
    --a-11: oklch(0.845 0.130 78);
    --a-12: oklch(0.920 0.090 80);
    --border-subtle: #FFFFFF12;
    --border:        #FFFFFF1F;
    --border-strong: #FFFFFF33;
    --shadow-sm: 0 0 0 transparent;
    --shadow-md: 0 0 0 transparent;
    --shadow-lg: 0 0 0 transparent;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --n-1: #08090A; --n-2: #0E1011; --n-3: #141618; --n-4: #1B1E20;
  --n-5: #212528; --n-6: #232629; --n-7: #2E3236; --n-8: #3B4045;
  --n-9: #6B7178; --n-10: #7C838B; --n-11: #A9AFB6; --n-12: #EDEFF1;
  --a-9:  oklch(0.780 0.150 74);
  --a-10: oklch(0.820 0.150 76);
  --a-11: oklch(0.845 0.130 78);
  --a-12: oklch(0.920 0.090 80);
  --border-subtle: #FFFFFF12;
  --border:        #FFFFFF1F;
  --border-strong: #FFFFFF33;
  --shadow-sm: 0 0 0 transparent;
  --shadow-md: 0 0 0 transparent;
  --shadow-lg: 0 0 0 transparent;
}

::selection {
  background: color-mix(in oklch, var(--a-9), transparent 72%);
  color: var(--n-12);
}
```

- [ ] **Step 5: Create `packages/ui/src/tokens/typography.css`**

```css
/* Dual-track scale: display and text ramps are separate. Collapsing them into
   one geometric scale is a template tell. Base is 15px, not 16 — denser, more tool-like. */

:root {
  --font-sans: "Plex Ar", ui-sans-serif, system-ui, sans-serif;
  /* Arabic falls through to Plex Ar, never to a system mono that lacks the script */
  --font-mono: "Plex Mono", "Plex Ar", ui-monospace, "SF Mono", monospace;

  --fs-display-1: 3.5rem;    --lh-display-1: 1.15;
  --fs-display-2: 2.5rem;    --lh-display-2: 1.2;
  --fs-title-1: 2rem;        --lh-title-1: 1.3;
  --fs-title-2: 1.5rem;      --lh-title-2: 1.4;
  --fs-title-3: 1.25rem;     --lh-title-3: 1.45;
  --fs-title-4: 1.0625rem;   --lh-title-4: 1.5;
  --fs-text-lg: 1.0625rem;   --lh-text-lg: 1.75;
  --fs-text-base: 0.9375rem; --lh-text-base: 1.75;
  --fs-text-sm: 0.875rem;    --lh-text-sm: 1.65;
  --fs-text-xs: 0.8125rem;   --lh-text-xs: 1.55;
  --fs-mono-label: 0.75rem;  --lh-mono-label: 1.4;

  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  --tracking-tight: -0.022em;
  --tracking-label: 0.06em;
}

html { font-size: 15px; }

/* Rule 1 — Arabic is a connected script. Tracking breaks the joins.
   This is the single clearest tell of an Arabic site built by someone who
   does not read it, and it is enforced globally rather than by convention. */
[lang="ar"],
[lang="ar"] * {
  letter-spacing: 0 !important;
}

/* Tracking is re-enabled only where the run is genuinely Latin. */
.latin,
code, kbd, samp, pre,
.mono {
  letter-spacing: var(--tracking-tight) !important;
}

/* Rule 3 — Arabic has no case, so an Arabic label is never uppercased.
   Latin eyebrows get uppercase + positive tracking; Arabic gets weight instead. */
.eyebrow {
  font-family: var(--font-mono);
  font-size: var(--fs-mono-label);
  line-height: var(--lh-mono-label);
  font-weight: var(--fw-medium);
  color: var(--n-11);
}
.eyebrow:lang(en) { text-transform: uppercase; letter-spacing: var(--tracking-label) !important; }
.eyebrow:lang(ar) { text-transform: none; font-weight: var(--fw-semibold); }

/* Western digits everywhere, tabular wherever numbers align. */
table, .tabular, time, .score, .timer { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 6: Create `packages/ui/src/tokens/space.css`**

```css
/* Spacing named by pixel value (Stripe's convention — removes all ambiguity). */
:root {
  --s-2: 2px;  --s-4: 4px;   --s-8: 8px;   --s-12: 12px; --s-16: 16px;
  --s-20: 20px; --s-24: 24px; --s-32: 32px; --s-48: 48px; --s-64: 64px; --s-80: 80px;

  /* Radius is deliberately small. Sharp corners read as precision. */
  --r-xs: 3px;   /* badges, kbd */
  --r-sm: 4px;   /* inputs, buttons */
  --r-md: 6px;   /* default */
  --r-lg: 8px;   /* cards, modals, code blocks — the ceiling */
  --r-full: 999px; /* pills ONLY: status chips, avatars */

  /* Two max-widths, always. A single symmetric width for everything is a template tell. */
  --w-shell: 1152px;
  --w-prose: 640px;

  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --min-tap-size: 44px;
}
```

- [ ] **Step 7: Create `packages/ui/src/tokens/motion.css`**

```css
/* Curves from GitHub Primer (the most rigorously documented set).
   Durations measured from Linear / Vercel / Stripe. */
:root {
  --ease-linear: cubic-bezier(0, 0, 1, 1);            /* progress bars and loaders only */
  --ease:        cubic-bezier(0.25, 0.1, 0.25, 1);    /* hover, micro-interactions */
  --ease-out:    cubic-bezier(0.3, 0.8, 0.6, 1);      /* DEFAULT — anything entering or exiting */
  --ease-in-out: cubic-bezier(0.6, 0, 0.2, 1);        /* anything moving or morphing in place */
  --ease-pop:    cubic-bezier(0.175, 0.885, 0.32, 1.1); /* popovers — 1.1 is a slight overshoot */

  --d-hover: 160ms;
  --d-popover: 200ms;
  --d-modal: 300ms;
  --d-exit: 120ms;   /* exits are always faster than entrances */
}

/* Backstop for anything not routed through <MotionConfig reducedMotion="user">.
   Opacity fades are preserved deliberately — that is the correct vestibular-safe behaviour. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 8: Create `packages/ui/src/tokens/index.css`**

```css
@import "./color.css";
@import "./typography.css";
@import "./space.css";
@import "./motion.css";
```

- [ ] **Step 9: Create `packages/ui/src/tokens/tokens.ts`**

```ts
/** The same values as the CSS custom properties, typed, for tests and JS consumers. */

export const space = [2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 80] as const;

export const radius = { xs: 3, sm: 4, md: 6, lg: 8, full: 999 } as const;

export const width = { shell: 1152, prose: 640 } as const;

export const weight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** Arabic line-heights run 0.15 above their Latin counterparts. */
export const type = {
  display1: { size: '3.5rem', lineHeightAr: 1.15, lineHeightEn: 1.0, weight: weight.semibold },
  display2: { size: '2.5rem', lineHeightAr: 1.2, lineHeightEn: 1.05, weight: weight.semibold },
  title1: { size: '2rem', lineHeightAr: 1.3, lineHeightEn: 1.15, weight: weight.semibold },
  title2: { size: '1.5rem', lineHeightAr: 1.4, lineHeightEn: 1.25, weight: weight.semibold },
  title3: { size: '1.25rem', lineHeightAr: 1.45, lineHeightEn: 1.3, weight: weight.medium },
  title4: { size: '1.0625rem', lineHeightAr: 1.5, lineHeightEn: 1.35, weight: weight.medium },
  textLg: { size: '1.0625rem', lineHeightAr: 1.75, lineHeightEn: 1.6, weight: weight.regular },
  textBase: { size: '0.9375rem', lineHeightAr: 1.75, lineHeightEn: 1.6, weight: weight.regular },
  textSm: { size: '0.875rem', lineHeightAr: 1.65, lineHeightEn: 1.5, weight: weight.regular },
  textXs: { size: '0.8125rem', lineHeightAr: 1.55, lineHeightEn: 1.4, weight: weight.regular },
  monoLabel: { size: '0.75rem', lineHeightAr: 1.4, lineHeightEn: 1.4, weight: weight.medium },
} as const;

export const motion = {
  easing: {
    linear: 'cubic-bezier(0, 0, 1, 1)',
    base: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    out: 'cubic-bezier(0.3, 0.8, 0.6, 1)',
    inOut: 'cubic-bezier(0.6, 0, 0.2, 1)',
    pop: 'cubic-bezier(0.175, 0.885, 0.32, 1.1)',
    /** Control points of `out`, for assertions about curve shape. */
    outNumbers: [0.3, 0.8, 0.6, 1] as const,
  },
  duration: { hover: 160, popover: 200, modal: 300, exit: 120 },
} as const;

export const color = {
  /** Accent is amber because green and red are load-bearing for quiz correctness. */
  accentSolid: 'oklch(0.770 0.152 72)',
  ok: 'oklch(0.68 0.16 150)',
  err: 'oklch(0.62 0.20 25)',
  warn: 'oklch(0.75 0.14 85)',
  info: 'oklch(0.62 0.14 245)',
  darkBase: '#08090A',
} as const;
```

- [ ] **Step 10: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@ayman/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm install && pnpm --filter @ayman/ui test`
Expected: PASS — 8 tests.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(ui): design tokens — OKLCH color, dual-track type scale, motion curves"
```

---

## Task 4: Next.js app shell with Arabic RTL and fonts

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/eslint.config.js`
- Create: `apps/web/app/{layout.tsx,globals.css,page.tsx}`
- Create: `apps/web/lib/fonts.ts`
- Create: `packages/contracts/` (package.json, `src/copy/ar.ts`, `src/index.ts`)

**Interfaces:**
- Consumes: `@ayman/ui/tokens.css`, `@ayman/config/eslint`.
- Produces: `@ayman/contracts` exporting `copy` (the Arabic string table). `apps/web` runs on port 3200 and renders `<html lang="ar" dir="rtl">`.

- [ ] **Step 1: Create `packages/contracts`**

`packages/contracts/package.json`:
```json
{
  "name": "@ayman/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./copy": "./src/copy/ar.ts" },
  "scripts": { "lint": "eslint src", "typecheck": "tsc --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "zod": "catalog:" },
  "devDependencies": {
    "@ayman/config": "workspace:*",
    "typescript": "catalog:",
    "vitest": "3.2.4"
  }
}
```

`packages/contracts/tsconfig.json`:
```json
{
  "extends": "@ayman/config/tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src/**/*"]
}
```

`packages/contracts/src/copy/ar.ts` — **every** user-facing string in the product lives here:
```ts
/**
 * The single Arabic string table. No component may contain a user-facing literal.
 * This is what makes adding English later a routing change rather than a rewrite.
 */
export const copy = {
  site: {
    name: 'أيمن أبو العيلة',
    tagline: 'البرمجة وعلوم الحاسب — نظام البكالوريا المصرية',
    instructor: 'المهندس أيمن أبو العيلة',
  },
  nav: {
    home: 'الرئيسية',
    courses: 'الكورسات',
    about: 'عن المنصة',
    contact: 'تواصل معنا',
    login: 'تسجيل الدخول',
    register: 'حساب جديد',
    dashboard: 'حسابي',
  },
  theme: {
    toggle: 'تبديل المظهر',
    light: 'فاتح',
    dark: 'داكن',
    system: 'حسب النظام',
  },
  onboarding: {
    governorate: 'المحافظة',
    governoratePlaceholder: 'اختر محافظتك',
    system: 'النظام الدراسي',
    year: 'الصف الدراسي',
    track: 'المسار',
    electiveSubject: 'المادة الاختيارية',
  },
  common: {
    loading: 'جارٍ التحميل',
    error: 'حصل خطأ',
    retry: 'حاول تاني',
    empty: 'مفيش حاجة هنا لسه',
  },
} as const;

export type Copy = typeof copy;
```

`packages/contracts/src/index.ts`:
```ts
export { copy, type Copy } from './copy/ar.js';
```

- [ ] **Step 2: Scaffold the Next.js app**

Run:
```bash
cd apps
pnpm create next-app@latest web --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --turbopack --use-pnpm --skip-install
cd ..
```
If the interactive prompt appears for any option, accept the flags above.

- [ ] **Step 3: Replace `apps/web/package.json`**

```json
{
  "name": "@ayman/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack --port 3200",
    "build": "next build",
    "start": "next start --port 3200",
    "lint": "eslint app lib components",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@ayman/contracts": "workspace:*",
    "@ayman/ui": "workspace:*",
    "next": "16.2.11",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@ayman/config": "workspace:*",
    "@fontsource/ibm-plex-mono": "5.3.0",
    "@fontsource/ibm-plex-sans-arabic": "5.3.0",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "catalog:",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "eslint": "9.39.5",
    "tailwindcss": "4.3.3",
    "typescript": "catalog:",
    "vitest": "3.2.4"
  }
}
```

> Both Fontsource packages are verified to exist at `5.3.0`, and both ship the latin/arabic
> per-script woff2 files at weights 100-700 (verified against jsdelivr, 2026-07-25).

- [ ] **Step 4: Create `apps/web/lib/fonts.ts`**

```ts
import localFont from 'next/font/local';

/**
 * IBM Plex Sans Arabic + IBM Plex Mono, self-hosted from Fontsource.
 *
 * Fontsource ships these PRE-SUBSETTED PER SCRIPT (separate `-arabic-` and `-latin-`
 * files), which is stronger than hand-authored unicode-range: the browser genuinely
 * never downloads the Arabic file for a Latin-only run, and we maintain no ranges.
 *
 * These two faces are metrically identical (x-height 516, cap-height 698 at 1000upm),
 * so mixed runs like `استخدم const بدلاً من var` need no size-adjust correction.
 *
 * Static weights only — no variable build of Plex Sans Arabic exists anywhere.
 */
export const plexArabic = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
  preload: true,
});

export const plexMono = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
  preload: false,
});
```

> Before writing this file, run `ls apps/web/node_modules/@fontsource/ibm-plex-sans-arabic/files/ | head -30`
> and confirm the exact filenames. If a weight is absent, drop that entry rather than guessing.

- [ ] **Step 5: Create `apps/web/app/globals.css`**

```css
@import "tailwindcss";
@import "@ayman/ui/tokens.css";

/* Tailwind 4 is configured in CSS. Map our tokens into Tailwind's theme so
   utilities like `bg-surface-1` and `text-fg` resolve to the same variables
   the raw CSS uses — one source of truth, not two. */
@theme inline {
  --font-sans: var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), var(--font-plex-arabic), ui-monospace, monospace;

  --color-surface-1: var(--n-1);
  --color-surface-2: var(--n-2);
  --color-surface-3: var(--n-3);
  --color-surface-4: var(--n-4);
  --color-line-subtle: var(--border-subtle);
  --color-line: var(--border);
  --color-line-strong: var(--border-strong);
  --color-fg-muted: var(--n-11);
  --color-fg: var(--n-12);
  --color-accent: var(--a-9);
  --color-accent-hover: var(--a-10);
  --color-accent-text: var(--a-11);
  --color-ok: var(--ok);
  --color-err: var(--err);
  --color-warn: var(--warn);
  --color-info: var(--info);

  --radius-xs: var(--r-xs);
  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);

  --ease-out: var(--ease-out);
  --ease-pop: var(--ease-pop);
}

@layer base {
  * {
    border-color: var(--border);
  }

  html {
    /* Rule 2 — never `line-height: normal`. The two faces produce different
       line boxes, so every value is explicit and unitless. */
    line-height: var(--lh-text-base);
    -webkit-text-size-adjust: 100%;
  }

  body {
    background: var(--n-1);
    color: var(--n-12);
    font-family: var(--font-sans);
    font-size: var(--fs-text-base);
    line-height: var(--lh-text-base);
    font-weight: var(--fw-regular);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  :focus-visible {
    outline: var(--focus-ring-width) solid var(--a-9);
    outline-offset: var(--focus-ring-offset);
  }
  :focus:not(:focus-visible) { outline: none; }

  /* Inline code and code blocks are deliberately different objects. */
  :not(pre) > code {
    font-family: var(--font-mono);
    font-size: 0.875em;
    padding: 0.125em 0.375em;
    border: var(--hairline) solid var(--border);
    border-radius: 0.3em;
    background: var(--n-3);
  }
  pre {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    line-height: 1.5;
    tab-size: 4;
    padding: var(--s-16);
    border: var(--hairline) solid var(--border);
    border-radius: var(--r-lg);
    background: var(--n-2);
    overflow-x: auto;
  }
}

/* The dot-grid backdrop: two offset radial-gradient layers at ~2% alpha on a 24px
   grid, masked by a spotlight that follows the cursor via --mx / --my. 0kB of JS
   beyond a pointermove handler that writes two custom properties. */
.dot-grid {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--n-12), transparent 96%) 1px, transparent 0),
    radial-gradient(circle at 13px 13px, color-mix(in oklch, var(--n-12), transparent 98%) 1px, transparent 0);
  background-size: 24px 24px, 24px 24px;
  mask-image: radial-gradient(
    420px circle at var(--mx, 50%) var(--my, 30%),
    #000 0%,
    transparent 100%
  );
}
```

- [ ] **Step 6: Create `apps/web/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next';
import { copy } from '@ayman/contracts';
import { plexArabic, plexMono } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${copy.site.name} — ${copy.site.tagline}`, template: `%s | ${copy.site.name}` },
  description: copy.site.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FCFCFD' },
    { media: '(prefers-color-scheme: dark)', color: '#08090A' },
  ],
};

/**
 * Applies the saved theme before first paint. Without this, a user who chose
 * "dark" sees a white flash on every navigation-free load.
 * Kept as a raw string so it ships inline and runs synchronously.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="dot-grid" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Dynamic-by-default with explicit `use cache` opt-in. Retrofitting this later
  // is the expensive path, so it is on from day one.
  cacheComponents: true,

  transpilePackages: ['@ayman/ui', '@ayman/contracts'],

  /**
   * Single origin: the browser only ever sees `/api/...` on the web origin.
   * This is what makes __Host- cookies, SameSite=Strict, and zero CORS possible
   * simultaneously. Never call the API host directly from client code.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 8: Create `apps/web/eslint.config.js`**

```js
import { react } from '@ayman/config/eslint';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...react,
];
```

- [ ] **Step 9: Create a temporary `apps/web/app/page.tsx`**

```tsx
import { copy } from '@ayman/contracts';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--w-shell)] flex-col justify-center px-6">
      <p className="eyebrow mb-3">01 / المنصة</p>
      <h1 className="text-[length:var(--fs-display-2)] font-semibold leading-[var(--lh-display-2)]">
        {copy.site.name}
      </h1>
      <p className="mt-4 max-w-[var(--w-prose)] text-fg-muted">{copy.site.tagline}</p>
    </main>
  );
}
```

- [ ] **Step 10: Verify the shell renders**

Run:
```bash
pnpm install
pnpm --filter @ayman/web dev
```
Then in a second shell: `curl -s http://localhost:3200 | head -20`

Expected: HTML containing `<html lang="ar" dir="rtl"`. Open `http://localhost:3200` — the heading renders in IBM Plex Sans Arabic, right-aligned, on a near-black background if your OS is in dark mode. Stop the dev server.

- [ ] **Step 11: Verify lint catches a physical utility**

Temporarily change `className="mx-auto ..."` to `className="ml-4 mx-auto ..."` in `page.tsx`, then run:
```bash
pnpm --filter @ayman/web lint
```
Expected: FAIL with `Use the logical utility "ms-4" instead of the physical "ml-4". This app is RTL-native.`
Revert the change and re-run — expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(web): Arabic RTL app shell with Plex fonts, tokens, and single-origin API rewrite"
```

---

## Task 5: Theme toggle without FOUC

**Files:**
- Create: `apps/web/components/theme-toggle.tsx`
- Create: `apps/web/components/dot-grid-spotlight.tsx`
- Modify: `apps/web/app/layout.tsx` (mount the spotlight)
- Create: `apps/web/app/dev/tokens/page.tsx` (gallery — filled out in Task 6)

**Interfaces:**
- Consumes: `copy.theme` from `@ayman/contracts`.
- Produces: `<ThemeToggle />` — a client component that cycles light → dark → system and persists to `localStorage` under the key `theme`. `<DotGridSpotlight />` — writes `--mx` / `--my` on `document.documentElement`.

- [ ] **Step 1: Create `apps/web/components/theme-toggle.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { copy } from '@ayman/contracts';

type Theme = 'light' | 'dark' | 'system';

const ORDER: readonly Theme[] = ['system', 'light', 'dark'] as const;

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  // Read the persisted value after mount. The inline script in the layout has
  // already applied it to <html>, so there is no flash — this only syncs React.
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(next);
    apply(next);
    if (next === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', next);
  }

  const label =
    theme === 'light' ? copy.theme.light : theme === 'dark' ? copy.theme.dark : copy.theme.system;

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={copy.theme.toggle}
      className="mono inline-flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-[length:var(--fs-mono-label)] text-fg-muted transition-colors duration-[var(--d-hover)] ease-[var(--ease)] hover:bg-surface-3 hover:text-fg"
    >
      <span aria-hidden="true">◑</span>
      <span>{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/dot-grid-spotlight.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

/**
 * Writes the cursor position into two CSS custom properties that mask the
 * .dot-grid backdrop. Deliberately does NOT use React state: a setState per
 * pointermove would be a render + reconcile every frame, which is a documented
 * INP killer. Writing a custom property stays on the compositor.
 */
export function DotGridSpotlight() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;

    let frame = 0;
    function onMove(event: PointerEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const root = document.documentElement;
        root.style.setProperty('--mx', `${event.clientX}px`);
        root.style.setProperty('--my', `${event.clientY}px`);
      });
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
```

- [ ] **Step 3: Mount the spotlight in the layout**

In `apps/web/app/layout.tsx`, add the import and render it next to the backdrop:

```tsx
import { DotGridSpotlight } from '@/components/dot-grid-spotlight';
```

and inside `<body>`, replace the backdrop line with:

```tsx
        <div className="dot-grid" aria-hidden="true" />
        <DotGridSpotlight />
```

- [ ] **Step 4: Verify manually**

Run `pnpm --filter @ayman/web dev`, open `http://localhost:3200`, and confirm:
1. Moving the mouse moves the spotlight over the dot grid.
2. There is no white flash on reload when dark is selected.
3. `pnpm --filter @ayman/web lint` passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): theme toggle with no-FOUC inline script and cursor spotlight"
```

---

## Task 6: UI primitives and the token gallery

**Files:**
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/components/{button,card,badge,skeleton}.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `apps/web/app/dev/tokens/page.tsx`

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `<Button variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md">`
  - `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardBody>`
  - `<Badge tone="neutral" | "ok" | "err" | "warn" | "accent">`
  - `<Skeleton width="full" | "wide" | "narrow">`

- [ ] **Step 1: Create `packages/ui/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `packages/ui/src/components/button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  // Accent is used FLAT — never as a gradient. That distinction is the whole
  // difference between "Linear's indigo" and "the AI purple gradient".
  primary: 'bg-accent text-[#1A1206] hover:bg-accent-hover',
  secondary: 'bg-surface-3 text-fg border border-line hover:bg-surface-4',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
  danger: 'bg-transparent text-[color:var(--err)] border border-[color:var(--err)] hover:bg-[color-mix(in_oklch,var(--err),transparent_88%)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[length:var(--fs-text-sm)]',
  md: 'h-10 px-4 text-[length:var(--fs-text-base)]',
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-sm font-medium',
        'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Create `packages/ui/src/components/card.tsx`**

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

/** Radius is capped at --r-lg (8px). Depth comes from the surface ladder and a
 *  hairline border — shadows resolve to transparent in dark mode by design. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-line bg-surface-2 shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-line-subtle px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'text-[length:var(--fs-title-4)] font-medium leading-[var(--lh-title-4)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
```

- [ ] **Step 4: Create `packages/ui/src/components/badge.tsx`**

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

type Tone = 'neutral' | 'ok' | 'err' | 'warn' | 'accent';

const TONES: Record<Tone, string> = {
  neutral: 'text-fg-muted border-line bg-surface-3',
  ok: 'text-[color:var(--ok)] border-[color-mix(in_oklch,var(--ok),transparent_70%)] bg-[color-mix(in_oklch,var(--ok),transparent_92%)]',
  err: 'text-[color:var(--err)] border-[color-mix(in_oklch,var(--err),transparent_70%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)]',
  warn: 'text-[color:var(--warn)] border-[color-mix(in_oklch,var(--warn),transparent_70%)] bg-[color-mix(in_oklch,var(--warn),transparent_92%)]',
  accent: 'text-accent-text border-[color-mix(in_oklch,var(--a-9),transparent_70%)] bg-[color-mix(in_oklch,var(--a-9),transparent_92%)]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** --r-full is used here deliberately: pills are for status chips and avatars only. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'mono inline-flex items-center rounded-full border px-2 py-0.5',
        'text-[length:var(--fs-mono-label)] font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 5: Create `packages/ui/src/components/skeleton.tsx`**

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

type Width = 'full' | 'wide' | 'narrow';

/** Varying bar widths is the single biggest difference between a skeleton that
 *  reads as designed and one that reads as cheap. */
const WIDTHS: Record<Width, string> = {
  full: 'w-full',
  wide: 'w-[85%]',
  narrow: 'w-[60%]',
};

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
}

export function Skeleton({ width = 'full', className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative h-4 overflow-hidden rounded-sm bg-[color-mix(in_oklch,var(--n-12),transparent_95%)]',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.8s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-[color-mix(in_oklch,var(--n-12),transparent_92%)] after:to-transparent',
        WIDTHS[width],
        className,
      )}
      {...props}
    />
  );
}
```

Append the keyframes to `apps/web/app/globals.css`:

```css
/* Shimmer uses translateX, never background-position: background-position
   repaints the whole element every frame. The 180ms delay means a fast load
   never flashes a skeleton at all. */
@keyframes shimmer {
  100% { transform: translateX(100%); }
}
.animate-\[shimmer_1\.8s_infinite\] { animation-delay: 180ms; }
```

- [ ] **Step 6: Create `packages/ui/src/index.ts`**

```ts
export { cn } from './lib/cn.js';
export { Button, type ButtonProps } from './components/button.js';
export { Card, CardHeader, CardTitle, CardBody } from './components/card.js';
export { Badge, type BadgeProps } from './components/badge.js';
export { Skeleton, type SkeletonProps } from './components/skeleton.js';
export * as tokens from './tokens/tokens.js';
```

- [ ] **Step 7: Create the gallery at `apps/web/app/dev/tokens/page.tsx`**

```tsx
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Skeleton } from '@ayman/ui';
import { ThemeToggle } from '@/components/theme-toggle';

const NEUTRALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const TYPE_ROWS = [
  ['display-1', 'var(--fs-display-1)', 'var(--lh-display-1)', 600],
  ['display-2', 'var(--fs-display-2)', 'var(--lh-display-2)', 600],
  ['title-1', 'var(--fs-title-1)', 'var(--lh-title-1)', 600],
  ['title-2', 'var(--fs-title-2)', 'var(--lh-title-2)', 600],
  ['title-3', 'var(--fs-title-3)', 'var(--lh-title-3)', 500],
  ['text-base', 'var(--fs-text-base)', 'var(--lh-text-base)', 400],
  ['text-sm', 'var(--fs-text-sm)', 'var(--lh-text-sm)', 400],
] as const;

export default function TokenGalleryPage() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-2">00 / نظام التصميم</p>
          <h1 className="text-[length:var(--fs-title-1)] font-semibold">معرض الـ tokens</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="mb-12">
        <p className="eyebrow mb-4">01 / الألوان</p>
        <div className="grid grid-cols-12 overflow-hidden rounded-lg border border-line">
          {NEUTRALS.map((step) => (
            <div
              key={step}
              className="flex h-16 items-end justify-center pb-1 text-[10px]"
              style={{ background: `var(--n-${step})`, color: step > 8 ? 'var(--n-1)' : 'var(--n-12)' }}
            >
              {step}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Badge tone="accent">accent</Badge>
          <Badge tone="ok">إجابة صحيحة</Badge>
          <Badge tone="err">إجابة خاطئة</Badge>
          <Badge tone="warn">الوقت شارف على الانتهاء</Badge>
          <Badge>محايد</Badge>
        </div>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">02 / الخطوط</p>
        <Card>
          <CardBody className="space-y-4">
            {TYPE_ROWS.map(([name, size, lh, weight]) => (
              <div key={name} className="flex items-baseline gap-6">
                <code className="shrink-0 text-[length:var(--fs-mono-label)]">{name}</code>
                <span style={{ fontSize: size, lineHeight: lh, fontWeight: weight }}>
                  البرمجة وعلوم الحاسب — الصف الثاني الثانوي
                </span>
              </div>
            ))}
            <div className="border-t border-line-subtle pt-4">
              <span className="text-[length:var(--fs-text-base)]">
                خط عربي ولاتيني في سطر واحد: استخدم <code>const</code> بدلاً من <code>var</code> — 0123456789
              </span>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">03 / الأزرار</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">ابدأ الكورس</Button>
          <Button variant="secondary">التفاصيل</Button>
          <Button variant="ghost">إلغاء</Button>
          <Button variant="danger">حذف</Button>
          <Button variant="primary" size="sm">صغير</Button>
          <Button variant="primary" disabled>معطّل</Button>
        </div>
      </section>

      <section className="mb-12">
        <p className="eyebrow mb-4">04 / الكروت والتحميل</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>مقدمة في البرمجة</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-fg-muted">
              <p>الوحدة الأولى — المتغيرات والأنواع.</p>
              <p className="mono text-[length:var(--fs-mono-label)]">12 درس · 3 س 40 د</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>حالة التحميل</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Skeleton width="full" />
              <Skeleton width="wide" />
              <Skeleton width="narrow" />
            </CardBody>
          </Card>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Verify the gallery in both themes**

Run `pnpm --filter @ayman/web dev` and open `http://localhost:3200/dev/tokens`.

Check each of these explicitly:
1. Toggling the theme swaps every surface with no remapping and no flash.
2. In dark mode, cards have **no** shadow — only a hairline border.
3. Arabic text has no visible letter-spacing; the Latin `const` / `var` inline code does.
4. Skeleton bars are three different widths and the shimmer sweeps right-to-left.
5. `pnpm --filter @ayman/web lint && pnpm --filter @ayman/ui typecheck` both pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): Button/Card/Badge/Skeleton primitives and the token gallery"
```

---

## Task 7: NestJS skeleton with Zod-validated config

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/eslint.config.js`, `apps/api/.swcrc`
- Create: `apps/api/src/{main.ts,app.module.ts}`
- Create: `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`
- Create: `apps/api/src/health/health.controller.ts`

**Interfaces:**
- Produces: `loadEnv(source: NodeJS.ProcessEnv): Env` where
  `Env = { NODE_ENV: 'development'|'test'|'production'; API_PORT: number; APP_URL: string; DATABASE_URL: string; DIRECT_DATABASE_URL: string; REDIS_URL: string }`.
  Throws with a readable message listing every invalid key. NestJS serves `GET /api/health`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/config/env.spec.ts`:

```ts
import { loadEnv } from './env';

const VALID = {
  NODE_ENV: 'development',
  API_PORT: '3300',
  APP_URL: 'http://localhost:3200',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  DIRECT_DATABASE_URL: 'postgresql://o:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('parses a valid environment and coerces the port to a number', () => {
    const env = loadEnv(VALID);
    expect(env.API_PORT).toBe(3300);
    expect(env.NODE_ENV).toBe('development');
  });

  it('crashes when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = VALID;
    expect(() => loadEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('crashes when DATABASE_URL is not a postgres URL', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('reports every invalid key at once rather than the first', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'nope', REDIS_URL: 'nope' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|REDIS_URL[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadEnv({ ...VALID, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
```

- [ ] **Step 2: Scaffold the Nest app and run the test to see it fail**

Run:
```bash
cd apps
pnpm dlx @nestjs/cli@11.0.24 new api --package-manager pnpm --skip-git --skip-install --language TS
cd ..
```

Then replace `apps/api/package.json`:

```json
{
  "name": "@ayman/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch -b swc",
    "build": "nest build -b swc",
    "start": "node dist/main",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@ayman/contracts": "workspace:*",
    "@nestjs/common": "11.1.28",
    "@nestjs/core": "11.1.28",
    "@nestjs/platform-express": "11.1.28",
    "@nestjs/swagger": "11.4.6",
    "@nestjs/throttler": "6.5.0",
    "@prisma/adapter-pg": "7.9.0",
    "@prisma/client": "7.9.0",
    "dotenv": "17.2.3",
    "nestjs-pino": "4.6.1",
    "nestjs-zod": "5.5.0",
    "pino": "10.3.1",
    "pino-http": "11.0.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@ayman/config": "workspace:*",
    "@nestjs/cli": "11.0.24",
    "@nestjs/testing": "11.1.28",
    "@swc/core": "1.13.5",
    "@swc/jest": "0.2.39",
    "@types/jest": "30.0.0",
    "@types/node": "catalog:",
    "@types/supertest": "6.0.3",
    "eslint": "9.39.5",
    "jest": "30.2.0",
    "pino-pretty": "13.1.2",
    "prisma": "7.9.0",
    "supertest": "7.1.4",
    "tsx": "4.20.6",
    "typescript": "catalog:"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": ["@swc/jest"] },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

Run: `pnpm install && pnpm --filter @ayman/api test`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 3: Implement `apps/api/src/config/env.ts`**

```ts
import { z } from 'zod';

/**
 * Environment contract. Validated once at boot so a missing signing key crashes
 * the process rather than silently becoming `undefined` at the point of use.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3300),
  APP_URL: z.url(),
  DATABASE_URL: z.string().refine((v) => /^postgres(ql)?:\/\//.test(v), {
    message: 'must be a postgresql:// connection string',
  }),
  DIRECT_DATABASE_URL: z.string().refine((v) => /^postgres(ql)?:\/\//.test(v), {
    message: 'must be a postgresql:// connection string',
  }),
  REDIS_URL: z.string().refine((v) => /^rediss?:\/\//.test(v), {
    message: 'must be a redis:// connection string',
  }),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;

  // Report every failure at once. Fixing env vars one restart at a time is misery.
  const lines = result.error.issues.map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ayman/api test`
Expected: PASS — 5 tests.

- [ ] **Step 5: Create the health controller**

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'ayman-api' };
  }
}
```

- [ ] **Step 6: Wire `app.module.ts` and `main.ts`**

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
```

`apps/api/src/main.ts`:
```ts
// Prisma 7 no longer auto-loads .env, and neither does Nest. Load it first,
// before anything reads process.env.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Validate before the app is constructed so a bad config fails fast and loudly.
  const env = loadEnv(process.env);

  const app = await NestFactory.create(AppModule, {
    // Better Auth needs the raw body on its routes; disabling the global parser
    // now avoids a breaking change when auth lands in Plan 2.
    bodyParser: false,
  });

  // The web app proxies /api/* here, so every route is namespaced under /api
  // and the browser only ever sees one origin. No CORS is configured anywhere.
  app.setGlobalPrefix('api');

  await app.listen(env.API_PORT);
}

void bootstrap();
```

- [ ] **Step 7: Create `apps/api/eslint.config.js` and verify the server boots**

`apps/api/eslint.config.js`:
```js
import { base } from '@ayman/config/eslint';

export default [{ ignores: ['dist/**', 'node_modules/**', 'src/generated/**'] }, ...base];
```

Copy the env file and run:
```bash
cp .env.example apps/api/.env
pnpm --filter @ayman/api dev
```
In a second shell: `curl -s http://localhost:3300/api/health`
Expected: `{"status":"ok","service":"ayman-api"}`

Then verify config validation actually fails closed:
```bash
cd apps/api && APP_URL="not-a-url" node -e "require('dotenv/config'); const {loadEnv}=require('./dist/config/env'); loadEnv({...process.env, APP_URL:'not-a-url'})" 2>&1 | head -5
```
Expected: an error naming `APP_URL`. (Run `pnpm --filter @ayman/api build` first if `dist` is absent.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): NestJS skeleton with fail-fast Zod env validation and health endpoint"
```

---

## Task 8: Postgres roles and Prisma 7 wiring

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma.config.ts`
- Create: `apps/api/src/prisma/{prisma.service.ts,prisma.module.ts}`
- Create: `scripts/db-bootstrap.sql`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`

**Interfaces:**
- Produces: `PrismaService extends PrismaClient` with `onModuleInit`/`onModuleDestroy`, exported from `PrismaModule`. `GET /api/health` gains a `database: 'up' | 'down'` field.

- [ ] **Step 1: Create `scripts/db-bootstrap.sql`**

```sql
-- Three roles, least privilege. The running server can never execute DDL,
-- so a SQL-injection foothold cannot CREATE FUNCTION or DROP a table.
--   app_owner    → migrations only (CI / `prisma migrate`)
--   app_runtime  → what NestJS connects as: DML only
--   app_readonly → analytics
--
-- Run once as a superuser:
--   psql -d postgres -f scripts/db-bootstrap.sql

CREATE DATABASE ayman_platform_dev;

\connect ayman_platform_dev

CREATE SCHEMA IF NOT EXISTS app;

-- Nothing lives in `public`, and PUBLIC gets no rights anywhere.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_owner') THEN
    CREATE ROLE ayman_owner LOGIN PASSWORD 'dev_owner_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_runtime') THEN
    CREATE ROLE ayman_runtime LOGIN PASSWORD 'dev_runtime_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ayman_readonly') THEN
    CREATE ROLE ayman_readonly LOGIN PASSWORD 'dev_readonly_password';
  END IF;
END $$;

ALTER SCHEMA app OWNER TO ayman_owner;
GRANT USAGE ON SCHEMA app TO ayman_runtime, ayman_readonly;

-- DML only for the runtime role — note the absence of any DDL grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO ayman_readonly;

-- Tables created later by migrations inherit these grants automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO ayman_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ayman_owner IN SCHEMA app
  GRANT SELECT ON TABLES TO ayman_readonly;

-- Bound runaway queries and abandoned transactions on the runtime role only.
ALTER ROLE ayman_runtime SET statement_timeout = '15s';
ALTER ROLE ayman_runtime SET idle_in_transaction_session_timeout = '30s';
```

- [ ] **Step 2: Run the bootstrap and update `.env`**

```bash
psql -d postgres -f scripts/db-bootstrap.sql
```
Then edit `apps/api/.env` so the passwords match:
```bash
DATABASE_URL="postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev?schema=app"
DIRECT_DATABASE_URL="postgresql://ayman_owner:dev_owner_password@localhost:5432/ayman_platform_dev?schema=app"
```

Verify least privilege actually holds:
```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "CREATE TABLE app.should_fail (id int);"
```
Expected: `ERROR: permission denied for schema app`. **If this succeeds, stop and fix the grants** — the whole P6 control depends on it.

- [ ] **Step 3: Create `apps/api/prisma/schema.prisma`**

```prisma
// Prisma 7: the `prisma-client` generator (not `prisma-client-js`) emits ESM by
// default, which breaks a CommonJS Nest build — hence moduleFormat = "cjs".
// The output MUST live inside src/ or Nest's compiler will not pick it up.
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
  schemas   = ["app"]
}
```

- [ ] **Step 4: Create `apps/api/prisma.config.ts`**

```ts
// Prisma 7 moved configuration out of package.json#prisma into this file, and
// stopped auto-loading .env — both are handled here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
```

- [ ] **Step 5: Create `apps/api/src/prisma/prisma.service.ts`**

```ts
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe for the health endpoint. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 6: Extend the health check**

Replace `apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok' | 'degraded'; service: string; database: 'up' | 'down' }> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'degraded',
      service: 'ayman-api',
      database: dbUp ? 'up' : 'down',
    };
  }
}
```

Update `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 7: Generate the client and verify**

Add `apps/api/src/generated/` to `.gitignore`, then run:
```bash
pnpm --filter @ayman/api exec prisma generate
pnpm --filter @ayman/api dev
```
In a second shell: `curl -s http://localhost:3300/api/health`
Expected: `{"status":"ok","service":"ayman-api","database":"up"}`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): Prisma 7 with least-privilege Postgres roles and a DB health probe"
```

---

## Task 9: Taxonomy schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `Governorate`, `EducationSystem`, `AcademicYear`, `Track`, `TrackFaculty`, `Subject`, `ElectiveGroup`, `SubjectOffering`. Later tasks and plans reference these exact model names.

- [ ] **Step 1: Append the models to `apps/api/prisma/schema.prisma`**

```prisma
enum Region {
  urban
  lower
  upper
  frontier

  @@schema("app")
}

enum SubjectLevel {
  normal
  advanced

  @@schema("app")
}

/// The 27 Egyptian governorates, keyed by their official national-ID code.
model Governorate {
  code      String  @id @db.Char(2)
  nameAr    String  @map("name_ar")
  slug      String  @unique
  region    Region
  sortOrder Int     @map("sort_order")
  isActive  Boolean @default(true) @map("is_active")

  @@map("governorates")
  @@schema("app")
}

/// البكالوريا (600 marks, 70% pass) and الثانوية العامة (320 marks, 50% pass)
/// run in PARALLEL — one is not a replacement for the other.
model EducationSystem {
  id            String  @id @default(uuid(7))
  slug          String  @unique
  nameAr        String  @map("name_ar")
  totalMarks    Int     @map("total_marks")
  passPercent   Decimal @map("pass_percent") @db.Decimal(5, 2)
  allowsRetakes Boolean @default(false) @map("allows_retakes")
  sortOrder     Int     @map("sort_order")

  years      AcademicYear[]
  tracks     Track[]
  offerings  SubjectOffering[]

  @@map("education_systems")
  @@schema("app")
}

/// The Ministry uses الصف الأول/الثاني/الثالث الثانوي for BOTH systems.
/// `badgeAr` carries the system-specific framing (مرحلة تمهيدية / سنة شهادة).
model AcademicYear {
  id        String @id @default(uuid(7))
  systemId  String @map("system_id")
  year      Int
  labelAr   String @map("label_ar")
  badgeAr   String @map("badge_ar")
  sortOrder Int    @map("sort_order")

  system EducationSystem @relation(fields: [systemId], references: [id], onDelete: Cascade)

  @@unique([systemId, year])
  @@map("academic_years")
  @@schema("app")
}

/// 4 مسارات for البكالوريا, 3 شعب for الثانوية العامة. Both are chosen at the
/// start of year 2 — `minYear` encodes that, and year 1 has no track at all.
model Track {
  id        String   @id @default(uuid(7))
  systemId  String   @map("system_id")
  slug      String
  labelAr   String   @map("label_ar")
  aliases   String[] @default([])
  minYear   Int      @default(2) @map("min_year")
  sortOrder Int      @map("sort_order")

  system    EducationSystem   @relation(fields: [systemId], references: [id], onDelete: Cascade)
  faculties TrackFaculty[]
  offerings SubjectOffering[]
  electives ElectiveGroup[]

  @@unique([systemId, slug])
  @@map("tracks")
  @@schema("app")
}

/// Powers the reverse funnel: "اختار كليتك، نقولك مسارك".
model TrackFaculty {
  id        String @id @default(uuid(7))
  trackId   String @map("track_id")
  nameAr    String @map("name_ar")
  sortOrder Int    @map("sort_order")

  track Track @relation(fields: [trackId], references: [id], onDelete: Cascade)

  @@map("track_faculties")
  @@schema("app")
}

/// Canonical subject names only. A subject carries NO grading semantics —
/// الرياضيات appears in three different roles, so anything role-specific
/// (marks, level, whether it counts) belongs on SubjectOffering.
model Subject {
  id      String   @id @default(uuid(7))
  slug    String   @unique
  nameAr  String   @map("name_ar")
  aliases String[] @default([])

  offerings SubjectOffering[]

  @@map("subjects")
  @@schema("app")
}

/// "Choose exactly 1 of these 2" for a given track and year.
model ElectiveGroup {
  id        String @id @default(uuid(7))
  trackId   String @map("track_id")
  year      Int
  labelAr   String @map("label_ar")
  pickCount Int    @default(1) @map("pick_count")

  track     Track             @relation(fields: [trackId], references: [id], onDelete: Cascade)
  offerings SubjectOffering[]

  @@unique([trackId, year, labelAr])
  @@map("elective_groups")
  @@schema("app")
}

/// The load-bearing table. A subject is only meaningful scoped by
/// (system, year, track) — a global `isCounted` flag on Subject would be wrong.
model SubjectOffering {
  id                  String        @id @default(uuid(7))
  systemId            String        @map("system_id")
  year                Int
  trackId             String?       @map("track_id")
  subjectId           String        @map("subject_id")
  countsTowardTotal   Boolean       @default(true) @map("counts_toward_total")
  level               SubjectLevel?
  electiveGroupId     String?       @map("elective_group_id")
  marks               Int           @default(100)
  passPercentOverride Decimal?      @map("pass_percent_override") @db.Decimal(5, 2)
  sortOrder           Int           @default(0) @map("sort_order")

  system        EducationSystem @relation(fields: [systemId], references: [id], onDelete: Cascade)
  subject       Subject         @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  track         Track?          @relation(fields: [trackId], references: [id], onDelete: Cascade)
  electiveGroup ElectiveGroup?  @relation(fields: [electiveGroupId], references: [id], onDelete: SetNull)

  // ⚠️ trackId is NULLABLE, and Postgres treats NULLs as DISTINCT in a unique
  // index. This constraint therefore does NOT prevent duplicate year-1 rows
  // (where trackId IS NULL). Step 3 adds a partial unique index to cover that
  // case, and the seed uses findFirst+create rather than upsert for those rows.
  @@unique([systemId, year, trackId, subjectId])
  @@index([systemId, year])
  @@map("subject_offerings")
  @@schema("app")
}
```

- [ ] **Step 2: Run the migration**

Multi-schema (`@@schema`) is GA in Prisma 7 — no `previewFeatures` entry is needed.

```bash
pnpm --filter @ayman/api exec prisma migrate dev --name taxonomy
pnpm --filter @ayman/api exec prisma generate
```
Expected: a migration is created under `apps/api/prisma/migrations/` and applies cleanly.

> `prisma migrate` runs as `DIRECT_DATABASE_URL` (the owner role). If it fails with a permission
> error, the bootstrap SQL in Task 8 did not run — do not work around it by granting DDL to
> `ayman_runtime`.

- [ ] **Step 3: Add the partial unique index for null-track offerings**

Prisma cannot express a partial (`WHERE`) unique index, so it goes in a hand-written migration.
Without it, nothing at the database level stops two identical year-1 offerings from existing.

```bash
pnpm --filter @ayman/api exec prisma migrate dev --create-only --name subject_offering_null_track_unique
```

Then paste this into the generated migration's `migration.sql` and apply it:

```sql
-- Postgres treats NULLs as distinct, so the composite unique constraint on
-- (system_id, year, track_id, subject_id) does not constrain rows where
-- track_id IS NULL — i.e. every year-1 offering. This partial index does.
CREATE UNIQUE INDEX "subject_offerings_system_year_subject_null_track_key"
  ON "app"."subject_offerings" ("system_id", "year", "subject_id")
  WHERE "track_id" IS NULL;
```

```bash
pnpm --filter @ayman/api exec prisma migrate dev
```

Verify the index actually bites:
```bash
psql "$DIRECT_DATABASE_URL" -c "
  INSERT INTO app.subject_offerings (id, system_id, year, subject_id, counts_toward_total, marks, sort_order)
  SELECT gen_random_uuid(), system_id, year, subject_id, counts_toward_total, marks, sort_order
  FROM app.subject_offerings WHERE track_id IS NULL LIMIT 1;"
```
Expected: `ERROR: duplicate key value violates unique constraint`.
(This will only work after Task 10 has seeded rows — if the table is empty, run it again after seeding.)

- [ ] **Step 4: Verify the tables exist and runtime cannot alter them**

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "\dt app.*"
```
Expected: 8 tables listed.

```bash
psql "postgresql://ayman_runtime:dev_runtime_password@localhost:5432/ayman_platform_dev" \
  -c "DROP TABLE app.subjects;"
```
Expected: `ERROR: must be owner of table subjects`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): البكالوريا taxonomy schema — systems, years, tracks, subject offerings"
```

---

## Task 10: Taxonomy seed

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/seed-data/governorates.ts`
- Create: `apps/api/src/modules/taxonomy/taxonomy.service.spec.ts` (seed assertions)

**Interfaces:**
- Produces: an idempotent seed. Running it twice leaves the same row counts. Exports `GOVERNORATES: readonly { code, nameAr, slug, region, sortOrder }[]` with exactly 27 entries.

- [ ] **Step 1: Create `apps/api/prisma/seed-data/governorates.ts`**

```ts
/**
 * The 27 Egyptian governorates in official national-ID code order — the order
 * government forms use. Codes are gap-numbered and encode region.
 * DO NOT sort alphabetically. Code 88 (خارج الجمهورية) is a national-ID code,
 * not a governorate, and is deliberately absent.
 */
export const GOVERNORATES = [
  { code: '01', nameAr: 'القاهرة', slug: 'cairo', region: 'urban' },
  { code: '02', nameAr: 'الإسكندرية', slug: 'alexandria', region: 'urban' },
  { code: '03', nameAr: 'بورسعيد', slug: 'port_said', region: 'urban' },
  { code: '04', nameAr: 'السويس', slug: 'suez', region: 'urban' },
  { code: '11', nameAr: 'دمياط', slug: 'damietta', region: 'lower' },
  { code: '12', nameAr: 'الدقهلية', slug: 'dakahlia', region: 'lower' },
  { code: '13', nameAr: 'الشرقية', slug: 'sharqia', region: 'lower' },
  { code: '14', nameAr: 'القليوبية', slug: 'qalyubia', region: 'lower' },
  { code: '15', nameAr: 'كفر الشيخ', slug: 'kafr_el_sheikh', region: 'lower' },
  { code: '16', nameAr: 'الغربية', slug: 'gharbia', region: 'lower' },
  { code: '17', nameAr: 'المنوفية', slug: 'monufia', region: 'lower' },
  { code: '18', nameAr: 'البحيرة', slug: 'beheira', region: 'lower' },
  { code: '19', nameAr: 'الإسماعيلية', slug: 'ismailia', region: 'lower' },
  { code: '21', nameAr: 'الجيزة', slug: 'giza', region: 'upper' },
  { code: '22', nameAr: 'بني سويف', slug: 'beni_suef', region: 'upper' },
  { code: '23', nameAr: 'الفيوم', slug: 'faiyum', region: 'upper' },
  { code: '24', nameAr: 'المنيا', slug: 'minya', region: 'upper' },
  { code: '25', nameAr: 'أسيوط', slug: 'asyut', region: 'upper' },
  { code: '26', nameAr: 'سوهاج', slug: 'sohag', region: 'upper' },
  { code: '27', nameAr: 'قنا', slug: 'qena', region: 'upper' },
  { code: '28', nameAr: 'أسوان', slug: 'aswan', region: 'upper' },
  { code: '29', nameAr: 'الأقصر', slug: 'luxor', region: 'upper' },
  { code: '31', nameAr: 'البحر الأحمر', slug: 'red_sea', region: 'frontier' },
  { code: '32', nameAr: 'الوادي الجديد', slug: 'new_valley', region: 'frontier' },
  { code: '33', nameAr: 'مطروح', slug: 'matrouh', region: 'frontier' },
  { code: '34', nameAr: 'شمال سيناء', slug: 'north_sinai', region: 'frontier' },
  { code: '35', nameAr: 'جنوب سيناء', slug: 'south_sinai', region: 'frontier' },
] as const;

/** Pinned to the top of the dropdown for UX; the rest render in code order. */
export const PINNED_GOVERNORATE_CODES = ['01', '21', '02'] as const;
```

- [ ] **Step 2: Create `apps/api/prisma/seed.ts`**

```ts
import 'dotenv/config';
import { PrismaClient, type Region } from '../src/generated/prisma/client';
import { GOVERNORATES } from './seed-data/governorates';

const prisma = new PrismaClient();

/** Subjects are canonical names only — no grading semantics live here. */
const SUBJECTS = [
  { slug: 'arabic', nameAr: 'اللغة العربية' },
  { slug: 'first_foreign_language', nameAr: 'اللغة الأجنبية الأولى' },
  { slug: 'second_foreign_language', nameAr: 'اللغة الأجنبية الثانية' },
  { slug: 'egyptian_history', nameAr: 'التاريخ المصري' },
  { slug: 'mathematics', nameAr: 'الرياضيات' },
  { slug: 'integrated_science', nameAr: 'العلوم المتكاملة' },
  { slug: 'philosophy_logic', nameAr: 'الفلسفة والمنطق' },
  { slug: 'religious_education', nameAr: 'التربية الدينية' },
  { slug: 'programming_cs', nameAr: 'البرمجة وعلوم الحاسب' },
  { slug: 'physics', nameAr: 'الفيزياء' },
  { slug: 'chemistry', nameAr: 'الكيمياء' },
  { slug: 'biology', nameAr: 'الأحياء' },
  { slug: 'accounting', nameAr: 'المحاسبة' },
  { slug: 'business_administration', nameAr: 'إدارة الأعمال' },
  { slug: 'psychology', nameAr: 'علم النفس' },
  { slug: 'economics', nameAr: 'الاقتصاد' },
  { slug: 'geography', nameAr: 'الجغرافيا' },
  { slug: 'statistics', nameAr: 'الإحصاء' },
] as const;

const BACALORYA_TRACKS = [
  {
    slug: 'medicine_life_sciences',
    labelAr: 'مسار الطب وعلوم الحياة',
    aliases: ['الطب والعلوم الحيوية', 'الطب والصحة'],
    faculties: ['الطب البشري', 'طب الأسنان', 'الصيدلة', 'العلاج الطبيعي', 'التمريض', 'الطب البيطري', 'العلوم', 'الزراعة'],
    electives: ['mathematics', 'physics'],
  },
  {
    slug: 'engineering_cs',
    labelAr: 'مسار الهندسة وعلوم الحاسب',
    aliases: ['مسار الهندسة والحاسبات', 'العلوم الهندسية والتكنولوجيا'],
    faculties: ['الهندسة', 'الحاسبات والمعلومات', 'الذكاء الاصطناعي', 'الاتصالات والإلكترونيات', 'التخطيط العمراني'],
    electives: ['chemistry', 'programming_cs'],
  },
  {
    slug: 'business',
    labelAr: 'مسار الأعمال',
    aliases: ['قطاع الأعمال', 'إدارة الأعمال'],
    faculties: ['التجارة', 'إدارة الأعمال', 'المحاسبة', 'التسويق', 'التمويل', 'الاقتصاد', 'اللوجستيات'],
    electives: ['accounting', 'business_administration'],
  },
  {
    slug: 'arts_humanities',
    labelAr: 'مسار الآداب والفنون',
    aliases: ['الآداب والعلوم الإنسانية', 'الفنون والتصميم'],
    faculties: ['الألسن', 'الآداب', 'الإعلام', 'الحقوق', 'الآثار', 'السياحة والفنادق', 'الفنون الجميلة', 'الخدمة الاجتماعية'],
    electives: ['psychology', 'second_foreign_language'],
  },
] as const;

const THANAWEYA_TRACKS = [
  { slug: 'science_science', labelAr: 'علمي علوم', aliases: [] },
  { slug: 'science_math', labelAr: 'علمي رياضة', aliases: [] },
  { slug: 'literary', labelAr: 'أدبي', aliases: [] },
] as const;

/** Common to BOTH systems — grade 1 is non-specialized. */
const YEAR_1_SUBJECTS = [
  { slug: 'arabic', counts: true },
  { slug: 'first_foreign_language', counts: true },
  { slug: 'egyptian_history', counts: true },
  { slug: 'mathematics', counts: true },
  { slug: 'integrated_science', counts: true },
  { slug: 'philosophy_logic', counts: true },
  { slug: 'religious_education', counts: false, passOverride: 70 },
  { slug: 'second_foreign_language', counts: false },
  { slug: 'programming_cs', counts: false },
] as const;

/** Shared across all four مسارات in grade 2 البكالوريا. */
const YEAR_2_SHARED = ['arabic', 'first_foreign_language', 'egyptian_history'] as const;

async function main(): Promise<void> {
  // ── governorates ────────────────────────────────────────────────────
  for (const [index, g] of GOVERNORATES.entries()) {
    await prisma.governorate.upsert({
      where: { code: g.code },
      update: { nameAr: g.nameAr, slug: g.slug, region: g.region as Region, sortOrder: index },
      create: { code: g.code, nameAr: g.nameAr, slug: g.slug, region: g.region as Region, sortOrder: index },
    });
  }

  // ── subjects ────────────────────────────────────────────────────────
  const subjectIdBySlug = new Map<string, string>();
  for (const s of SUBJECTS) {
    const row = await prisma.subject.upsert({
      where: { slug: s.slug },
      update: { nameAr: s.nameAr },
      create: { slug: s.slug, nameAr: s.nameAr },
    });
    subjectIdBySlug.set(s.slug, row.id);
  }
  const subjectId = (slug: string): string => {
    const id = subjectIdBySlug.get(slug);
    if (!id) throw new Error(`Seed bug: unknown subject slug "${slug}"`);
    return id;
  };

  // ── systems ─────────────────────────────────────────────────────────
  const bacalorya = await prisma.educationSystem.upsert({
    where: { slug: 'bacalorya' },
    update: {},
    create: {
      slug: 'bacalorya',
      nameAr: 'البكالوريا المصرية',
      totalMarks: 600,
      passPercent: 70,
      allowsRetakes: true,
      sortOrder: 0,
    },
  });

  const thanaweya = await prisma.educationSystem.upsert({
    where: { slug: 'thanaweya_amma' },
    update: {},
    create: {
      slug: 'thanaweya_amma',
      nameAr: 'الثانوية العامة',
      totalMarks: 320,
      passPercent: 50,
      allowsRetakes: false,
      sortOrder: 1,
    },
  });

  // ── academic years ──────────────────────────────────────────────────
  const YEARS = [
    { year: 1, labelAr: 'الصف الأول الثانوي', bac: 'مرحلة تمهيدية', tha: 'سنة نقل' },
    { year: 2, labelAr: 'الصف الثاني الثانوي', bac: 'سنة شهادة', tha: 'سنة نقل' },
    { year: 3, labelAr: 'الصف الثالث الثانوي', bac: 'سنة شهادة', tha: 'سنة شهادة' },
  ];
  for (const y of YEARS) {
    for (const [system, badge] of [
      [bacalorya, y.bac],
      [thanaweya, y.tha],
    ] as const) {
      await prisma.academicYear.upsert({
        where: { systemId_year: { systemId: system.id, year: y.year } },
        update: { labelAr: y.labelAr, badgeAr: badge },
        create: {
          systemId: system.id,
          year: y.year,
          labelAr: y.labelAr,
          badgeAr: badge,
          sortOrder: y.year,
        },
      });
    }
  }

  // ── tracks ──────────────────────────────────────────────────────────
  const bacTrackIdBySlug = new Map<string, string>();
  for (const [index, t] of BACALORYA_TRACKS.entries()) {
    const track = await prisma.track.upsert({
      where: { systemId_slug: { systemId: bacalorya.id, slug: t.slug } },
      update: { labelAr: t.labelAr, aliases: [...t.aliases], sortOrder: index },
      create: {
        systemId: bacalorya.id,
        slug: t.slug,
        labelAr: t.labelAr,
        aliases: [...t.aliases],
        minYear: 2,
        sortOrder: index,
      },
    });
    bacTrackIdBySlug.set(t.slug, track.id);

    await prisma.trackFaculty.deleteMany({ where: { trackId: track.id } });
    await prisma.trackFaculty.createMany({
      data: t.faculties.map((nameAr, i) => ({ trackId: track.id, nameAr, sortOrder: i })),
    });
  }

  for (const [index, t] of THANAWEYA_TRACKS.entries()) {
    await prisma.track.upsert({
      where: { systemId_slug: { systemId: thanaweya.id, slug: t.slug } },
      update: { labelAr: t.labelAr, sortOrder: index },
      create: {
        systemId: thanaweya.id,
        slug: t.slug,
        labelAr: t.labelAr,
        aliases: [],
        minYear: 2,
        sortOrder: index,
      },
    });
  }

  // ── year 1 offerings (identical for both systems, no track) ─────────
  // These rows have track_id IS NULL. Postgres treats NULLs as distinct, so the
  // composite unique constraint does not identify them and `upsert` would insert
  // a duplicate on every run. findFirst + create keeps the seed idempotent; the
  // partial unique index added in Task 9 is the database-level backstop.
  for (const system of [bacalorya, thanaweya]) {
    for (const [index, s] of YEAR_1_SUBJECTS.entries()) {
      const existing = await prisma.subjectOffering.findFirst({
        where: { systemId: system.id, year: 1, trackId: null, subjectId: subjectId(s.slug) },
        select: { id: true },
      });

      const data = {
        countsTowardTotal: s.counts,
        passPercentOverride: 'passOverride' in s ? s.passOverride : null,
        sortOrder: index,
      };

      if (existing) {
        await prisma.subjectOffering.update({ where: { id: existing.id }, data });
      } else {
        await prisma.subjectOffering.create({
          data: {
            systemId: system.id,
            year: 1,
            trackId: null,
            subjectId: subjectId(s.slug),
            ...data,
          },
        });
      }
    }
  }

  // ── year 2 البكالوريا: 3 shared + 1 elective from a pair ────────────
  for (const t of BACALORYA_TRACKS) {
    const trackId = bacTrackIdBySlug.get(t.slug);
    if (!trackId) throw new Error(`Seed bug: track "${t.slug}" was not created`);

    for (const [index, slug] of YEAR_2_SHARED.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 2,
            trackId,
            subjectId: subjectId(slug),
          },
        },
        update: {},
        create: {
          systemId: bacalorya.id,
          year: 2,
          trackId,
          subjectId: subjectId(slug),
          countsTowardTotal: true,
          sortOrder: index,
        },
      });
    }

    const group = await prisma.electiveGroup.upsert({
      where: { trackId_year_labelAr: { trackId, year: 2, labelAr: 'المادة الاختيارية' } },
      update: {},
      create: { trackId, year: 2, labelAr: 'المادة الاختيارية', pickCount: 1 },
    });

    for (const [index, slug] of t.electives.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 2,
            trackId,
            subjectId: subjectId(slug),
          },
        },
        update: { electiveGroupId: group.id },
        create: {
          systemId: bacalorya.id,
          year: 2,
          trackId,
          subjectId: subjectId(slug),
          countsTowardTotal: true,
          electiveGroupId: group.id,
          sortOrder: 10 + index,
        },
      });
    }
  }

  // ── year 3 البكالوريا: 2 specialist subjects per track ──────────────
  const YEAR_3: Record<string, ReadonlyArray<{ slug: string; level: 'advanced' | 'normal' }>> = {
    medicine_life_sciences: [
      { slug: 'biology', level: 'advanced' },
      { slug: 'chemistry', level: 'advanced' },
    ],
    engineering_cs: [
      { slug: 'mathematics', level: 'advanced' },
      { slug: 'physics', level: 'advanced' },
    ],
    business: [
      { slug: 'economics', level: 'advanced' },
      { slug: 'mathematics', level: 'normal' },
    ],
    arts_humanities: [
      { slug: 'geography', level: 'advanced' },
      { slug: 'statistics', level: 'normal' },
    ],
  };

  for (const [trackSlug, subjects] of Object.entries(YEAR_3)) {
    const trackId = bacTrackIdBySlug.get(trackSlug);
    if (!trackId) throw new Error(`Seed bug: track "${trackSlug}" was not created`);

    for (const [index, s] of subjects.entries()) {
      await prisma.subjectOffering.upsert({
        where: {
          systemId_year_trackId_subjectId: {
            systemId: bacalorya.id,
            year: 3,
            trackId,
            subjectId: subjectId(s.slug),
          },
        },
        update: { level: s.level },
        create: {
          systemId: bacalorya.id,
          year: 3,
          trackId,
          subjectId: subjectId(s.slug),
          countsTowardTotal: true,
          level: s.level,
          sortOrder: index,
        },
      });
    }

    // التربية الدينية: every track, every year, 70% to pass, excluded from the total.
    await prisma.subjectOffering.upsert({
      where: {
        systemId_year_trackId_subjectId: {
          systemId: bacalorya.id,
          year: 3,
          trackId,
          subjectId: subjectId('religious_education'),
        },
      },
      update: {},
      create: {
        systemId: bacalorya.id,
        year: 3,
        trackId,
        subjectId: subjectId('religious_education'),
        countsTowardTotal: false,
        passPercentOverride: 70,
        sortOrder: 90,
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
```

- [ ] **Step 3: Run the seed twice to prove idempotency**

```bash
pnpm --filter @ayman/api run db:seed
psql "$DIRECT_DATABASE_URL" -c "SELECT count(*) FROM app.governorates;"
pnpm --filter @ayman/api run db:seed
psql "$DIRECT_DATABASE_URL" -c "SELECT count(*) FROM app.governorates;"
```
Expected: `27` both times. Also verify:
```bash
psql "$DIRECT_DATABASE_URL" -c "SELECT count(*) FROM app.tracks;"          # 7
psql "$DIRECT_DATABASE_URL" -c "SELECT count(*) FROM app.subject_offerings;" # 50
```

The offering count breaks down as:
- year 1: 9 subjects × 2 systems (no track) = **18**
- year 2 البكالوريا: 4 tracks × (3 shared + 2 electives) = **20**
- year 3 البكالوريا: 4 tracks × (2 specialist + التربية الدينية) = **12**

If a count differs, read the seed rather than adjusting the expected number — a changed count means a
real uniqueness collision, and for the year-1 rows it specifically means the partial unique index
from Task 9 Step 3 was not applied.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): idempotent taxonomy seed — 27 governorates, 2 systems, 7 tracks, offerings"
```

---

## Task 11: Logging, throttling, and the global exception filter

**Files:**
- Create: `apps/api/src/common/filters/all-exceptions.filter.ts`
- Create: `apps/api/src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

**Interfaces:**
- Produces: `AllExceptionsFilter` registered globally. Every error response has the shape
  `{ statusCode: number; message: string; requestId: string; timestamp: string }`. Stack traces never
  reach the client.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/filters/all-exceptions.filter.spec.ts`:

```ts
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/thing', method: 'GET', headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  it('passes through the status and message of an HttpException', () => {
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(new HttpException('مش موجود', HttpStatus.NOT_FOUND), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: 'مش موجود' });
  });

  it('never leaks an internal error message or stack to the client', () => {
    const { host, json, status } = makeHost();
    new AllExceptionsFilter().catch(new Error('connection string postgres://user:hunter2@db'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body).not.toHaveProperty('stack');
  });

  it('always includes a request id and timestamp', () => {
    const { host, json } = makeHost();
    new AllExceptionsFilter().catch(new Error('boom'), host);

    const body = json.mock.calls[0][0];
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @ayman/api test`
Expected: FAIL — `Cannot find module './all-exceptions.filter'`.

- [ ] **Step 3: Implement the filter**

Create `apps/api/src/common/filters/all-exceptions.filter.ts`:

```ts
import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface ErrorBody {
  statusCode: number;
  message: string;
  requestId: string;
  timestamp: string;
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Fails closed: anything that is not an HttpException becomes a generic 500 with
 * no detail. Internal messages routinely contain connection strings and query
 * fragments, so the raw message is logged server-side and never serialised.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<{ status: (code: number) => { json: (b: ErrorBody) => void } }>();
    const request = http.getRequest<{ url?: string; method?: string; headers?: Record<string, unknown> }>();

    const requestId =
      (typeof request?.headers?.['x-request-id'] === 'string'
        ? (request.headers['x-request-id'] as string)
        : undefined) ?? randomUUID();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object' && 'message' in payload) {
        const raw = (payload as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join('، ') : String(raw);
      } else {
        message = exception.message;
      }
    } else {
      this.logger.error(
        `Unhandled ${request?.method ?? '?'} ${request?.url ?? '?'} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @ayman/api test`
Expected: PASS — 3 new tests plus the 5 from Task 7.

- [ ] **Step 5: Wire logging, throttling, and the filter**

Update `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        // Anything on this list never reaches a log line, in any environment.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
            '*.refreshToken',
            '*.client_secret',
          ],
          remove: true,
        },
      },
    }),
    // Layered limits. The in-memory store is per-instance, so this must move to
    // the Redis storage adapter before anything runs more than one replica.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: seconds(1), limit: 10 },
        { name: 'medium', ttl: seconds(60), limit: 60 },
        { name: 'long', ttl: seconds(3600), limit: 1000 },
      ],
    }),
    PrismaModule,
    TaxonomyModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

> `TaxonomyModule` is created in Task 12. If you are running tasks strictly in order, comment out
> both its import and its entry in `imports` until then.

Update `apps/api/src/main.ts` to use the pino logger and set `trust proxy` correctly:

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');

  // A specific hop count, never `true`. With `true`, a client can spoof
  // X-Forwarded-For and become un-throttleable.
  app.set('trust proxy', 1);

  await app.listen(env.API_PORT);
}

void bootstrap();
```

- [ ] **Step 6: Verify the throttler actually blocks**

Run the API, then:
```bash
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3300/api/health; done; echo
```
Expected: several `200`s followed by `429`s once the 10-per-second limit trips.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): pino logging with redaction, layered throttling, fail-closed exception filter"
```

---

## Task 12: Taxonomy contracts and API

**Files:**
- Create: `packages/contracts/src/taxonomy.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/modules/taxonomy/{taxonomy.service.ts,taxonomy.controller.ts,taxonomy.module.ts}`
- Create: `apps/api/src/modules/taxonomy/taxonomy.service.spec.ts`

**Interfaces:**
- Produces:
  - `GovernorateSchema`, `EducationSystemSchema`, `AcademicYearSchema`, `TrackSchema`, `TaxonomySchema` (Zod) and the inferred types `Governorate`, `EducationSystem`, `AcademicYear`, `Track`, `Taxonomy`.
  - `TaxonomyService.getTaxonomy(): Promise<Taxonomy>`
  - `GET /api/taxonomy` returning a `Taxonomy`.

- [ ] **Step 1: Create `packages/contracts/src/taxonomy.ts`**

```ts
import { z } from 'zod';

export const RegionSchema = z.enum(['urban', 'lower', 'upper', 'frontier']);

export const GovernorateSchema = z.object({
  code: z.string().length(2),
  nameAr: z.string().min(1),
  slug: z.string().min(1),
  region: RegionSchema,
  sortOrder: z.number().int(),
});

export const AcademicYearSchema = z.object({
  year: z.number().int().min(1).max(3),
  labelAr: z.string().min(1),
  badgeAr: z.string().min(1),
});

export const TrackSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  labelAr: z.string().min(1),
  /** Tracks are chosen at the start of year 2 — year 1 has no track at all. */
  minYear: z.number().int(),
});

export const EducationSystemSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  nameAr: z.string().min(1),
  totalMarks: z.number().int().positive(),
  passPercent: z.number().min(0).max(100),
  allowsRetakes: z.boolean(),
  years: z.array(AcademicYearSchema),
  tracks: z.array(TrackSchema),
});

export const TaxonomySchema = z.object({
  governorates: z.array(GovernorateSchema),
  /** Codes pinned to the top of the dropdown; the rest follow in code order. */
  pinnedGovernorateCodes: z.array(z.string().length(2)),
  systems: z.array(EducationSystemSchema),
});

export type Region = z.infer<typeof RegionSchema>;
export type Governorate = z.infer<typeof GovernorateSchema>;
export type AcademicYear = z.infer<typeof AcademicYearSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type EducationSystem = z.infer<typeof EducationSystemSchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;
```

Update `packages/contracts/src/index.ts`:
```ts
export { copy, type Copy } from './copy/ar.js';
export * from './taxonomy.js';
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/taxonomy/taxonomy.service.spec.ts`:

```ts
import { TaxonomySchema } from '@ayman/contracts';
import { PrismaClient } from '../../generated/prisma/client';
import { TaxonomyService } from './taxonomy.service';
import { PrismaService } from '../../prisma/prisma.service';

// Integration test against the real seeded database — mocks here would only
// prove the mock matches itself.
describe('TaxonomyService', () => {
  let prisma: PrismaService;
  let service: TaxonomyService;

  beforeAll(async () => {
    prisma = new PrismaClient() as PrismaService;
    await prisma.$connect();
    service = new TaxonomyService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns a payload matching the shared contract exactly', async () => {
    const taxonomy = await service.getTaxonomy();
    expect(() => TaxonomySchema.parse(taxonomy)).not.toThrow();
  });

  it('returns all 27 governorates in official code order, not alphabetical', async () => {
    const { governorates } = await service.getTaxonomy();
    expect(governorates).toHaveLength(27);
    expect(governorates[0]?.code).toBe('01');
    expect(governorates[0]?.nameAr).toBe('القاهرة');
    expect(governorates.at(-1)?.code).toBe('35');

    const codes = governorates.map((g) => g.code);
    expect([...codes]).toEqual([...codes].sort());
    // Alphabetical Arabic order would NOT start with القاهرة.
    const alphabetical = [...governorates].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    expect(alphabetical[0]?.nameAr).not.toBe(governorates[0]?.nameAr);
  });

  it('exposes البكالوريا as 600 marks at 70% with retakes allowed', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    expect(bac).toBeDefined();
    expect(bac?.totalMarks).toBe(600);
    expect(bac?.passPercent).toBe(70);
    expect(bac?.allowsRetakes).toBe(true);
  });

  it('gives البكالوريا exactly four tracks, none available before year 2', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    expect(bac?.tracks).toHaveLength(4);
    for (const track of bac?.tracks ?? []) expect(track.minYear).toBe(2);
    expect(bac?.tracks.map((t) => t.slug).sort()).toEqual([
      'arts_humanities',
      'business',
      'engineering_cs',
      'medicine_life_sciences',
    ]);
  });

  it('keeps الثانوية العامة alive in parallel with three شعب', async () => {
    const { systems } = await service.getTaxonomy();
    const tha = systems.find((s) => s.slug === 'thanaweya_amma');
    expect(tha).toBeDefined();
    expect(tha?.totalMarks).toBe(320);
    expect(tha?.tracks).toHaveLength(3);
  });

  it('labels year 2 البكالوريا as a certificate year', async () => {
    const { systems } = await service.getTaxonomy();
    const bac = systems.find((s) => s.slug === 'bacalorya');
    const year2 = bac?.years.find((y) => y.year === 2);
    expect(year2?.labelAr).toBe('الصف الثاني الثانوي');
    expect(year2?.badgeAr).toBe('سنة شهادة');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @ayman/api test taxonomy`
Expected: FAIL — `Cannot find module './taxonomy.service'`.

- [ ] **Step 4: Implement the service**

Create `apps/api/src/modules/taxonomy/taxonomy.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { Taxonomy } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Codes pinned to the top of the governorate dropdown for UX. */
const PINNED_GOVERNORATE_CODES = ['01', '21', '02'];

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole onboarding taxonomy in one round trip. It is small, changes rarely,
   * and every consumer needs all of it, so splitting it into three endpoints would
   * only add waterfalls.
   */
  async getTaxonomy(): Promise<Taxonomy> {
    const [governorates, systems] = await Promise.all([
      this.prisma.governorate.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { code: true, nameAr: true, slug: true, region: true, sortOrder: true },
      }),
      this.prisma.educationSystem.findMany({
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          slug: true,
          nameAr: true,
          totalMarks: true,
          passPercent: true,
          allowsRetakes: true,
          years: {
            orderBy: { sortOrder: 'asc' },
            select: { year: true, labelAr: true, badgeAr: true },
          },
          tracks: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, slug: true, labelAr: true, minYear: true },
          },
        },
      }),
    ]);

    return {
      governorates,
      pinnedGovernorateCodes: PINNED_GOVERNORATE_CODES,
      // Prisma returns Decimal for numeric columns; the contract says number.
      systems: systems.map((system) => ({
        ...system,
        passPercent: Number(system.passPercent),
      })),
    };
  }
}
```

- [ ] **Step 5: Implement the controller and module**

`apps/api/src/modules/taxonomy/taxonomy.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import type { Taxonomy } from '@ayman/contracts';
import { TaxonomyService } from './taxonomy.service';

@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  /** Public: the onboarding form needs this before a user exists. */
  @Get()
  get(): Promise<Taxonomy> {
    return this.taxonomy.getTaxonomy();
  }
}
```

`apps/api/src/modules/taxonomy/taxonomy.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  controllers: [TaxonomyController],
  providers: [TaxonomyService],
  // Cross-module access happens only through this exports array.
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
```

Uncomment the `TaxonomyModule` import in `app.module.ts` if you commented it out in Task 11.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @ayman/api test taxonomy`
Expected: PASS — 6 tests.

- [ ] **Step 7: Verify the endpoint**

```bash
pnpm --filter @ayman/api dev
curl -s http://localhost:3300/api/taxonomy | head -c 400
```
Expected: JSON beginning with `{"governorates":[{"code":"01","nameAr":"القاهرة"...`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): shared taxonomy contract and GET /api/taxonomy"
```

---

## Task 13: End-to-end proof — taxonomy rendered through the single origin

This task exists to prove the whole stack is wired: Postgres → Prisma → NestJS → same-origin rewrite → React Server Component.

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/dev/taxonomy/page.tsx`
- Create: `apps/web/app/dev/taxonomy/loading.tsx`
- Modify: root `package.json` (a `dev` script that runs both apps)

**Interfaces:**
- Consumes: `GET /api/taxonomy`, `TaxonomySchema` from `@ayman/contracts`.
- Produces: `apiGet<T>(path: string, schema: ZodType<T>): Promise<T>` — a same-origin fetch helper that validates every response against its contract.

- [ ] **Step 1: Create `apps/web/lib/api.ts`**

```ts
import type { ZodType } from 'zod';

/**
 * Server-side base URL. In the browser we always use a relative path so the
 * request stays same-origin; on the server there is no origin, so we need one.
 * This is the ONLY place an API host may appear.
 */
const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

function resolve(path: string): string {
  if (!path.startsWith('/api/')) {
    throw new Error(`API paths must start with /api/ — got "${path}"`);
  }
  return typeof window === 'undefined' ? `${SERVER_BASE}${path}` : path;
}

/**
 * Fetch and validate. Parsing the response against the shared schema means a
 * backend contract change surfaces as a loud error here rather than as
 * `undefined` deep inside a component.
 */
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return schema.parse(await response.json());
}
```

- [ ] **Step 2: Create `apps/web/app/dev/taxonomy/loading.tsx`**

```tsx
import { Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this skeleton ships inside the SSR'd HTML.
 * Bar widths vary deliberately — uniform bars are the biggest "cheap" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} width={i % 3 === 0 ? 'full' : i % 3 === 1 ? 'wide' : 'narrow'} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/dev/taxonomy/page.tsx`**

```tsx
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';

// cacheComponents is on, so this render is dynamic unless explicitly cached.
// Taxonomy is a good future 'use cache' candidate; leaving it live here proves
// the request actually reaches Postgres on every load.
export default async function TaxonomyPage() {
  const taxonomy = await apiGet('/api/taxonomy', TaxonomySchema);

  const pinned = taxonomy.governorates.filter((g) =>
    taxonomy.pinnedGovernorateCodes.includes(g.code),
  );
  const rest = taxonomy.governorates.filter(
    (g) => !taxonomy.pinnedGovernorateCodes.includes(g.code),
  );

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <p className="eyebrow mb-2">02 / التصنيف</p>
      <h1 className="mb-8 text-[length:var(--fs-title-1)] font-semibold">
        {copy.onboarding.governorate} والنظام الدراسي
      </h1>

      <section className="mb-12">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.onboarding.governoratePlaceholder}
        </h2>
        <div className="flex flex-wrap gap-2">
          {pinned.map((g) => (
            <Badge key={g.code} tone="accent">
              {g.nameAr}
            </Badge>
          ))}
          {rest.map((g) => (
            <Badge key={g.code}>{g.nameAr}</Badge>
          ))}
        </div>
        <p className="mono mt-3 text-[length:var(--fs-mono-label)] text-fg-muted">
          {taxonomy.governorates.length} محافظة
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {taxonomy.systems.map((system) => (
          <Card key={system.id}>
            <CardHeader className="flex items-center justify-between gap-3">
              <CardTitle>{system.nameAr}</CardTitle>
              <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                {system.totalMarks} درجة · {system.passPercent}%
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="eyebrow mb-2">الصفوف</p>
                <ul className="space-y-1">
                  {system.years.map((year) => (
                    <li key={year.year} className="flex items-center justify-between">
                      <span>{year.labelAr}</span>
                      <Badge tone={year.badgeAr === 'سنة شهادة' ? 'warn' : 'neutral'}>
                        {year.badgeAr}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-2">{copy.onboarding.track}</p>
                <ul className="space-y-1 text-fg-muted">
                  {system.tracks.map((track) => (
                    <li key={track.id}>{track.labelAr}</li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add a root `dev` script that runs both apps**

Modify the root `package.json` scripts so `dev` starts web and api together via Turborepo (it already does, since both packages define `dev`). Verify with:

```bash
pnpm dev
```
Expected: Turborepo starts `@ayman/web` on 3200 and `@ayman/api` on 3300 concurrently.

- [ ] **Step 5: Verify the full path end to end**

With `pnpm dev` running, open `http://localhost:3200/dev/taxonomy`.

Check all of these:
1. All 27 governorates render, with القاهرة، الجيزة، الإسكندرية in amber at the front.
2. Two system cards render: البكالوريا (600 درجة · 70%) and الثانوية العامة (320 درجة · 50%).
3. البكالوريا shows four مسارات; الثانوية العامة shows three شعب.
4. الصف الثاني الثانوي under البكالوريا carries the `سنة شهادة` badge.
5. The request went through the rewrite, not a direct call:
   ```bash
   curl -s http://localhost:3200/api/taxonomy | head -c 120
   ```
   Expected: the same JSON, served from the **web** origin on port 3200.

- [ ] **Step 6: Run every gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all three pass across all five packages.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): render taxonomy through the single-origin rewrite with a server skeleton"
```

---

## Task 14: Secret-scanning gate

The spec's P6 control requires gitleaks as **both** a pre-commit hook and a CI check — a hook alone is
bypassed by `git commit --no-verify`. CI arrives with Plan 2; the hook lands here.

**Files:**
- Create: `.githooks/pre-commit`
- Create: `.gitleaks.toml`
- Modify: root `package.json` (add a `prepare` script)

**Interfaces:**
- Produces: a repo where `git commit` fails if a staged file contains a detectable secret.

- [ ] **Step 1: Install gitleaks**

```bash
brew install gitleaks
gitleaks version
```
Expected: a version string. If Homebrew is unavailable, download the darwin-arm64 binary from
`https://github.com/gitleaks/gitleaks/releases` and place it on `PATH`.

- [ ] **Step 2: Create `.gitleaks.toml`**

```toml
# Extend the default rule set rather than replacing it — the defaults cover
# AWS, GCP, Stripe, Slack, and private-key formats we would otherwise miss.
[extend]
useDefault = true

[allowlist]
description = "Paths that legitimately contain secret-shaped strings"
paths = [
  '''\.env\.example$''',
  '''pnpm-lock\.yaml$''',
  '''docs/.*\.md$''',
  '''scripts/db-bootstrap\.sql$''',
]
```

> `db-bootstrap.sql` is allowlisted because it contains local development passwords by design.
> Production credentials never live in the repo — they come from the environment.

- [ ] **Step 3: Create `.githooks/pre-commit`**

```bash
#!/usr/bin/env bash
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "pre-commit: gitleaks is not installed — run 'brew install gitleaks'." >&2
  exit 1
fi

echo "pre-commit: scanning staged changes for secrets…"
if ! gitleaks protect --staged --redact --config .gitleaks.toml; then
  echo "" >&2
  echo "pre-commit: BLOCKED — a secret was detected in your staged changes." >&2
  echo "Remove it and re-stage. Do not bypass this with --no-verify." >&2
  exit 1
fi
```

Make it executable and point git at the directory:
```bash
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

- [ ] **Step 4: Add a `prepare` script so the hook path survives a fresh clone**

Add to the root `package.json` scripts:
```json
"prepare": "git config core.hooksPath .githooks || true"
```

- [ ] **Step 5: Verify the hook actually blocks a secret**

```bash
echo 'const k = "AKIAIOSFODNN7EXAMPLE";' > /tmp/leak-test.ts
cp /tmp/leak-test.ts ./leak-test.ts
git add leak-test.ts
git commit -m "test: this must fail"
```
Expected: the commit is **rejected** with "BLOCKED — a secret was detected".

Clean up and confirm normal commits still work:
```bash
git reset HEAD leak-test.ts && rm leak-test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: gitleaks pre-commit hook blocking staged secrets"
```

---

## Definition of done for Plan 1

- [ ] `pnpm dev` starts both apps; `http://localhost:3200/dev/taxonomy` renders live data from Postgres.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all pass.
- [ ] `ml-4` in any JSX is a lint error, with `ms-4` suggested.
- [ ] `ayman_runtime` cannot execute DDL; `CREATE TABLE` as that role is denied.
- [ ] Seeding twice yields 27 governorates, 7 tracks, 50 subject offerings.
- [ ] `git commit` with a fake AWS key in a staged file is blocked by the gitleaks hook.
- [ ] `/dev/tokens` renders correctly in both themes, with no shadows in dark mode.
- [ ] A malformed env var crashes the API at boot with a message naming the key.
- [ ] An unhandled error returns a generic 500 that contains no stack trace and no connection string.

## What Plan 1 deliberately does not do

Auth, users, sessions, courses, quizzes, the admin dashboard, motion, 3D, SEO metadata, and the Redis
throttler storage adapter. Those are Plans 2–7. The throttler currently uses the in-memory store,
which is correct for a single local instance and **must** move to
`@nest-lab/throttler-storage-redis` before a second replica exists.
