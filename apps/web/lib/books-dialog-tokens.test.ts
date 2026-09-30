import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The book-order checkout — and the course checkout, drawn in the same frame
 * since — is drawn inside a Radix dialog, and a dialog portals
 * into `<body>` — outside `.site` (where `--site-*` is declared) and outside
 * `.store-surface` (where it is aliased). A `var(--site-…)` there resolves to
 * nothing, and the summary a student reads right before typing an address once
 * rendered with no background, no border and no rule over its total.
 * `css-token-coverage.test.ts` cannot see that: the token IS defined — just not
 * anywhere the dialog can inherit it from.
 *
 * So:
 *   - the checkout's own stylesheet (`book-checkout.css`) reads `:root` tokens
 *     and nothing else — no `--site-*` ANYWHERE in it, scoped or not, because
 *     every rule in it is drawn in a portal or on an `(app)` page;
 *   - the panel imports that stylesheet itself, so it is loaded on every
 *     surface the dialog opens from, `(app)` included;
 *   - the basket rows, which also render in the rail inside `.site`, keep
 *     their unscoped rules global-token-only in `globals.css`. A rule scoped
 *     under an ancestor inside `.site` (`.books-cart .books-cart__row`) is fine
 *     and is not checked.
 */

const WEB = join(import.meta.dirname, '..');
const APP = join(WEB, 'app');
const CHECKOUT_CSS = join(WEB, 'components', 'site', 'book-checkout.css');
const PANEL = join(WEB, 'components', 'site', 'book-order-panel.tsx');
/** The course checkout is drawn in the same frame and portals the same way. */
const COURSE_PANEL = join(WEB, 'components', 'site', 'subscribe-panel.tsx');

/** Classes whose unscoped rules may be rendered outside `.site`. */
const ROW_CLASS = /^\.books-cart__row(?![\w-])|^\.books-cart__row--total/;

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) cssFiles(full, out);
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Every innermost `selector { body }` pair — nested `@media`/`@container`
 *  blocks included, since `[^{}]` cannot cross into an outer block. */
function rules(css: string): { selectors: string[]; body: string }[] {
  const found: { selectors: string[]; body: string }[] = [];
  for (const match of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    found.push({
      selectors: match[1]!.split(',').map((selector) => selector.trim()),
      body: match[2]!,
    });
  }
  return found;
}

describe('the book-order checkout dialog', () => {
  it('reads no `--site-*` token anywhere in its own stylesheet', () => {
    const checkout = rules(readFileSync(CHECKOUT_CSS, 'utf8'));
    // Not vacuous: the file is the dialog's whole look.
    expect(checkout.length).toBeGreaterThan(50);
    const offenders = checkout
      .filter(({ body }) => /var\(--site-/.test(body))
      .map(({ selectors }) => selectors.join(', '));
    expect(offenders).toEqual([]);
  });

  it('is loaded by both panels themselves, so every surface that opens either has it', () => {
    expect(readFileSync(PANEL, 'utf8')).toMatch(/^import '\.\/book-checkout\.css';$/m);
    expect(readFileSync(COURSE_PANEL, 'utf8')).toMatch(/^import '\.\/book-checkout\.css';$/m);
  });

  it('keeps `--site-*` out of every unscoped basket-row rule, in any stylesheet', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(APP)) {
      for (const { selectors, body } of rules(readFileSync(file, 'utf8'))) {
        const hit = selectors.find((selector) => ROW_CLASS.test(selector));
        if (hit && /var\(--site-/.test(body)) offenders.push(`${relative(WEB, file)}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('styles the basket rows in globals.css, which every surface loads', () => {
    const globals = rules(readFileSync(join(APP, 'globals.css'), 'utf8'));
    const defined = new Set(globals.flatMap((rule) => rule.selectors));
    for (const selector of ['.books-cart__row', '.books-cart__row--total']) {
      expect({ selector, defined: defined.has(selector) }).toEqual({ selector, defined: true });
    }
  });
});
