import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@ayman/contracts/copy/admin';

vi.mock('./actions', () => ({
  searchAccountsAction: async () => ({ ok: true as const, rows: [] }),
  setStaffRoleAction: async () => ({ ok: true as const }),
}));
vi.mock('./member-permissions', () => ({
  MemberPermissions: () => <div data-testid="panel" />,
}));

const { StaffSection } = await import('./staff-section');

afterEach(cleanup);

const c = copy.admin.roles.staff;
const member = copy.admin.roles.member;

/**
 * مين بيستاهل زرار «الصلاحيات».
 *
 * ⚠️ التست ده اتكتب بعد ما البرودكشن كشف الحتة: ليستة الفريق بتتجاب بـ
 * `role=staff`، اللي معناها «أي حد مش طالب» — فحسابات **الأدمن** بتظهر
 * فيها. وعلى منصة أيمن التلات حسابات كلهم أدمن.
 *
 * فالزرار كان معروض على حاجة مستحيل تتحفظ: تدوس، تقفل «الفلوس»، تحفظ،
 * وتاخد «مقدرناش نحفظ» — من غير ما تعرف إن ده مش هيشتغل أبدًا، لأن
 * `userHasPermission` بيرجّع `true` للأدمن قبل ما يبص على جدول القفل أصلًا.
 */
describe('the staff list', () => {
  it('offers the permissions button for an assistant', () => {
    render(
      <StaffSection
        members={[{ id: 'u1', name: 'محمد', phone: '0100', role: 'owner' }]}
        currentUserId="me"
      />,
    );
    expect(screen.getByRole('button', { name: member.open })).toBeInTheDocument();
  });

  it('never offers it for an admin account, and says why', () => {
    render(
      <StaffSection
        members={[{ id: 'u2', name: 'أيمن', phone: '0100', role: 'admin' }]}
        currentUserId="me"
      />,
    );
    expect(screen.queryByRole('button', { name: member.open })).not.toBeInTheDocument();
    // والسبب مكتوب — مش زرار مقفول من غير تفسير.
    expect(screen.getByText(member.adminHasEverything)).toBeInTheDocument();
  });

  it('still lets an admin account be removed from the team', () => {
    render(
      <StaffSection
        members={[{ id: 'u2', name: 'أيمن', phone: '0100', role: 'admin' }]}
        currentUserId="me"
      />,
    );
    // ⚠️ القفل على الصلاحيات بس. «شيله من الفريق» مسار تاني خالص ولسه شغّال.
    expect(screen.getByRole('button', { name: c.remove })).toBeInTheDocument();
  });
});
