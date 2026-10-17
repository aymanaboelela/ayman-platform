'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminChangePasswordResultSchema,
  AdminChangePasswordSchema,
  AdminProfileSchema,
  AdminUpdateProfileSchema,
  type AdminChangePasswordInput,
  type AdminProfile,
  type AdminUpdateProfileInput,
} from '@ayman/contracts/admin/profile';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import { AdminApiError, adminSend } from '@/lib/admin-api';

const a = adminAccount;

export type ProfileActionResult<T = void> = { ok: true; data: T } | { ok: false; message: string };

/** The API's refusal code, when the body carried one (`AllExceptionsFilter`). */
function codeOf(error: unknown): string | undefined {
  if (!(error instanceof AdminApiError)) return undefined;
  const payload = error.payload as { code?: unknown } | null;
  return typeof payload?.code === 'string' ? payload.code : undefined;
}

/**
 * Name and phone. The sentences are the screen's (`copy/admin-account.ts`),
 * picked by the API's code — it used to return the backend's message, or a
 * ZodError's JSON, verbatim.
 */
export async function updateAdminProfileAction(
  input: AdminUpdateProfileInput,
): Promise<ProfileActionResult<AdminProfile>> {
  const body = AdminUpdateProfileSchema.safeParse(input);
  if (!body.success) return { ok: false, message: a.nameTooShort };

  try {
    const profile = await adminSend('PATCH', '/api/admin/profile', body.data, AdminProfileSchema);
    revalidatePath('/admin/profile');
    return { ok: true, data: profile };
  } catch (error) {
    const code = codeOf(error);
    if (code === 'phone_taken') return { ok: false, message: a.phoneTaken };
    if (code === 'phone_invalid' || code === 'phone_required') return { ok: false, message: a.phoneInvalid };
    return { ok: false, message: a.saveFailed };
  }
}

export type ChangePasswordResult =
  | { ok: true; revokedSessions: number }
  /** `field` names the box the refusal is about, so the form can mark it. */
  | { ok: false; field: 'current' | 'next' | 'confirm' | null; message: string };

/**
 * «تغيير كلمة السر» — verified against the CURRENT password server-side
 * (`AdminProfileService.changePassword`), and never signing this device out:
 * other sessions end only when `revokeOtherSessions` is true, which the form
 * leaves off by default.
 *
 * The profile page is revalidated only when other sessions DID end — the one
 * number on it a password change can move is the open-session count.
 */
export async function changeAdminPasswordAction(input: AdminChangePasswordInput): Promise<ChangePasswordResult> {
  const body = AdminChangePasswordSchema.safeParse(input);
  if (!body.success) {
    const onNext = body.error.issues.some((issue) => issue.path[0] === 'newPassword');
    return onNext
      ? { ok: false, field: 'next', message: a.password.errors.tooShort }
      : { ok: false, field: 'current', message: a.password.errors.currentRequired };
  }

  try {
    const result = await adminSend(
      'POST',
      '/api/admin/profile/change-password',
      body.data,
      AdminChangePasswordResultSchema,
    );
    if (result.revokedSessions > 0) revalidatePath('/admin/profile');
    return { ok: true, revokedSessions: result.revokedSessions };
  } catch (error) {
    switch (codeOf(error)) {
      case 'current_password_incorrect':
        return { ok: false, field: 'current', message: a.password.errors.wrongCurrent };
      case 'password_unchanged':
        return { ok: false, field: 'next', message: a.password.errors.sameAsCurrent };
      case 'no_credential_account':
        return { ok: false, field: null, message: a.password.errors.noCredential };
      default:
        return { ok: false, field: null, message: a.password.errors.failed };
    }
  }
}
