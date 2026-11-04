'use client';

import Link from 'next/link';
import { copy } from '@ayman/contracts';
import { changeOwnPasswordAction } from '@/app/(app)/profile/actions';
import { ChangePasswordForm } from '@/components/account/change-password-form';

/**
 * «تغيير كلمة السر» on the student's `/profile`, opened directly with
 * `/profile#password`. A student who does not know the current password is
 * pointed at `/forgot-password` — `forgotHref` is null where that page is off.
 */
export function StudentChangePasswordForm({ forgotHref }: { forgotHref: string | null }) {
  return (
    <ChangePasswordForm
      action={changeOwnPasswordAction}
      sectionId="password"
      firstFieldId="profile-current-password"
      className="mt-8 scroll-mt-24 border-line bg-surface-2"
      footer={
        forgotHref ? (
          <p className="text-[length:var(--fs-text-sm)]">
            <Link href={forgotHref} className="text-accent-text underline underline-offset-4">
              {copy.profile.forgotCurrent}
            </Link>
          </p>
        ) : null
      }
    />
  );
}
