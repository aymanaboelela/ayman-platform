import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const actions = readFileSync(join(import.meta.dirname, 'actions.ts'), 'utf8');
const unpin = actions.slice(
  actions.indexOf('export async function unpinExamFromBoardAction'),
  actions.indexOf('export async function', actions.indexOf('unpinExamFromBoardAction') + 1),
);

/**
 * `unpinExamFromBoardAction` — شيل ورقة امتحان من لوحة الشرف.
 *
 * التست ده بيقرا السورس مش بيستدعي الدالة: هي Server Action بتكلّم
 * `adminSend` ورا كوكي جلسة، ومحاكاتها كانت هتتحوّل لتست على الموك. اللي
 * بيهم هنا **شكل الحمولة**، وده يتقرا.
 */
describe('unpinExamFromBoardAction', () => {
  /*
   * ⚠️ الحاجة الخطرة، وهي سبب الملف ده.
   *
   * الراوت اللي ورا ده بيعدّل الحقل اللي اتبعت بس:
   *
   *     ...(input.instructorRating !== undefined && { instructorRating: … })
   *
   * يعني بعت `instructorRating: null` مع الطلب كان **هيمسح تقييم المدرّس
   * للورقة** في نفس الدوسة اللي بتشيل الاسم من اللوحة — تقييم مالوش أي
   * علاقة بالقرار ده، وشيل الاسم مش سبب لمسحه.
   *
   * والحذف ده صامت: الشاشة هتقول «اتشال» وهي فعلًا شالت، والتقييم راح من
   * غير ما حد يعرف.
   */
  it('sends onHonorBoard only, never instructorRating', () => {
    // الحمولة هي الوسيط التالت لـ`adminSend`، وهي السطر الوحيد اللي بيهم:
    // `instructorRating` بيتذكر تاني في **سكيمة الرد** تحته، وده مطلوب
    // ومالوش علاقة باللي بيتبعت.
    const body = unpin.slice(unpin.indexOf('{ onHonorBoard'), unpin.indexOf('},', unpin.indexOf('{ onHonorBoard')));
    expect(body).toContain('onHonorBoard: false');
    expect(body).not.toContain('instructorRating');
  });

  /* نفس الراوت اللي شاشة التصحيح بتستعمله، ونفس الحقل — مش قرار موازي. */
  it('writes through the grading route, not a second one of its own', () => {
    expect(unpin).toContain('/api/admin/attempts/');
    expect(unpin).toContain('/mark');
    expect(unpin).toContain("'PATCH'");
  });

  /*
   * الاسم اللي اتشال من هنا لازم يختفي من شاشة التصحيح كمان، وإلا المدرّس
   * يرجعلها ويلاقي السويتش لسه مولّع على حاجة مابقتش موجودة.
   */
  it('revalidates the grading screen too, not only this one', () => {
    expect(unpin).toContain('afterWrite()');
    expect(unpin).toContain('/admin/grading/');
  });
});
