import { Calendar, Laptop, ShieldCheck, User } from 'lucide-react';
import type { AdminProfile } from '@ayman/contracts/admin/profile';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { copy } from '@ayman/contracts/copy/admin';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import { Badge } from '@ayman/ui/components/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';

const c = copy.admin.profile;

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

export function AdminProfileOverview({ profile }: { profile: AdminProfile }) {
  const formattedDate = (() => {
    try {
      return dateFormatter.format(new Date(profile.createdAt));
    } catch {
      return profile.createdAt;
    }
  })();

  // A counted noun — «جلستين»، «3 جلسات»، «11 جلسة» — where it used to be
  // `'{count} جلسات'.replace(...)` for every number but one.
  const sessionsLabel = arabicCount(profile.activeSessionsCount, adminAccount.sessions);

  return (
    <Card className="border-line bg-surface-2">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{c.accountInfo}</CardTitle>
        <Badge tone="accent">{profile.role}</Badge>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-line bg-surface-3 text-accent-text shadow-[var(--shadow-sm)]">
            <User className="size-8 text-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-[length:var(--fs-title-3)] font-semibold text-fg">
              {profile.name}
            </h2>
            <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted" dir="ltr">
              {profile.email ?? profile.phoneNumber ?? '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1/50 p-3">
            <Calendar className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.memberSince}
              </span>
              <span className="truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                {formattedDate}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1/50 p-3">
            <Laptop className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.activeSessions}
              </span>
              <span className="truncate text-[length:var(--fs-text-sm)] font-medium text-fg">
                {sessionsLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface-1/50 p-3 sm:col-span-2">
            <ShieldCheck className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.permissionsCount}
              </span>
              <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                {profile.permissions.includes('*')
                  ? adminAccount.allPermissions
                  : arabicCount(profile.permissions.length, adminAccount.permissionsCount)}
              </span>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
