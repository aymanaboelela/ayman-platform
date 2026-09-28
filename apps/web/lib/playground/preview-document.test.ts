import { describe, expect, it } from 'vitest';
import {
  composePreviewDocument,
  hasScript,
  inlineStylesheet,
  previewBootScript,
} from './preview-document';

/** The 1-based line a marker lands on in a document. */
const lineOf = (doc: string, marker: string) => doc.slice(0, doc.indexOf(marker)).split('\n').length;

describe('composePreviewDocument', () => {
  it('wraps a fragment in a whole RTL document with a doctype', () => {
    const doc = composePreviewDocument({ html: '<h1>أهلاً</h1>', css: '', token: '1' });
    expect(doc).toMatch(/^<!doctype html><html lang="ar" dir="rtl"><head>/);
    expect(doc).toContain('<body><h1>أهلاً</h1></body></html>');
  });

  it('puts the bootstrap and the stylesheet right after an existing <head>', () => {
    const html = '<!doctype html>\n<html lang="en">\n<head>\n<title>x</title>\n</head>\n<body>\n<p id="m">hi</p>\n</body>\n</html>';
    const doc = composePreviewDocument({ html, css: 'p { color: red; }', token: '7' });
    expect(doc.indexOf('<head>')).toBeLessThan(doc.indexOf('<script>'));
    expect(doc.indexOf('<script>')).toBeLessThan(doc.indexOf('<title>'));
    expect(doc).toContain('<style>p { color: red; }</style>');
    // The student's `dir`/`lang` are theirs; nothing is rewritten.
    expect(doc).toContain('<html lang="en">');
    expect(doc.match(/<!doctype/gi)).toHaveLength(1);
  });

  /**
   * The whole reason the additions are one line: «غلطة في سطر ٧» in the console
   * panel has to be line 7 of what the student sees in the editor.
   */
  it('keeps every line of the student’s HTML on the same line number', () => {
    const html = ['<!doctype html>', '<html>', '<head>', '</head>', '<body>', '<p>a</p>', '<script>MARK()</script>', '</body>', '</html>'].join('\n');
    const css = 'body {\n  color: red;\n}\n\np {\n  margin: 0;\n}';
    const doc = composePreviewDocument({ html, css, token: '3' });
    expect(lineOf(doc, 'MARK()')).toBe(lineOf(html, 'MARK()'));
  });

  it('adds a head to a document that skipped one, and a doctype to one without', () => {
    const doc = composePreviewDocument({ html: '<html dir="rtl"><body>x</body></html>', css: 'a{}', token: '1' });
    expect(doc).toMatch(/^<!doctype html><html dir="rtl"><head><script>/);
    expect(doc).toContain('<style>a{}</style></head><body>x</body>');
  });

  it('cannot be broken out of by a stylesheet that closes the style tag', () => {
    const css = 'p{}</style><script>alert(1)</script>';
    expect(inlineStylesheet(css)).toBe('<style>p{}<\\/style><script>alert(1)</script></style>');
    expect(inlineStylesheet(css).match(/<\/style>/g)).toHaveLength(1);
  });

  it('writes nothing for an empty stylesheet', () => {
    expect(inlineStylesheet('  \n ')).toBe('');
  });
});

describe('previewBootScript', () => {
  const boot = previewBootScript('42');

  it('is one line, so it shifts no line numbers', () => {
    expect(boot).not.toContain('\n');
  });

  /**
   * Replies go to `location.origin` — the site — and never to `*`. The frame's
   * own origin is opaque, but its URL's origin is ours, and that is the only
   * window that should hear what the page printed.
   */
  it('posts only to the site origin, never to "*"', () => {
    expect(boot).toContain('H=location.origin');
    expect(boot).not.toMatch(/postMessage\([^)]*,\s*["']\*["']\)/);
  });

  it('carries the run token as a JSON string literal', () => {
    expect(boot).toContain('var T="42"');
    expect(previewBootScript('"</script>')).not.toContain('</script>"');
  });

  it('forwards console, errors and alert, and stops links leaving the page', () => {
    for (const hook of [
      'console[l]=',
      'window.alert=',
      '"error"',
      '"unhandledrejection"',
      'closest("a[href]")',
      '"securitypolicyviolation"',
    ]) {
      expect(boot).toContain(hook);
    }
  });
});

describe('hasScript', () => {
  it.each([
    ['<script>x()</script>', true],
    ['<SCRIPT src="a.js"></SCRIPT>', true],
    ['<button onclick="go()">x</button>', true],
    ['<img src="x" onerror="boom()">', true],
    ['<h1 class="title">مفيش سكريبت</h1>', false],
    ['<p>one = two</p>', false],
  ])('%s → %s', (html, expected) => {
    expect(hasScript(html)).toBe(expected);
  });
});
