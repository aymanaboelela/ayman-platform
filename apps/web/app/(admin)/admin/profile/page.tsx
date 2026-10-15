import { AdminProfileSchema } from '@ayman/contracts/admin/profile';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { AdminProfileOverview } from '@/components/admin/profile/admin-profile-overview';
import { AdminProfileForm } from '@/components/admin/profile/admin-profile-form';
import { AdminChangePasswordForm } from '@/components/admin/profile/admin-change-password-form';

export const metadata = {
  title: copy.admin.profile.title,
};

/**
 * Admin Profile Page:
 * Allows an admin to view account information, active sessions, update name & phone,
 * and securely change their password with current password verification and optional
 * revocation of sessions on other devices.
 */
export default async function AdminProfilePage() {
  const profile = await adminGet('/api/admin/profile', AdminProfileSchema);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">
          {copy.admin.profile.title}
        </h1>
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {copy.admin.profile.subtitle}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AdminProfileOverview profile={profile} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <AdminProfileForm profile={profile} />
          <AdminChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
