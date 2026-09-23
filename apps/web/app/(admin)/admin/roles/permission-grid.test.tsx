import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import type { RoleGrantsRead } from '@ayman/contracts/admin/roles';
import { PermissionGrid } from './permission-grid';

afterEach(cleanup);

const c = copy.admin.roles;

const GRANTS: RoleGrantsRead = {
  role: 'owner',
  baseline: ['course:read', 'lesson:write'],
  granted: ['payment:read'],
  grantable: ['payment:read', 'payment:review', 'expense:read'],
};

/**
 * شاشة «المساعد يقدر يعمل إيه».
 *
 * اللي بيقرا الشاشة دي بياخد قرار عن مين يوصل لفلوسه. فاللي بيتحمى هنا مش
 * إن المربعات بترسم — إنها بتقول **الجملة الصح**، وإن اللي مش قابل للتغيير
 * باين على إنه كده.
 */
describe('the permission grid', () => {
  it('names permissions the way the instructor speaks, not the way the code does', () => {
    render(<PermissionGrid grants={GRANTS} />);

    // `payment:review` → «المدفوعات · يراجع»، مش «payment review».
    expect(screen.getAllByText(c.group.payment).length).toBeGreaterThan(0);
    expect(screen.getByText(c.action.review)).toBeTruthy();
    expect(screen.queryByText('payment:review')).toBeNull();
  });

  /*
   * البايسلاين معروض ومقفول.
   *
   * إخفاؤه كان هيخلّي الشاشة تقرا كأن المساعد مالوش أي صلاحية لحد ما تفتحله
   * — وهو فعلًا بيدرّس ويصحّح من غير ما تلمس حاجة. وعرضه كمربع شغّال كان
   * هيوعد بتحكّم مش موجود: البايسلاين مكتوب في الكود.
   */
  it('shows the baseline as fixed, never as something to switch off', () => {
    const { container } = render(<PermissionGrid grants={GRANTS} />);

    expect(screen.getByText(c.baselineTitle)).toBeTruthy();
    expect(screen.getByText(c.baselineHint)).toBeTruthy();
    // مربعات الاختيار للـ`grantable` بس — تلاتة، مش خمسة.
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(
      GRANTS.grantable.length,
    );
  });

  /* اللي مفتوح بالفعل بيبان مفتوح — الشاشة بتعرض الحالة، مش بتبدأ من فاضي. */
  it('starts from what is already open, not from nothing', () => {
    const { container } = render(<PermissionGrid grants={GRANTS} />);
    const checked = container.querySelectorAll('[role="checkbox"][data-state="checked"]');
    expect(checked).toHaveLength(GRANTS.granted.length);
  });

  /* رول مفيهوش حاجة تتفتح بيقول كده، مش بيرسم شبكة فاضية وزرار حفظ. */
  it('says so plainly when there is nothing left to open', () => {
    render(<PermissionGrid grants={{ ...GRANTS, granted: [], grantable: [] }} />);
    expect(screen.getByText(c.empty)).toBeTruthy();
    expect(screen.queryByText(c.save)).toBeNull();
  });
});
