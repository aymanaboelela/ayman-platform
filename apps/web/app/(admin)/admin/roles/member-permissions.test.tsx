import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PERMISSION_CATEGORIES } from '@ayman/contracts/admin/permission-categories';
import { copy } from '@ayman/contracts/copy/admin';

const saved = vi.fn<(userId: string, permissions: string[]) => void>();

/*
 * الأكشنز سيرفر أكشنز، فبتتبدّل. اللي بيتحمى هنا هو **اللي الشاشة بتبعته**
 * — والقرار اللي المدرّس طلب الفيتشر عشانه بيتقاس على البايلود ده بالظبط.
 */
vi.mock('./actions', () => ({
  getMemberPermissionsAction: async () => ({
    ok: true as const,
    data: {
      userId: 'u1',
      name: 'محمد',
      role: 'owner',
      // أساس `owner` هو «كل حاجة إلا المقالات» — الفلوس جوّاه.
      effective: PERMISSION_CATEGORIES.flatMap((category) => category.permissions),
      baseline: PERMISSION_CATEGORIES.flatMap((category) => category.permissions),
      allowed: [],
      withheld: [],
    },
  }),
  setMemberPermissionsAction: (userId: string, permissions: string[]) => {
    saved(userId, permissions);
    return Promise.resolve({ ok: true as const });
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MemberPermissions } = await import('./member-permissions');

afterEach(() => {
  cleanup();
  saved.mockClear();
});

const c = copy.admin.roles.member;
const FINANCE = PERMISSION_CATEGORIES.find((category) => category.key === 'finance')!;

/**
 * «المساعد ده يشوف إيه».
 *
 * الفيتشر دي اتطلبت بجملة واحدة: «عايز المساعد يصحّح من غير ما يشوف الفلوس».
 * فاللي بيتحمى هنا مش إن الشيك بوكسات بترسم — إن **الفلوس فعلًا بتتقفل**،
 * وإن اللي بيتبعت للسيرفر هو اللي على الشاشة.
 */
describe('member permissions', () => {
  it('sends every permission except finance when the teaching preset is used', async () => {
    render(<MemberPermissions userId="u1" name="محمد" />);

    await waitFor(() => expect(screen.getByText(FINANCE.titleAr)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: c.presetTeaching }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: c.save }));
    });

    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    const [, sent] = saved.mock.calls[0]!;

    // ⚠️ الشرط الحقيقي: مفيش ولا صلاحية فلوس في اللي اتبعت.
    for (const permission of FINANCE.permissions) {
      expect(sent).not.toContain(permission);
    }
    // ومش شاشة فاضية — التدريس لسه كله مفتوح.
    expect(sent.length).toBeGreaterThan(20);
  });

  it('shows a section as withheld once the teacher closes it', async () => {
    render(<MemberPermissions userId="u1" name="محمد" />);

    await waitFor(() => expect(screen.getByText(FINANCE.titleAr)).toBeInTheDocument());

    // الأساس كله مفتوح، فكل الأقسام بتقرا «كله».
    expect(screen.getAllByText(c.countAll).length).toBe(PERMISSION_CATEGORIES.length);

    fireEvent.click(screen.getByRole('button', { name: c.presetTeaching }));

    // وبعد البريست، واحد بالظبط بقى «مقفول» — والباقي زي ما هو.
    expect(screen.getAllByText(c.countNone).length).toBe(1);
    expect(screen.getAllByText(c.countAll).length).toBe(PERMISSION_CATEGORIES.length - 1);
  });

  it('warns that the decision has not landed until it is saved', async () => {
    render(<MemberPermissions userId="u1" name="محمد" />);

    await waitFor(() => expect(screen.getByText(FINANCE.titleAr)).toBeInTheDocument());
    expect(screen.queryByText(c.dirty)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: c.presetTeaching }));

    // ⚠️ البريست بيعلّم وبس. من غير السطر ده المدرّس يقفل الفلوس، يسيب
    // الشاشة، ويفتكر إنها اتقفلت.
    expect(screen.getByText(c.dirty)).toBeInTheDocument();
  });
});
