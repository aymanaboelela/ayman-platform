import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTML_PREVIEW_CSP, HTML_PREVIEW_PATH, HTML_PREVIEW_SANDBOX } from './html-preview';

const WEB = join(import.meta.dirname, '..');

const directive = (name: string) =>
  HTML_PREVIEW_CSP.split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `)) ?? '';

/**
 * The HTML playground runs whatever a student pastes. These are the lines that
 * keep that code in a box, asserted as literally as possible — each one is a
 * single edit away from being gone, and none of them would make a visible test
 * fail if it went: the preview renders exactly the same with the sandbox open.
 */
describe('HTML preview isolation', () => {
  /**
   * `allow-scripts` + `allow-same-origin` on a same-origin URL is the one
   * combination with which the framed page can remove its own sandbox and read
   * the student's session. Never both.
   */
  it('the iframe sandbox allows scripts but never the same origin', () => {
    const flags = HTML_PREVIEW_SANDBOX.split(/\s+/);
    expect(flags).toContain('allow-scripts');
    expect(flags).not.toContain('allow-same-origin');
    expect(flags.filter((f) => f.startsWith('allow-top-navigation'))).toEqual([]);
    expect(flags).not.toContain('allow-popups');
  });

  it('the response policy sandboxes the document on its own, too', () => {
    const sandbox = directive('sandbox');
    expect(sandbox).toMatch(/^sandbox\b/);
    expect(sandbox).not.toContain('allow-same-origin');
    expect(sandbox).toContain('allow-scripts');
  });

  it('refuses every request: no network directive names a host or self', () => {
    expect(directive('default-src')).toBe("default-src 'none'");
    const fetchable = HTML_PREVIEW_CSP.split(';')
      .filter((part) => !part.trim().startsWith('frame-ancestors'))
      .join(';');
    expect(fetchable).not.toMatch(/https?:|\*|'self'/);
    for (const name of ['connect-src', 'frame-src', 'child-src', 'worker-src', 'object-src', 'prefetch-src']) {
      // Absent = falls back to `default-src 'none'`.
      expect(directive(name), name).toBe('');
    }
    expect(directive('img-src')).toBe('img-src data: blob:');
  });

  it('never grants eval, and only this site may frame it', () => {
    expect(HTML_PREVIEW_CSP).not.toContain('unsafe-eval');
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'self'");
    expect(directive('form-action')).toBe("form-action 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
  });

  it('the component frames exactly this path with exactly this sandbox', () => {
    const source = readFileSync(join(WEB, 'components', 'playground', 'html-preview.tsx'), 'utf8');
    expect(source).toContain('src={HTML_PREVIEW_PATH}');
    expect(source).toContain('sandbox={HTML_PREVIEW_SANDBOX}');
    expect(source).not.toContain('allow-same-origin"');
    expect(source).not.toMatch(/srcDoc|srcdoc=/);
  });

  /**
   * The frame's own script: renders only what its PARENT sends, from this
   * site, once — and answers only this site.
   */
  it('the preview document listens only to its parent on this origin', () => {
    const shell = readFileSync(join(WEB, 'public', HTML_PREVIEW_PATH.slice(1)), 'utf8');
    expect(shell).toContain('event.source !== window.parent');
    expect(shell).toContain('event.origin !== home');
    expect(shell).toContain('var home = location.origin');
    expect(shell).not.toMatch(/postMessage\([^)]*['"]\*['"]\)/);
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});
