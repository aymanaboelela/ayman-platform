'use client';

import { changeAdminPasswordAction } from '@/app/(admin)/admin/profile/actions';
import { PASSWORD_FIELD_ID, PASSWORD_SECTION_ID } from '@/components/admin/admin-account-menu';
import { ChangePasswordForm } from '@/components/account/change-password-form';

/**
 * «تغيير كلمة السر» on `/admin/profile`, reached from «حسابي» in the header.
 * The form itself is shared with the student's `/profile` — see
 * `components/account/change-password-form.tsx` for its history.
 */
export function AdminChangePasswordForm() {
  return (
    <ChangePasswordForm
      action={changeAdminPasswordAction}
      sectionId={PASSWORD_SECTION_ID}
      firstFieldId={PASSWORD_FIELD_ID}
      // The header is sticky: without the margin, the anchor lands the
      // section's title underneath it.
      className="scroll-mt-[calc(var(--admin-header-h)+1rem)] border-line bg-surface-2"
    />
  );
}
