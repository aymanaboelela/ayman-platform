import { describe, expect, it } from 'vitest';
import { PROTECTED_PREFIXES, isProtectedRoute } from '@/proxy';
import {
  acceptsMarkdown,
  estimateMarkdownTokens,
  isMarkdownablePath,
  markdownRenderPath,
  markdownTwinPath,
  pathFromMarkdownSuffix,
  resolveMarkdownRoute,
} from './markdown-routes';

describe('isMarkdownablePath', () => {
  it('covers every public page that has a markdown rendering', () => {
    for (const path of ['/', '/about', '/courses', '/essentials', '/years/1', '/years/2', '/years/3']) {
      expect(isMarkdownablePath(path)).toBe(true);
    }
    expect(isMarkdownablePath('/courses/python-basics')).toBe(true);
  });

  it('rejects years outside 1-3, which is what the page itself accepts', () => {
    expect(isMarkdownablePath('/years/4')).toBe(false);
    expect(isMarkdownablePath('/years/0')).toBe(false);
    expect(isMarkdownablePath('/years/12')).toBe(false);
  });

  /**
   * The one that matters. `/courses/:slug/lessons/:id` is the PLAYER — session
   * plus enrolment — and a markdown twin of it would be lesson content served
   * as plain text to anyone who asked.
   */
  it('never matches the lesson player or anything below a course', () => {
    expect(isMarkdownablePath('/courses/python-basics/lessons/abc')).toBe(false);
    expect(isMarkdownablePath('/courses/python-basics/lessons')).toBe(false);
    expect(isMarkdownablePath('/courses/a/b/c')).toBe(false);
  });

  /**
   * The invariant `markdown-routes.ts` claims in its header comment, asserted
   * rather than trusted: nothing reachable as markdown may be a route the
   * redirect matrix gates. If someone adds `/dashboard` to the static list,
   * this fails before it ships.
   */
  it('never matches a protected route', () => {
    const candidates = [
      '/',
      '/about',
      '/courses',
      '/essentials',
      '/years/1',
      '/years/2',
      '/years/3',
      '/courses/any-slug',
      ...PROTECTED_PREFIXES,
      ...PROTECTED_PREFIXES.map((prefix) => `${prefix}/nested`),
    ];

    for (const path of candidates) {
      if (isMarkdownablePath(path)) expect(isProtectedRoute(path)).toBe(false);
    }
  });

  it('does not match arbitrary paths', () => {
    expect(isMarkdownablePath('/login')).toBe(false);
    expect(isMarkdownablePath('/dev/tokens')).toBe(false);
    expect(isMarkdownablePath('/nope')).toBe(false);
  });
});

describe('markdownTwinPath', () => {
  it('appends .md, and uses /index.md for the root', () => {
    expect(markdownTwinPath('/')).toBe('/index.md');
    expect(markdownTwinPath('/courses')).toBe('/courses.md');
    expect(markdownTwinPath('/courses/python-basics')).toBe('/courses/python-basics.md');
  });

  it('is null wherever there is no markdown, so the Link header cannot 404', () => {
    expect(markdownTwinPath('/login')).toBeNull();
    expect(markdownTwinPath('/dashboard')).toBeNull();
    expect(markdownTwinPath('/courses/x/lessons/y')).toBeNull();
  });

  it('round-trips through pathFromMarkdownSuffix', () => {
    for (const path of ['/', '/about', '/courses', '/courses/python-basics', '/years/2']) {
      expect(pathFromMarkdownSuffix(markdownTwinPath(path) as string)).toBe(path);
    }
  });
});

describe('markdownRenderPath', () => {
  it('maps onto the catch-all route', () => {
    expect(markdownRenderPath('/')).toBe('/md');
    expect(markdownRenderPath('/courses')).toBe('/md/courses');
    expect(markdownRenderPath('/courses/python-basics')).toBe('/md/courses/python-basics');
  });
});

describe('resolveMarkdownRoute', () => {
  it('reverses markdownRenderPath for every supported page', () => {
    expect(resolveMarkdownRoute(undefined)).toEqual({ kind: 'home' });
    expect(resolveMarkdownRoute([])).toEqual({ kind: 'home' });
    expect(resolveMarkdownRoute(['about'])).toEqual({ kind: 'about' });
    expect(resolveMarkdownRoute(['courses'])).toEqual({ kind: 'courses' });
    expect(resolveMarkdownRoute(['essentials'])).toEqual({ kind: 'essentials' });
    expect(resolveMarkdownRoute(['years', '3'])).toEqual({ kind: 'year', year: 3 });
    expect(resolveMarkdownRoute(['courses', 'python-basics'])).toEqual({
      kind: 'course',
      slug: 'python-basics',
    });
  });

  it('returns null for anything else, so the handler 404s', () => {
    expect(resolveMarkdownRoute(['years', '9'])).toBeNull();
    expect(resolveMarkdownRoute(['courses', 'x', 'lessons', 'y'])).toBeNull();
    expect(resolveMarkdownRoute(['dashboard'])).toBeNull();
  });
});

describe('acceptsMarkdown', () => {
  /**
   * The regression this function exists to prevent: every one of these is a
   * real browser's document `Accept`, and every one must render HTML. A naive
   * `includes('text/markdown')` passes them all — the wildcard is the trap.
   */
  it('is false for real browser Accept headers', () => {
    const browsers = [
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'text/html, application/xhtml+xml, image/jxr, */*',
      '*/*',
    ];
    for (const accept of browsers) expect(acceptsMarkdown(accept)).toBe(false);
  });

  it('is true when markdown is named explicitly', () => {
    expect(acceptsMarkdown('text/markdown')).toBe(true);
    expect(acceptsMarkdown('text/markdown, text/plain;q=0.5')).toBe(true);
    expect(acceptsMarkdown('TEXT/MARKDOWN')).toBe(true);
    expect(acceptsMarkdown('text/markdown;charset=utf-8')).toBe(true);
  });

  it('respects q-values when both are offered', () => {
    expect(acceptsMarkdown('text/markdown;q=0.9, text/html;q=1.0')).toBe(false);
    expect(acceptsMarkdown('text/markdown;q=1.0, text/html;q=0.9')).toBe(true);
    // A tie goes to markdown: a client that ranks them equally and names
    // markdown at all is not a browser.
    expect(acceptsMarkdown('text/markdown, text/html')).toBe(true);
  });

  it('treats application/xhtml+xml as HTML', () => {
    expect(acceptsMarkdown('application/xhtml+xml, text/markdown;q=0.5')).toBe(false);
  });

  it('honours q=0 as "not acceptable"', () => {
    expect(acceptsMarkdown('text/markdown;q=0')).toBe(false);
  });

  it('is false for a missing or empty header', () => {
    expect(acceptsMarkdown(null)).toBe(false);
    expect(acceptsMarkdown(undefined)).toBe(false);
    expect(acceptsMarkdown('')).toBe(false);
  });
});

describe('estimateMarkdownTokens', () => {
  it('never reports zero, so the header is always a usable number', () => {
    expect(estimateMarkdownTokens('')).toBe(1);
    expect(estimateMarkdownTokens('a')).toBe(1);
  });

  it('scales with length', () => {
    expect(estimateMarkdownTokens('a'.repeat(300))).toBe(100);
  });
});
