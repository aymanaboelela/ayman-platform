import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The book-order summary is drawn inside a Radix dialog, and a dialog portals
 * into `<body>` — outside `.site` (where `--site-*` is declared) and outside
 * `.store-surface` (where it is aliased). A `var(--site-…)` in any of these
 * rules resolves to nothing there, and the summary a student reads right before
 * typing an address rendered with no background, no border and no rule over
 * its total. `css-token-coverage.test.ts` cannot see that: the token IS
 * defined — just not anywhere the dialog can inherit it from.
 *
 * So: the UNSCOPED rules for these classes read global tokens only, and they
 * live in `globals.css`, which every surface loads — the dashboard and the
 * resume-payment page render the same panel under `(app)`, where `books.css`
 * is not loaded at all. A rule scoped under an ancestor that is inside `.site`
 * (`.books-cart .books-cart__row`) is fine and is not checked.
 */

const WEB = join(import.meta.dirname, '..');
const APP = join(WEB, 'app');

/** Classes whose unscoped rules are rendered inside the order dialog. */
const DIALOG_CLASS = /^\.books-(checkout|checkout__summary|cart__row)(?![\w-])|^\.books-cart__row--total/;

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

/** Every innermost `selector { body }` pair — nested `@media` blocks included,
 *  since `[^{}]` cannot cross into an outer block. */
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

describe('the book-order dialog summary', () => {
  it('reads no `--site-*` token in any unscoped rule, in any stylesheet', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(APP)) {
      for (const { selectors, body } of rules(readFileSync(file, 'utf8'))) {
        const hit = selectors.find((selector) => DIALOG_CLASS.test(selector));
        if (hit && /var\(--site-/.test(body)) offenders.push(`${relative(WEB, file)}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is styled in globals.css, so it is laid out on every surface the dialog opens from', () => {
    const globals = rules(readFileSync(join(APP, 'globals.css'), 'utf8'));
    const defined = new Set(globals.flatMap((rule) => rule.selectors));
    for (const selector of ['.books-checkout', '.books-checkout__summary', '.books-cart__row', '.books-cart__row--total']) {
      expect({ selector, defined: defined.has(selector) }).toEqual({ selector, defined: true });
    }
  });
});
