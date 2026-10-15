'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { copy } from '@ayman/contracts/copy/admin';
import {
  AdminChangePasswordSchema,
  AdminChangePasswordResultSchema,
  AdminProfileSchema,
  AdminUpdateProfileSchema,
  type AdminChangePasswordInput,
  type AdminProfile,
  type AdminUpdateProfileInput,
} from '@ayman/contracts/admin/profile';
import { AdminApiError, adminSend } from '@/lib/admin-api';

export type ProfileActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string };

/**
 * Server Action: update basic admin profile fields (name, phoneNumber).
 */
export async function updateAdminProfileAction(
  input: AdminUpdateProfileInput,
): Promise<ProfileActionResult<AdminProfile>> {
  try {
    const body = AdminUpdateProfileSchema.parse(input);
    const profile = await adminSend('PATCH', '/api/admin/profile', body, AdminProfileSchema);
    revalidatePath('/admin/profile');
    return { ok: true, data: profile, message: copy.admin.profile.profileSaved };
  } catch (error) {
    if (error instanceof AdminApiError) {
      const payload = error.payload as { message?: string | string[] } | null;
      const msg = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
      if (error.status === 409) {
        return { ok: false, message: 'رقم الهاتف مستخدم بالفعل بحساب آخر' };
      }
      return { ok: false, message: msg || error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : copy.common.error,
    };
  }
}

/**
 * Server Action: change admin password with current password verification.
 */
export async function changeAdminPasswordAction(
  input: AdminChangePasswordInput,
): Promise<ProfileActionResult<{ status: true; message: string }>> {
  try {
    const body = AdminChangePasswordSchema.parse(input);
    const result = await adminSend(
      'POST',
      '/api/admin/profile/change-password',
      body,
      AdminChangePasswordResultSchema,
    );
    revalidatePath('/admin/profile');
    return { ok: true, data: result, message: copy.admin.profile.passwordChanged };
  } catch (error) {
    if (error instanceof AdminApiError) {
      const payload = error.payload as { message?: string | string[] } | null;
      const msg = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
      return { ok: false, message: msg || error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : copy.common.error,
    };
  }
}
