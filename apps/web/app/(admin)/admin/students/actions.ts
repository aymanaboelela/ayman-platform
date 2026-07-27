'use server';

import { revalidatePath } from 'next/cache';
import {
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
