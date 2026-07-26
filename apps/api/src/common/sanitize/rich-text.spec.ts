import { sanitizeRichText } from './rich-text';

describe('sanitizeRichText — allowlist', () => {
  it('keeps the tags a lesson actually needs', () => {
    const input =
      '<h2>العنوان</h2><p>نص <strong>مهم</strong> و<em>مائل</em> و<u>تحته خط</u></p>' +
      '<ul><li>عنصر</li></ul><ol><li>عنصر</li></ol>' +
      '<blockquote>اقتباس</blockquote><pre><code>const x = 1;</code></pre><br />';
    const output = sanitizeRichText(input);
    for (const tag of ['h2', 'p', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code']) {
      expect(output).toContain(`<${tag}`);
    }
  });

  it('drops tags outside the allowlist but keeps their text', () => {
    expect(sanitizeRichText('<div><span>نص</span></div>')).toBe('نص');
    expect(sanitizeRichText('<h1>عنوان</h1>')).toBe('عنوان');
  });
});

describe('sanitizeRichText — XSS corpus', () => {
  it.each([
    ['script tag', '<script>alert(1)</script>'],
    ['nested script', '<scr<script>ipt>alert(1)</script>'],
    ['img onerror', '<img src=x onerror="alert(1)">'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
    ['body onload', '<body onload=alert(1)>'],
    ['style block', '<style>body{background:url(javascript:alert(1))}</style>'],
    ['object', '<object data="data:text/html;base64,PHNjcmlwdD4="></object>'],
    ['embed', '<embed src="evil.swf">'],
    ['form', '<form action="https://evil.example"><input name="p"></form>'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ])('neutralises %s', (_label, input) => {
    const output = sanitizeRichText(input);
    expect(output).not.toMatch(/<script|<svg|<style|<object|<embed|<form|<meta|<img/i);
    expect(output).not.toMatch(/onerror|onload|javascript:/i);
  });

  it('denies every iframe — embeds go through the video-id field, never through HTML', () => {
    const input =
      '<p>قبل</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe><p>بعد</p>';
    const output = sanitizeRichText(input);
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('youtube.com');
    expect(output).toContain('قبل');
    expect(output).toContain('بعد');
  });

  it('strips the style attribute so an editor cannot inject CSS', () => {
    const output = sanitizeRichText('<p style="position:fixed;inset:0;z-index:9999">نص</p>');
    expect(output).not.toContain('style');
    expect(output).toContain('نص');
  });
});

describe('sanitizeRichText — links', () => {
  it('forces rel="noopener noreferrer nofollow" on every anchor', () => {
    const output = sanitizeRichText('<a href="https://example.com">لينك</a>');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('href="https://example.com"');
  });

  it('overrides a hostile rel the author supplied', () => {
    const output = sanitizeRichText('<a href="https://example.com" rel="opener">لينك</a>');
    expect(output).toContain('rel="noopener noreferrer nofollow"');
    expect(output).not.toContain('rel="opener"');
  });

  it.each([
    ['javascript', '<a href="javascript:alert(1)">x</a>'],
    ['data', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ['vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
    ['protocol relative', '<a href="//evil.example">x</a>'],
  ])('removes a %s href', (_label, input) => {
    expect(sanitizeRichText(input)).not.toMatch(/href=/);
  });

  it('allows http, https and mailto', () => {
    expect(sanitizeRichText('<a href="http://a.example">x</a>')).toContain('href=');
    expect(sanitizeRichText('<a href="https://a.example">x</a>')).toContain('href=');
    expect(sanitizeRichText('<a href="mailto:a@b.example">x</a>')).toContain('href=');
  });
});

describe('sanitizeRichText — idempotence', () => {
  it('sanitizing twice equals sanitizing once', () => {
    const input = '<p>نص</p><a href="https://a.example">لينك</a><script>alert(1)</script>';
    const once = sanitizeRichText(input);
    expect(sanitizeRichText(once)).toBe(once);
  });
});
