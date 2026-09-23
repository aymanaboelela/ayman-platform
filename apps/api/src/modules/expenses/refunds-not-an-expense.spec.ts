import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const overview = readFileSync(join(__dirname, 'finance-overview.service.ts'), 'utf8');

/**
 * الاسترداد بيبان تحت المصروفات، وعمره ما يبقى واحد منهم.
 *
 * صاحب المنصة طلب يشوف الفلوس اللي رجعت في شاشة المصروفات، والطلب مفهوم:
 * فلوس خرجت. بس الحساب هنا:
 *
 *     صافي الربح = (الإيرادات − الاستردادات) − المصروفات
 *
 * فضمّ الاسترداد لـ`expensesTotalCents` كان هيخصمه **مرتين**، والرقم اللي
 * المفروض يكون أرض ثابتة يبقى غلط بضعف المبلغ — والغلط ده بيقرا كأنه صح،
 * لأن كل رقم لوحده منطقي.
 *
 * التست ده بيقرا السورس: اللي بيتحمى هنا **معادلة** مش قيمة، ومحاكاة
 * بريزما كانت هتتحوّل لتست على الموك.
 */
describe('refunds are not an expense', () => {
  /** المجموع بيتبني من `expensesByCategory` وبس — ودي بتتبني من `Expense`. */
  it('builds expensesTotalCents from the expense rows alone', () => {
    const line = overview
      .split('\n')
      .find((row) => row.includes('const expensesTotalCents'));

    expect(line).toBeDefined();
    expect(line).toContain('expensesByCategory.reduce');
    expect(line).not.toContain('refund');
    expect(line).not.toContain('Refund');
  });

  /*
   * والطرح مرة واحدة: `netRevenueTotalCents` شايل الاستردادات مطروحة خلاص،
   * فـ`netCents` بيطرح المصروفات وبس. لو حد ضاف `refundsTotalCents` هنا،
   * السطر ده بيقع.
   */
  it('subtracts refunds once, through net revenue, never again at the bottom', () => {
    const line = overview.split('\n').find((row) => row.includes('netCents:'));

    expect(line).toBeDefined();
    expect(line).toContain('netRevenueTotalCents - expensesTotalCents');
    expect(line).not.toContain('refundsTotalCents');
  });

  /* ولسه بتتطرح فعلًا — التست اللي فوق مايعديش لو الطرح اختفى خالص. */
  it('still subtracts them from revenue, so "not an expense" does not become "not counted"', () => {
    expect(overview).toContain('revenueTotalCents - refundsTotalCents');
  });
});
