'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { z } from '@ayman/contracts/zod';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet, adminSend } from '@/lib/admin-api';
import { roleChangeError } from '@/lib/role-change-error';
import {
  UserPermissionsReadSchema,
  type UserPermissionsRead,
} from '@ayman/contracts/admin/roles';
import { AdminStaffRoleSchema, STAFF_ROLE_REASON_MIN } from '@ayman/contracts/admin/students';
import { formatCopy } from '@ayman/contracts/format';

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
 * والإيميل. أي endpoint بحث تاني كان هيبقى نسخة تانية من نفس الاستعلام
 * تدرِفت عنه.
 *
 * ## `role=student` على السيرفر، مش فلتر هنا
 *
 * «اللي في الفريق خلاص مش نتيجة» — عرضه بيدي زرار «ضيفه» لحد هو فيه. الفلتر
 * ده كان هنا على `r.role`، والقايمة **ماكانتش بترجّع `role` أصلًا** — فالسكيما
 * كانت بتقع على أول صف، والـ`catch` بيبلعها. يعني أي بحث بيلاقي حد كان بيطلع
 * «مقدرناش نغيّر الدور»، وأي بحث مابيلاقيش كان بيطلع «مفيش حساب». البحث
 * ماكانش بيشتغل ولا مرة. السيرفر عنده الفلتر ده من الأول (`role`)، والتمن
 * صفوف بتبقى تمن طلبة، مش تمنية ناقص المساعدين.
 *
 * ⚠️ حرفين على الأقل. بحث بحرف واحد على قاعدة فيها آلاف الطلبة بيرجّع نص
 * الجدول، وde مش نتيجة — ده صفحة بتتحمّل بالغلط.
 */
export async function searchAccountsAction(
  q: string,
): Promise<{ ok: true; rows: { id: string; name: string; phone: string }[] } | { ok: false; message: string }> {
  const term = q.trim();
  if (term.length < 2) return { ok: true, rows: [] };

  try {
    const params = new URLSearchParams({ page: '1', perPage: '8', q: term, role: 'student' });
    const res = await adminGet(
      `/api/admin/students?${params.toString()}`,
      z.object({
        rows: z.array(z.object({ id: z.string(), fullName: z.string(), phone: z.string() })),
      }),
    );
    return {
      ok: true,
      rows: res.rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.phone })),
    };
  } catch {
    // رسالة البحث، مش رسالة تغيير الدور — شوف `staff.searchFailed`.
    return { ok: false, message: c.staff.searchFailed };
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
  /*
   * نفس السكيما اللي السيرفر بيقرا بيها، قبل ما الطلب يطلع.
   *
   * سبب قصير كان بيرجع 400 وبيتحوّل لـ«مقدرناش نغيّر الدور» — رسالة مابتقولش
   * إن العيب في السبب. هنا بيرجع الكلام اللي يتصلّح بيه.
   */
  const body = AdminStaffRoleSchema.safeParse({ role, reason });
  if (!body.success) {
    return { ok: false, message: formatCopy(c.staff.reasonTooShort, { min: STAFF_ROLE_REASON_MIN }) };
  }

  try {
    await adminSend(
      'POST',
      `/api/admin/students/${encodeURIComponent(userId)}/staff-role`,
      body.data,
      z.object({ role: z.string() }),
    );
    revalidatePath('/admin/roles');
    return { ok: true };
  } catch (error) {
    // The refusal itself — «ده حساب مسؤول»، «معاه صلاحيات إنت مش معاك» — not
    // a «try again» that will fail the same way every time.
    const message = roleChangeError(error);
    return { ok: false, message: message === copy.admin.students.roleChangeFailed ? c.staff.failed : message };
  }
}

/**
 * صلاحيات مساعد بعينه.
 *
 * بتتحمّل عند الطلب مش مع الصفحة: الفريق ممكن يبقى عشرة، وجيب صلاحيات
 * عشرة حسابات مقدّمًا عشان يمكن حد يفتح واحد فيهم = عشر طلبات على السيرفر
 * بتتحرق في كل مرة الشاشة تتفتح.
 */
export async function getMemberPermissionsAction(
  userId: string,
): Promise<{ ok: true; data: UserPermissionsRead } | { ok: false; message: string }> {
  try {
    const data = await adminGet(
      `/api/admin/staff/${encodeURIComponent(userId)}/permissions`,
      UserPermissionsReadSchema,
    );
    return { ok: true, data };
  } catch {
    return { ok: false, message: c.member.loadFailed };
  }
}

/**
 * حفظ صلاحيات المساعد — **الحالة النهائية**، زي أخته اللي فوق.
 *
 * الشاشة بتبعت اللي المفروض يملكه بالكامل، والسيرفر بيحسب الفرق عن أساس
 * الرول ويكتب صفوف الفتح والقفل. الفرق التراكمي بين تمن أقسام وعشرات
 * الشيك بوكسات والداتابيز أسهل حاجة يغلط فيها.
 *
 * ⚠️ `revalidatePath` مش كفاية لوحده هنا: القفل بيسري من الكاش اللي في
 * الميموري على السيرفر (`refresh()` جوّه الخدمة)، وde بيحصل قبل ما الرد
 * يرجع. الـrevalidate للشاشة، مش للقفل.
 */
export async function setMemberPermissionsAction(
  userId: string,
  permissions: string[],
): Promise<ActionResult> {
  try {
    await adminSend(
      'PUT',
      `/api/admin/staff/${encodeURIComponent(userId)}/permissions`,
      { permissions },
      z.object({ allowed: z.array(z.string()), withheld: z.array(z.string()) }),
    );
    revalidatePath('/admin/roles');
    return { ok: true };
  } catch {
    return { ok: false, message: c.member.saveFailed };
  }
}
