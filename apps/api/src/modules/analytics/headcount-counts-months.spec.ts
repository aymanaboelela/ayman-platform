import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const service = readFileSync(join(__dirname, 'course-headcount.service.ts'), 'utf8');

/** The `subscribed AS (…)` CTE, which is the only part this file is about. */
const subscribed = service.slice(
  service.indexOf('subscribed AS ('),
  service.indexOf('SELECT', service.indexOf('coalesce(e.n, 0)')),
);

/**
 * «اشتراك شغال» — والرقم اللي كان بيقول تلت الحقيقة.
 *
 * اللي اشترى «شهر ٢» مشترك في الكورس ده بنفس معنى اللي اشترى الترم بالظبط:
 * دفع، وعنده وصول حي، وبيتفرّج. القايمة كانت `('course','term')` لأنها
 * اتكتبت قبل ما الشهور توجد، فاليوم اللي أربع كورسات اتنقلت فيه للشهور:
 *
 *     تانية (عربي)  ٦٦ على الشاشة  ←  ١٧٧ الحقيقة
 *     تانية (لغات)  ٣٧              ←  ٨٤
 *     أولى (عام)    ١٦              ←  ٢٨
 *
 * والرقم ده اللي المدرّس بيقرا منه «الكورس ده ماشي ولا لأ». رقم بيقول تلت
 * الحقيقة مش رقم ناقص — هو رقم بيدّي قرار غلط.
 *
 * التست بيقرا الاستعلام: اللي بيتحمى **قايمة scopes** في SQL نصّي، وهي
 * تتقرا. تشغيل الاستعلام على بريزما كان هيتحوّل لتست على الفيكستشرز.
 */
describe('the "اشتراك شغال" count', () => {
  it('counts a month subscription, not only course and term', () => {
    expect(subscribed).toContain("'course_month'");
    expect(subscribed).toContain("'course'");
    expect(subscribed).toContain("'term'");
  });

  /*
   * ولا بيعدّ الأوسع: `platform` بيتحسب على **كل** كورس، فعدّه كان هيقول إن
   * كل حساب مسجّل مشترك في كل كورس مجاني. و`subject_teacher` مش اشتراك في
   * كورس بعينه.
   */
  it('still excludes the platform-wide scopes', () => {
    expect(subscribed).not.toContain("'platform'");
    expect(subscribed).not.toContain("'subject_teacher'");
  });

  /*
   * والحي بس: الملغي والمنتهي مش «شغال». `valid_until IS NULL` مقصودة —
   * اشتراك الشهر والترم مالهمش تاريخ انتهاء أصلًا، وقراية `NULL` على إنها
   * «ناقصة» كانت هتشيلهم كلهم من الرقم.
   */
  it('counts the live ones only, and reads NULL as open-ended', () => {
    expect(subscribed).toContain('revoked_at" IS NULL');
    expect(subscribed).toContain('valid_until" IS NULL');
  });
});
