import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * «التأسيس»، «كل اللينكات» و«الكتب» بيتشالوا على ستاك مش بتاع أيمن — ولازم
 * **من المكانين**.
 *
 * ## ليه ده تست وليه بيقرا الملفات كنص
 *
 * `IS_AYMAN` بيتقرّر من `TENANT_KEY` وقت البناء، فتست بيستورد الموديول بيشوف
 * ستاك واحد بس. اللي محتاج يتحرس مش قيمة البوابة — هو إن **الاتنين متبوّبين
 * بنفس البوابة**: الفوتر و`sitemap.ts`.
 *
 * ⚠️ ده مش تشدّد. أول نسخة من الشغل ده شالت اللينكات من الفوتر وبس، وكاتبة في
 * كومنت إن `PAGE_LINKS` بتتقرا من الـsitemap كمان — **وde كان غلط**. الـsitemap
 * عنده ليستة خاصة مكتوبة بإيد. فالنتيجة كانت هتبقى: اللينك مش باين للطالب،
 * والصفحة الفاضية لسه متعلنة لجوجل على دومين المدرّس التاني.
 *
 * أي حد بيضيف صفحة أيمن-بس تانية محتاج يعرف إنها مكانين مش مكان.
 */
const WEB = process.cwd();

function read(rel: string): string {
  return readFileSync(join(WEB, rel), 'utf8');
}

describe('صفحات أيمن متبوّبة في الفوتر وفي خريطة الموقع', () => {
  const footer = read('components/site/footer-content.ts');
  const sitemap = read('app/sitemap.ts');

  it('الفوتر بيفلتر التلاتة', () => {
    expect(footer).toContain("import { IS_AYMAN }");
    // `/books` بالفيتشر **و**البوابة، والتانيين بالبوابة.
    expect(footer).toMatch(/features\.books\s*&&\s*IS_AYMAN/);
    expect(footer).toContain("'/essentials'");
    expect(footer).toContain("'/links'");
  });

  it('خريطة الموقع بتفلتر نفس التلاتة', () => {
    expect(sitemap).toContain("import { IS_AYMAN }");
    expect(sitemap).toMatch(/features\.books\s*&&\s*IS_AYMAN/);

    // كل واحدة فيهم لازم تكون جوّه فرع `IS_AYMAN`، مش صف عادي في الليستة.
    for (const page of ['/essentials', '/links']) {
      const at = sitemap.indexOf(`${page}\``);
      expect(at, `${page} مش في الخريطة خالص`).toBeGreaterThan(-1);
      // ادوّر على `IS_AYMAN` في الـ400 حرف اللي قبلها — ده الفرع اللي حواليها.
      const before = sitemap.slice(Math.max(0, at - 400), at);
      expect(before, `${page} في الخريطة من غير بوابة`).toContain('IS_AYMAN');
    }
  });

  it('مفيش صفحة أيمن-بس في مكان واحد من الاتنين', () => {
    // الحارس الحقيقي: أي مسار متبوّب في ملف لازم يكون متبوّب في التاني.
    for (const page of ['/essentials', '/links']) {
      const inFooter = footer.includes(`'${page}'`);
      const inSitemap = sitemap.includes(`${page}\``);
      expect(
        inFooter && inSitemap,
        `${page} متبوّب في ملف واحد بس — الفوتر=${inFooter} الخريطة=${inSitemap}`,
      ).toBe(true);
    }
  });
});
