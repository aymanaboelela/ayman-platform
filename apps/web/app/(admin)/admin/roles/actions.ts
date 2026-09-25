'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet, adminSend } from '@/lib/admin-api';

const c = copy.admin.roles;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * الصلاحيات المفتوحة للرول ده — **المجموعة كاملة**، مش فرق.
 *
 * `PUT` مش `PATCH` عن قصد، وده شكل الـAPI الموجود: الشاشة بتبعت اللي
 * المفروض يبقى مفتوح، والسيرفر بيمسح اللي مش في القايمة. فرق (ضيف ده، شيل
 * ده) كان هيخلي تبويبين مفتوحين على نفس الشاشة يكتبوا فوق بعض من غير ما حد
 * يعرف — والمجموعة الكاملة بتخلي آخر حفظ هو اللي كسب، وهو على الأقل شكل
 * يقدر المستخدم يفهمه.
 *
 * ⚠️ البايسلاين مابيتبعتش. هو مكتوب في الكود (`ROLE_PERMISSIONS`) ومش قابل
 * للتعديل، والسيرفر بيرفض أي صلاحية مش في `grantable` — فحتى لو الشاشة
 * بعتته، مش هيعدّي.
 */
export async function setRolePermissionsAction(
  role: string,
  permissions: string[],
): Promise<ActionResult> {
  try {
    await adminSend(
      'PUT',
      `/api/admin/roles/${encodeURIComponent(role)}/permissions`,
      { permissions },
      // الـ`PUT` بيرجّع `{ role, granted }` وبس — مش نفس شكل الـ`GET`
      // (`RoleGrantsRead`) اللي فيه `baseline` و`grantable` كمان. التحقق
      // باللي بيرجع فعلًا، مش باللي شبهه.
      z.object({ role: z.string(), granted: z.array(z.string()) }),
    );
    revalidatePath('/admin/roles');
    return { ok: true };
  } catch {
    return { ok: false, message: c.saveFailed };
  }
}

/**
 * البحث عن حساب عشان يتضاف للفريق.
 *
 * بيستخدم قايمة الطلبة اللي موجودة — هي أصلًا بتدوّر بالاسم والموبايل
 * والإيميل، وبترجّع الدور في كل صف. أي endpoint بحث تاني كان هيبقى نسخة تانية
 * من نفس الاستعلام تدرِفت عنه.
 *
 * ⚠️ حرفين على الأقل. بحث بحرف واحد على قاعدة فيها آلاف الطلبة بيرجّع نص
 * الجدول، وde مش نتيجة — ده صفحة بتتحمّل بالغلط.
 */
export async function searchAccountsAction(
  q: string,
): Promise<{ ok: true; rows: { id: string; name: string; phone: string; role: string }[] } | { ok: false; message: string }> {
  const term = q.trim();
  if (term.length < 2) return { ok: true, rows: [] };

  try {
    const params = new URLSearchParams({ page: '1', perPage: '8', q: term });
    const res = await adminGet(
      `/api/admin/students?${params.toString()}`,
      z.object({
        rows: z.array(
          z.object({
            id: z.string(),
            fullName: z.string(),
            phone: z.string(),
            role: z.string(),
          }),
        ),
      }),
    );
    return {
      ok: true,
      rows: res.rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.phone, role: r.role })),
    };
  } catch {
    return { ok: false, message: c.staff.failed };
  }
}

/**
 * ضمّ حساب للفريق أو رجوعه طالب.
 *
 * ⚠️ `staff-role` مش `role`. الراوت التاني بيقبل `admin` وصلاحيته طريق
 * تصعيد؛ ده بياخد `owner | student` وبس — شوف `AdminStaffRoleSchema`.
 */
export async function setStaffRoleAction(
  userId: string,
  role: 'owner' | 'student',
  reason: string,
): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/students/${encodeURIComponent(userId)}/staff-role`,
      { role, reason },
      z.object({ role: z.string() }),
    );
    revalidatePath('/admin/roles');
    return { ok: true };
  } catch {
    return { ok: false, message: c.staff.failed };
  }
}
