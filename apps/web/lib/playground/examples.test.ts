import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ALL_EXAMPLES, JS_EXAMPLES, PY_EXAMPLES, WEB_EXAMPLES } from './examples';

/**
 * «أمثلة جاهزة تشتغل فعلًا» — the promise the gallery makes, checked the only
 * way that means anything: by running them.
 *
 * A library of examples rots quietly. Nothing fails in production when one of
 * them throws; a student just presses «تجربة», sees a red line, and concludes
 * that programming is not for them. So every JavaScript example is executed
 * here, every Python one is executed by a real CPython when the machine has one
 * (CI's runner does), and every page is checked for the one thing the preview
 * will refuse: reaching the network.
 */

/** Runs a JS example the way `public/js-runner.js` does: a local console. */
function runJs(code: string): string[] {
  const out: string[] = [];
  const show = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
  const console = {
    log: (...args: unknown[]) => out.push(args.map(show).join(' ')),
    info: (...args: unknown[]) => out.push(args.map(show).join(' ')),
    warn: (...args: unknown[]) => out.push(args.map(show).join(' ')),
    error: (...args: unknown[]) => out.push(args.map(show).join(' ')),
  };
  new Function('console', code)(console);
  return out;
}

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('playground examples', () => {
  it('every example has a unique id, a title, a one-line blurb and content', () => {
    const ids = ALL_EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const example of ALL_EXAMPLES) {
      expect(example.title.trim(), example.id).not.toBe('');
      expect(example.blurb.trim(), example.id).not.toBe('');
      expect(example.blurb, example.id).not.toContain('\n');
      if (example.language === 'web') {
        expect(example.html.trim(), example.id).not.toBe('');
        expect(example.css.trim(), example.id).not.toBe('');
      } else {
        expect(example.code.trim(), example.id).not.toBe('');
      }
    }
  });

  /**
   * The first five of each language are the original set, in the order they
   * build on each other — and `playground.e2e.ts` picks index 2 from the
   * dropdown and expects a `for` loop.
   */
  it('keeps the original five first, in order', () => {
    expect(JS_EXAMPLES.slice(0, 5).map((e) => e.id)).toEqual([
      'js-hello',
      'js-branch',
      'js-loop',
      'js-function',
      'js-array',
    ]);
    expect(PY_EXAMPLES.slice(0, 5).map((e) => e.id)).toEqual([
      'py-hello',
      'py-branch',
      'py-loop',
      'py-function',
      'py-list',
    ]);
    expect(JS_EXAMPLES[2]!.code).toMatch(/for \(/);
  });

  it.each(JS_EXAMPLES.map((e) => [e.id, e] as const))('JavaScript %s runs and prints something', (_id, example) => {
    const out = runJs(example.code);
    expect(out.length).toBeGreaterThan(0);
  });

  /**
   * Drawn output has to survive a phone. The console on a 360px screen fits
   * about 32 monospace columns; a pyramid wider than that wraps into noise.
   * Lines of prose (a list of primes, a sentence) may wrap — only lines that
   * are mostly drawing characters are held to the width.
   */
  it('drawn output fits a phone-width console', () => {
    for (const example of JS_EXAMPLES) {
      for (const line of runJs(example.code)) {
        const drawing = [...line].filter((ch) => '*█ '.includes(ch)).length / Math.max(1, [...line].length);
        if (drawing > 0.8) expect([...line].length, `${example.id}: ${line}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it.skipIf(!hasPython).each(PY_EXAMPLES.map((e) => [e.id, e] as const))(
    'Python %s runs under CPython and prints something',
    (_id, example) => {
      const out = execFileSync('python3', ['-c', example.code], { encoding: 'utf8', timeout: 10_000 });
      expect(out.trim()).not.toBe('');
    },
  );

  /**
   * The preview's policy is `default-src 'none'` — an example that points at a
   * CDN, a web font or an image URL would render broken in the one place it is
   * shown. Inline SVG, gradients, `data:` and emoji are the whole toolbox.
   */
  it.each(WEB_EXAMPLES.map((e) => [e.id, e] as const))('page %s is self-contained', (_id, example) => {
    const text = `${example.html}\n${example.css}`;
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/(src|href)\s*=\s*["']?\/\//i);
    expect(text).not.toMatch(/<link\b/i);
    expect(text).not.toMatch(/@import/i);
    expect(text).not.toMatch(/url\(\s*["']?(?!data:)/i);
    expect(text).not.toMatch(/<(img|video|audio|iframe|embed|object)\b/i);
  });

  it.each(WEB_EXAMPLES.map((e) => [e.id, e] as const))('page %s is a whole RTL Arabic document', (_id, example) => {
    expect(example.html).toMatch(/^<!doctype html>/i);
    expect(example.html).toMatch(/<html lang="ar" dir="rtl">/);
    expect(example.html).toMatch(/<meta charset="utf-8">/);
    expect(example.html).toMatch(/<\/html>$/);
  });

  /**
   * `copy/outreach.ts`'s rule, applied to the examples: the platform never
   * asks whether a student is a boy or a girl, so nothing here may address the
   * reader in a form only one of them can be spoken to in. The comments
   * describe the code («بتطبع»), they do not instruct the reader («اطبع»).
   *
   * Whole-token match, like the tripwire in `outreach/compose.spec.ts`; this
   * list is its imperative and second-person half plus the ones an example is
   * most likely to reach for.
   */
  it('never addresses the student as a boy', () => {
    const MASCULINE_ONLY = new Set([
      'اطبع', 'اكتب', 'جرّب', 'جرب', 'دوس', 'شوف', 'خد', 'روح', 'غيّر', 'افتح', 'اختار', 'اعمل',
      'راجع', 'ارجع', 'كمّل', 'افتكر', 'ركّز', 'تعالى', 'صغّر', 'كبّر', 'حط', 'امسح', 'شغّل',
      'متخافش', 'متنساش', 'فاهم', 'عارف', 'حابب', 'عامل', 'تقدر', 'بتكتب', 'كتبت', 'جبت',
      'معاك', 'ليك', 'بيك', 'فيك', 'انت', 'إنت', 'أنت',
    ]);
    for (const example of ALL_EXAMPLES) {
      const text = [
        example.title,
        example.blurb,
        example.language === 'web' ? `${example.html}\n${example.css}` : example.code,
      ].join('\n');
      for (const token of text.split(/[\s،.:؟!—«»…()٪"'`<>/=;,{}[\]#*+-]+/u)) {
        expect(MASCULINE_ONLY.has(token), `«${token}» in ${example.id}`).toBe(false);
      }
    }
  });
});
