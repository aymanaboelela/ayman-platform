'use server';

import { updateTag } from 'next/cache';
import { revalidatePath } from '@/lib/revalidate-screen';
import { z } from 'zod';
import {
  AdminHonorPinCreateSchema,
  AdminHonorPinPatchSchema,
  AdminHonorPinRowSchema,
  AdminHonorStudentsSchema,
  type AdminHonorPinCreate,
  type AdminHonorPinPatch,
  type AdminHonorStudent,
} from '@ayman/contracts/admin/honor-board';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet, adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

const c = copy.admin.honorBoard;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * ⚠️ `updateTag`، مش `revalidateTag` (Global Constraint 15).
 *
 * اللوحة العامة بتتقري من `getHonorBoardRounds()` وهي `'use cache'` بـ
 * `cacheLife('minutes')`. من غير السطر ده المدرّس بيحط اسم، بيفتح الصفحة
 * الرئيسية، ومايلاقيهوش — ويفتكر إن الحفظ وقع فيدوس تاني فيتعمل صف مكرّر.
 * `updateTag` بتخلّي نفس الريكويست ده يشوف الجديد.
 */
function afterWrite(): void {
  updateTag(tags.honorBoard());
  revalidatePath('/admin/honor-board');
}

export async function createHonorPinAction(input: AdminHonorPinCreate): Promise<ActionResult> {
  try {
    const body = AdminHonorPinCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/honor-board', body, AdminHonorPinRowSchema);
    afterWrite();
    return { ok: true };
  } catch {
    // الرسالة من الكوبي مش من الخطأ: `adminSend` بيرمي `POST /api/… failed
    // with 400: {"message":…}` وده كان بيتطبع كده جوّه شاشة عربي.
    return { ok: false, message: c.saveFailed };
  }
}

export async function patchHonorPinAction(
  id: string,
  input: AdminHonorPinPatch,
): Promise<ActionResult> {
  try {
    const body = AdminHonorPinPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/honor-board/${id}`, body, AdminHonorPinRowSchema);
    afterWrite();
    return { ok: true };
  } catch {
    return { ok: false, message: c.saveFailed };
  }
}

export async function removeHonorPinAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'DELETE',
      `/api/admin/honor-board/${id}`,
      undefined,
      z.object({ ok: z.boolean() }),
    );
    afterWrite();
    return { ok: true };
  } catch {
    return { ok: false, message: c.removeFailed };
  }
}

/**
 * شيل ورقة امتحان من اللوحة، من الشاشة دي بدل ما تروح لشاشة التصحيح.
 *
 * نفس الراوت اللي شاشة التصحيح بتستعمله (`PATCH /admin/attempts/:id/mark`)
 * وبيكتب نفس الحقل (`quizAttempts.honorBoardAt`) — مش قرار تاني موازي،
 * فمفيش شاشتين ممكن يختلفوا على اسم واحد.
 *
 * `instructorRating` مش متبعت خالص: الدالة اللي ورا الراوت بتعدّل الحقل
 * اللي اتبعت بس (`!== undefined`)، وبعت `null` معاه كان هيمسح تقييم
 * المدرّس للورقة في نفس الدوسة — وده مالوش أي علاقة بشيل الاسم من اللوحة.
 *
 * وبيعمل revalidate للشاشتين: الاسم اللي اتشال من هنا لازم يختفي من شاشة
 * التصحيح كمان، وإلا المدرّس يرجعلها ويلاقي السويتش لسه مولّع.
 */
export async function unpinExamFromBoardAction(attemptId: string): Promise<ActionResult> {
  try {
    await adminSend(
      'PATCH',
      `/api/admin/attempts/${attemptId}/mark`,
      { onHonorBoard: false },
      z.object({ instructorRating: z.number().nullable(), onHonorBoard: z.boolean() }),
    );
    afterWrite();
    revalidatePath(`/admin/grading/${attemptId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: c.removeFailed };
  }
}

/**
 * البحث عن طالب من جوّه الديالوج.
 *
 * Server Action مش `fetch` من المتصفح: الراوت ورا `honor:read` وبياخد كوكي
 * الجلسة، والاستدعاء المباشر من الكلاينت كان هيحتاج هيدر الـCSRF والأصل —
 * وده نفس السبب اللي كل كتابة في الشاشة دي ماشية عليه.
 *
 * بترجّع ليستة فاضية على أي خطأ: البحث مش معلومة الطالب محتاجها، وبانر أحمر
 * جوّه ديالوج بسبب حرف ناقص أسوأ من «مفيش حد بالاسم ده».
 */
export async function searchHonorStudentsAction(q: string): Promise<AdminHonorStudent[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  try {
    const result = await adminGet(
      `/api/admin/honor-board/students?q=${encodeURIComponent(term)}&limit=10`,
      AdminHonorStudentsSchema,
    );
    return result.students;
  } catch {
    return [];
  }
}
