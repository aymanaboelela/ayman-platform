import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const section = readFileSync(join(import.meta.dirname, 'role-change-section.tsx'), 'utf8');

/**
 * قايمة الرولز — والاختيار اللي مكانش موجود فيها.
 *
 * الشاشة كانت بتعرض «طالب» و«مسؤول» وبس، و«مسؤول» معناه `'*'` — كل صلاحية
 * على المنصة. يعني أي مساعد بيتضاف كان بياخد الفلوس والاستردادات ومسح
 * الحسابات والباسوردات وسجل التدقيق.
 *
 * ورول `owner` موجود من الأول، ومكتوب بعناية في `permissions.ts`: صلاحيات
 * التدريس بس، ومن غير أي حاجة لا رجعة فيها ولا خاصة بالفلوس.
 * و`AdminRoleChangeSchema` بيقبله من الأول. **الشاشة** هي اللي كانت بتخفي
 * الاختيار الآمن.
 */
describe('the role picker', () => {
  it('offers the assistant role, not only student and admin', () => {
    expect(section).toContain('value="owner"');
    expect(section).toContain('value="admin"');
    expect(section).toContain('value="student"');
  });

  /*
   * «مسؤول» و«مساعد» جنب بعض في قايمة، والفرق بينهم إن واحد بيوصل لفلوسك
   * والتاني لأ — وده مش حاجة يتوقعها اللي بيقرا الاسمين. الوصف بيتعرض قبل
   * الدوسة، مش بعدها.
   */
  it('says what each one grants, before the press', () => {
    expect(section).toContain('roleAdminHint');
    expect(section).toContain('roleOwnerHint');
  });

  /*
   * ⚠️ البادچ كان `admin ? مسؤول : طالب` — فرعين لتلات رولز.
   *
   * فالمساعد كان هيتعرض على إنه **طالب**: الصفحة تقول حاجة والحساب حاجة
   * تانية، وإنت بتقرر على أساس اللي الصفحة بتقوله. ماكانش بيبان قبل كده لأن
   * الرول مكانش ينفع يتعمل من هنا أصلًا — التغيير اللي بيفتح الاختيار هو
   * اللي بيصحّي الباج.
   */
  it('draws the assistant as an assistant, never as a student', () => {
    expect(section).toContain("student.role === 'owner'");
    expect(section).toContain('roleOwner');
  });
});
