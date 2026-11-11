import { Suspense } from 'react';
import { z } from 'zod';
import { StudentHistoryEntrySchema, type AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { SessionDeviceListSchema } from '@ayman/contracts/sessions';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { AccountAccessSection } from '../../../students/[userId]/account-access-section';
import { CenterAttendanceSection } from '../../../students/[userId]/center-attendance-section';
import { DevicesSection } from '../../../students/[userId]/devices-section';
import { GamesSection } from '../../../students/[userId]/games-section';
import { HistorySection } from '../../../students/[userId]/history-section';
import { PaymentsSection, PaymentsSectionSkeleton } from '../../../students/[userId]/payments-section';
import { RoleChangeSection } from '../../../students/[userId]/role-change-section';
import { SetPasswordSection } from '../../../students/[userId]/set-password-section';
import { StudentDetailForm } from '../../../students/[userId]/student-detail-form';
import { WalletSection } from '../../../students/[userId]/wallet-section';
import { PanelNotice } from './panel-notice';

/*
 * The three tabs that are the student page's own sections, whole.
 *
 * Reused, never re-implemented: each section already carries its permission
 * gate, its server action and its `refresh()` — which re-renders THIS page,
 * `?panel=` included — so a write here shows here, and the drawer cannot
 * drift from the page in what it allows. Every section that reads for itself
 * keeps its own Suspense boundary, as it has on the page.
 */

const forbidden = (
  <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />
);

/** «الفلوس» — every payment and the wallet. Both read for themselves and
 *  render a forbidden or empty state of their own. */
export function MoneyTab({ userId }: { userId: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<PaymentsSectionSkeleton />}>
        <PaymentsSection userId={userId} />
      </Suspense>
      <Suspense fallback={null}>
        <WalletSection userId={userId} />
      </Suspense>
    </div>
  );
}

/**
 * «الحساب» — the profile form (name, phone, year, stream, school…), the
 * password, the devices, the role, and ban / delete — in the page's order,
 * destructive last.
 *
 * A delete `redirect()`s to `/admin/students` exactly as it does from the
 * page: the conversation it was opened from is gone with the account.
 */
export async function AccountTab({ student }: { student: AdminStudentDetail }) {
  const [taxonomy, devices, session] = await Promise.all([
    getTaxonomyOrNull(),
    adminGetOrForbidden(`/api/admin/students/${encodeURIComponent(student.id)}/sessions`, SessionDeviceListSchema).catch(
      () => null,
    ),
    getSession(),
  ]);
  const roleDoor = can(session, 'student:role-change') ? 'admin' : can(session, 'staff:manage') ? 'staff' : null;
  const governorateOptions = (taxonomy?.governorates ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ value: g.code, label: g.nameAr }));

  return (
    <div className="flex flex-col gap-5">
      <StudentDetailForm student={student} governorateOptions={governorateOptions} />
      <SetPasswordSection student={student} />
      {devices === null ? (
        forbidden
      ) : (
        <DevicesSection
          userId={student.id}
          devices={devices}
          maxDevices={student.maxDevices}
          canManage={can(session, 'student:write')}
        />
      )}
      {roleDoor ? <RoleChangeSection student={student} mode={roleDoor} /> : null}
      <AccountAccessSection student={student} />
    </div>
  );
}

/** «النشاط» — the account's history, centre attendance and games. */
export async function ActivityTab({ userId }: { userId: string }) {
  let history;
  try {
    history = await adminGetOrForbidden(
      `/api/admin/students/${encodeURIComponent(userId)}/history`,
      z.array(StudentHistoryEntrySchema),
    );
  } catch {
    history = undefined;
  }

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={null}>
        <CenterAttendanceSection userId={userId} />
      </Suspense>
      <Suspense fallback={null}>
        <GamesSection userId={userId} />
      </Suspense>
      {history === undefined ? (
        <PanelNotice title={c.unavailable} />
      ) : history === null ? (
        forbidden
      ) : (
        <HistorySection entries={history} />
      )}
    </div>
  );
}
