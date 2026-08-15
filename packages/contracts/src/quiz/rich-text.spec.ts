import { describe, expect, it } from 'vitest';
import { editableToHtml, htmlToEditable, htmlToPlainText, plainTextToHtml } from './rich-text';

describe('plainTextToHtml', () => {
  it('wraps a single line in one paragraph', () => {
    expect(plainTextToHtml('عاصمة مصر إيه؟')).toBe('<p>عاصمة مصر إيه؟</p>');
  });

  it('gives every line its own paragraph', () => {
    expect(plainTextToHtml('السطر الأول\nالسطر التاني')).toBe(
      '<p>السطر الأول</p><p>السطر التاني</p>',
    );
  });

  it('drops blank lines rather than emitting empty paragraphs', () => {
    expect(plainTextToHtml('أ\n\n\nب')).toBe('<p>أ</p><p>ب</p>');
  });

  it('returns the empty string for text that is nothing but whitespace', () => {
    // `stemHtml` is `.min(1)`, so an all-whitespace stem has to reach the
    // schema as '' — `<p>   </p>` would pass a length check with no content.
    expect(plainTextToHtml('   \n  ')).toBe('');
  });

  it('escapes the three characters that would otherwise become markup', () => {
    expect(plainTextToHtml('لو س < 5 و ص > 2 & ع')).toBe('<p>لو س &lt; 5 و ص &gt; 2 &amp; ع</p>');
  });
});

describe('htmlToPlainText', () => {
  it('unwraps a single paragraph', () => {
    expect(htmlToPlainText('<p>السيرفر (Server)</p>')).toBe('السيرفر (Server)');
  });

  it('turns paragraph and line breaks back into newlines', () => {
    expect(htmlToPlainText('<p>أ</p><p>ب<br>ج</p>')).toBe('أ\nب\nج');
  });

  it('decodes entities without double-decoding an escaped entity', () => {
    // `&amp;lt;` is a literal `&lt;` the instructor typed — decoding `&amp;`
    // first would turn it into `<` and silently invent markup.
    expect(htmlToPlainText('<p>&amp;lt; و &lt;p&gt;</p>')).toBe('&lt; و <p>');
  });

  it('leaves text that was never wrapped alone', () => {
    // Rows written by the form before it wrapped anything are bare text.
    expect(htmlToPlainText('سؤال قديم')).toBe('سؤال قديم');
  });
});

describe('htmlToEditable', () => {
  it('shows paragraph-only markup as the plain text it carries', () => {
    expect(htmlToEditable('<p>Storage ثم RAM ثم Cache ثم CPU</p>')).toBe(
      'Storage ثم RAM ثم Cache ثم CPU',
    );
  });

  it('hands back richer markup untouched rather than destroying it', () => {
    // Unwrapping this would show «مهم جدا» and save it back with the emphasis
    // gone — a silent edit the instructor never asked for.
    const rich = '<p>شوف <strong>مهم</strong> و <a href="https://x.test">اللينك</a></p>';
    expect(htmlToEditable(rich)).toBe(rich);
  });
});

describe('editableToHtml', () => {
  it('wraps what the instructor typed', () => {
    expect(editableToHtml('CPU ثم Cache')).toBe('<p>CPU ثم Cache</p>');
  });

  it('passes deliberate markup straight through instead of escaping it', () => {
    const rich = '<p>شوف <strong>مهم</strong></p>';
    expect(editableToHtml(rich)).toBe(rich);
  });

  it('treats a comparison sign as text, not as a tag', () => {
    expect(editableToHtml('لو س < 5')).toBe('<p>لو س &lt; 5</p>');
  });

  it('round-trips whatever the editor was shown', () => {
    for (const stored of [
      '<p>Storage ثم RAM</p>',
      '<p>أ</p><p>ب</p>',
      '<p>لو س &lt; 5</p>',
      '<p>شوف <strong>مهم</strong></p>',
      'سؤال قديم من غير فقرة',
    ]) {
      const editable = htmlToEditable(stored);
      // Saving a question nobody edited must not rewrite its stored markup —
      // except for the legacy bare-text row, which is normalised on the way
      // out and stable from then on.
      expect(htmlToEditable(editableToHtml(editable))).toBe(editable);
    }
  });
});
