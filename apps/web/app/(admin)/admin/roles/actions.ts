'use server';

import { revalidatePath } from 'next/cache';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminSend } from '@/lib/admin-api';

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
