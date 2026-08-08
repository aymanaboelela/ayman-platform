'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminGrantRowSchema,
  AdminRoleChangeSchema,
  AdminStudentDetailSchema,
  AdminStudentPatchSchema,
} from '@ayman/contracts/admin/students';
import { z } from 'zod';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

function readOptionalText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const value = formData.get(key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalYear(formData: FormData): number | null | undefined {
  if (!formData.has('year')) return undefined;
  const raw = formData.get('year');
  if (raw === '' || raw === null) return null;
  return Number(raw);
}

/**
 * Student profile fields only — `role` has no place in this action, let
 * alone its payload (A4). A student PATCHing `{ role: 'admin' }` onto their
 * own row is the realistic attack this separation closes; the API's own DTO
 * (`AdminStudentPatchSchema`, `.strict()`) is the real gate, but this action
 * cannot even construct the wrong shape in the first place.
 */
export async function patchStudentAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const body = AdminStudentPatchSchema.parse({
      fullName: readOptionalText(formData, 'fullName') || undefined,
      schoolName: readOptionalText(formData, 'schoolName'),
      governorateCode: (readOptionalText(formData, 'governorateCode') as string | undefined) || undefined,
      year: readOptionalYear(formData),
    });

    await adminSend('PATCH', `/api/admin/students/${userId}`, body, AdminStudentDetailSchema);
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

const RoleChangeResultSchema = z.object({ role: z.string() });

export async function changeRoleAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const body = AdminRoleChangeSchema.parse({
      role: formData.get('role'),
      reason: formData.get('reason'),
    });

    await adminSend('POST', `/api/admin/students/${userId}/role`, body, RoleChangeResultSchema);
    revalidatePath(`/admin/students/${userId}`);
    revalidatePath('/admin/students');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}


/**
 * Opening one course for one student — the key to a course marked «مقفول».
 *
 * `revalidatePath` on this student's page only. A grant changes what THIS
 * student can open and nothing about the catalog, so evicting anything wider
 * would be a cache eviction with no reader.
 */
export async function grantCourseAction(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const courseId = String(formData.get('courseId') ?? '');
    if (!courseId) return { ok: false, message: 'no course selected' };

    await adminSend(
      'POST',
      `/api/admin/students/${userId}/grants`,
      {
        courseId,
        // Open-ended and unannotated from this form. The API accepts both, and
        // a date picker plus a note field on a two-control panel would bury the
        // one thing it is for behind paperwork.
        validUntil: null,
        note: null,
      },
      z.array(AdminGrantRowSchema),
    );

    revalidatePath(`/admin/students/${userId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/** Closes it again. The row is stamped `revokedAt`, never deleted — see the service. */
export async function revokeGrantAction(userId: string, grantId: string): Promise<ActionResult> {
  try {
    await adminSend(
      'DELETE',
      `/api/admin/students/${userId}/grants/${grantId}`,
      undefined,
      z.array(AdminGrantRowSchema),
    );
    revalidatePath(`/admin/students/${userId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
