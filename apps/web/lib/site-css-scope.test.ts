import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ستايلات الموقع العام مابتعرّفش أسامي كلاسات بتاعة شل الطالب.
 *
 * ## الغلطة اللي ده موجود عشانها
 *
 * `app/(site)/styles/*.css` بيتحمّل على صفحات الموقع العام بس — لكن لما الطالب
 * يدخل من الصفحة الرئيسية للداشبورد بتنقّل من غير ريفرش، Next مابيشيلش الملف.
 * والصفحة الرئيسية كان فيها `.rail` (شريط «ليه تذاكر معانا») بـ`min-height:
 * 100svh` و`align-items: center`، وده نفس اسم القايمة الجانبية بتاعة الطالب.
 * القايمة اتمدّت لطول الصفحة، ومحتواها نزل لنصها، وsticky وقف — «السايد مينيو
 * نازل لتحت». وعلى ريفرش كانت سليمة، فمحدش شافها في التست.
 *
 * التست ده بيقرا الملفات نفسها: أي selector في ستايلات الموقع بيبدأ بكلاس من
 * الشل = نفس الباج مستني تنقّل واحد.
 */
const SITE_STYLES = join(__dirname, '..', 'app', '(site)', 'styles');

/** الكلاسات اللي شل الطالب (`components/app/*`) بيملكها. */
const SHELL_CLASSES = ['rail', 'topbar', 'tabbar'];

describe('site stylesheets stay out of the student shell’s class names', () => {
  const files = readdirSync(SITE_STYLES).filter((name) => name.endsWith('.css'));

  it('finds the site stylesheets', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s declares no shell class', (file) => {
    const css = readFileSync(join(SITE_STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = SHELL_CLASSES.flatMap((name) =>
      [...css.matchAll(new RegExp(`\\.${name}(?![\\w-])|\\.${name}__`, 'g'))].map(() => `.${name}`),
    );
    expect(hits).toEqual([]);
  });
});
