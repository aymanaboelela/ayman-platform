import { describe, expect, it } from 'vitest';

import { AdminRoleChangeSchema, AdminStaffRoleSchema, StudentListQuerySchema } from './students';

/**
 * الباب الضيّق لتعيين مساعد.
 *
 * ## ليه فيه بابين أصلًا
 *
 * `changeRole` بياخد `admin | owner | student`، فالصلاحية اللي بتفتحه
 * (`student:role-change`) **طريق تصعيد**: اللي ماسكها يقدر يعمل أدمن كامل على
 * الستاك. عشان كده هي مستثناة من `grantablePermissions` خالص.
 *
 * والنتيجة إن المدرّس ماكانش يقدر يضيف مساعد على منصته هو. اتقاس:
 * `GET /api/admin/roles/owner/permissions` رد **403** عند صبري وعادل، يعني
 * مفيش حساب على الستاك يقدر يفتحها له.
 *
 * ⚠️ **الحماية في السكيما مش في شرط في الكود.** `if (role === 'admin') throw`
 * بيسيب الباب موجود وبيحطّ عليه حارس؛ `z.enum(['owner','student'])` معناها إن
 * `admin` مش قيمة الراوت ده يعرف يقراها. الفرق بين «صعب» و«مستحيل».
 */
describe('AdminStaffRoleSchema', () => {
  it('بتقبل owner وstudent', () => {
    for (const role of ['owner', 'student'] as const) {
      expect(AdminStaffRoleSchema.safeParse({ role, reason: 'مساعد جديد' }).success).toBe(true);
    }
  });

  it('⚠️ بترفض admin — وده كل سبب وجودها', () => {
    const r = AdminStaffRoleSchema.safeParse({ role: 'admin', reason: 'محاولة' });
    expect(r.success).toBe(false);
  });

  it('بتطلب سبب — «مين خلّى ده مساعد وليه» بيتسأل بعد شهور', () => {
    expect(AdminStaffRoleSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(AdminStaffRoleSchema.safeParse({ role: 'owner', reason: 'ا' }).success).toBe(false);
  });

  it('strict — مفيش حقل زيادة بيعدّي', () => {
    const r = AdminStaffRoleSchema.safeParse({ role: 'owner', reason: 'مساعد', extra: 1 });
    expect(r.success).toBe(false);
  });

  it('والباب الواسع لسه بيقبل admin — مش المفروض نقفله، هو أداة المشغّل', () => {
    // لو ده وقع يبقى حد ضيّق السكيما الغلط: إنشاء أول مدرّس على ستاك جديد
    // بيمرّ من هنا.
    expect(AdminRoleChangeSchema.safeParse({ role: 'admin', reason: 'مشغّل' }).success).toBe(true);
  });
});

describe('فلتر الدور في قايمة الطلبة', () => {
  it('الافتراضي فاضي — كل استدعاء قديم بيرجّع نفس اللي كان بيرجّعه', () => {
    const parsed = StudentListQuerySchema.parse({});
    expect(parsed.role).toBe('');
  });

  it('بيقبل staff وstudent ويرفض غيرهم', () => {
    expect(StudentListQuerySchema.safeParse({ role: 'staff' }).success).toBe(true);
    expect(StudentListQuerySchema.safeParse({ role: 'student' }).success).toBe(true);
    // `owner` مش قيمة هنا عن قصد: الشاشة بتسأل «مين مش طالب»، فدور رابع
    // يتضاف بكرة بيبان فيها لوحده.
    expect(StudentListQuerySchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});
