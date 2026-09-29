import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@ayman/contracts/copy/admin';

type SearchResult =
  | { ok: true; rows: { id: string; name: string; phone: string }[] }
  | { ok: false; message: string };

const searched = vi.fn<(q: string) => Promise<SearchResult>>();
const roleSet = vi.fn<(userId: string, role: string, reason: string) => Promise<{ ok: true } | { ok: false; message: string }>>();

/*
 * الأكشنز سيرفر أكشنز فبتتبدّل — اللي بيتقاس هنا هو اللي الشاشة بتعمله
 * بردودها: بتعرض إيه، وبتبعت إيه.
 */
vi.mock('./actions', () => ({
  searchAccountsAction: (q: string) => searched(q),
  setStaffRoleAction: (userId: string, role: string, reason: string) => roleSet(userId, role, reason),
  getMemberPermissionsAction: async () => ({ ok: false as const, message: 'x' }),
  setMemberPermissionsAction: async () => ({ ok: true as const }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { StaffSection } = await import('./staff-section');

afterEach(() => {
  cleanup();
  searched.mockReset();
  roleSet.mockReset();
});

const c = copy.admin.roles.staff;
const member = copy.admin.roles.member;

const MEMBERS = [
  { id: 'me', name: 'صاحب المنصة', phone: '01000000001', role: 'admin' },
  { id: 'other-admin', name: 'أدمن تاني', phone: '01000000002', role: 'admin' },
  { id: 'assistant', name: 'محمد المساعد', phone: '01000000003', role: 'owner' },
];

function renderSection() {
  return render(<StaffSection members={MEMBERS} currentUserId="me" reasonMin={8} />);
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText(c.searchLabel), { target: { value } });
}

/**
 * «كتبت امجد ومفيش حاجة طلعت».
 *
 * البحث كان بيقرا `role` من كل صف، والقايمة مابترجّعوش — فالسكيما كانت بتقع،
 * والشاشة بتطبع «مقدرناش نغيّر الدور» مكان النتايج. اللي بيتحمى هنا إن النتايج
 * **بتظهر**، وإن الغلط لو حصل بيقول الحقيقة.
 */
describe('staff search', () => {
  it('lists the accounts the search found', async () => {
    searched.mockResolvedValue({
      ok: true,
      rows: [{ id: 'amgad', name: 'أمجد سامي', phone: '+201010017537' }],
    });
    renderSection();

    type('امجد');

    await waitFor(() => expect(screen.getByText('أمجد سامي')).toBeInTheDocument());
    expect(searched).toHaveBeenCalledWith('امجد');
    expect(screen.queryByText(c.failed)).not.toBeInTheDocument();
    // الصف كله بالحرف — اسم، موبايل، زرار. أول نسخة من الإصلاح كان فيها `"`
    // شارد في الـJSX، وماطلعش غير في المتصفح.
    expect(screen.getByText('أمجد سامي').closest('li')?.textContent).toBe(`أمجد سامي+201010017537${c.add}`);
  });

  it('says the search failed — not that a role change did', async () => {
    searched.mockResolvedValue({ ok: false, message: c.searchFailed });
    renderSection();

    type('امجد');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(c.searchFailed));
    expect(screen.queryByText(c.failed)).not.toBeInTheDocument();
  });

  it('clears the failure as soon as the teacher types again', async () => {
    searched.mockResolvedValueOnce({ ok: false, message: c.searchFailed });
    renderSection();

    type('امجد');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    searched.mockResolvedValueOnce({ ok: true, rows: [] });
    type('امجد س');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(c.noResults)).toBeInTheDocument());
  });

  it('asks the server once the teacher pauses, not on every letter', async () => {
    searched.mockResolvedValue({ ok: true, rows: [] });
    renderSection();

    type('ام');
    type('امج');
    type('امجد');

    await waitFor(() => expect(screen.getByText(c.noResults)).toBeInTheDocument());
    expect(searched).toHaveBeenCalledTimes(1);
    expect(searched).toHaveBeenCalledWith('امجد');
  });

  it('does not enable «ضيفه» until the reason is as long as the server requires', async () => {
    searched.mockResolvedValue({ ok: true, rows: [{ id: 'amgad', name: 'أمجد سامي', phone: '+20101' }] });
    roleSet.mockResolvedValue({ ok: true });
    renderSection();

    type('امجد');
    await waitFor(() => expect(screen.getByText('أمجد سامي')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: c.add }));

    // الزرار التاني «ضيفه للفريق» — اللي تحت السبب.
    const confirm = () => screen.getAllByRole('button', { name: c.add }).at(-1)!;
    expect(confirm()).toBeDisabled();

    // «سبب تاني…» — the free text still has to be as long as the server wants.
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: '__other__' } });
    fireEvent.change(screen.getByLabelText(c.reasonOtherLabel), { target: { value: 'مساعد' } });
    expect(confirm()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(c.reasonOtherLabel), { target: { value: 'مساعد تصحيح' } });
    expect(confirm()).toBeEnabled();
    await act(async () => {
      fireEvent.click(confirm());
    });

    expect(roleSet).toHaveBeenCalledWith('amgad', 'owner', 'مساعد تصحيح');
    await waitFor(() => expect(screen.getByText(c.added)).toBeInTheDocument());
  });
});

/**
 * «شيله من الفريق».
 *
 * الزرار كان بيبعت «—» كسبب والسيرفر بيطلب ٨ حروف، فالشيل ماكانش بيشتغل ولا
 * مرة. دلوقتي بيسأل عن السبب، وبيبعته هو.
 */
/**
 * «متعمل دي دروب داون ليت فيها حاجات» — the reason is a choice.
 */
describe('the reason dropdown', () => {
  it('sends a ready reason in one choice, no typing', async () => {
    searched.mockResolvedValue({ ok: true, rows: [{ id: 'amgad', name: 'أمجد سامي', phone: '+20101' }] });
    roleSet.mockResolvedValue({ ok: true });
    renderSection();

    type('امجد');
    await waitFor(() => expect(screen.getByText('أمجد سامي')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: c.add }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: c.addReasons[0] } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: c.add }).at(-1)!);
    });

    expect(roleSet).toHaveBeenCalledWith('amgad', 'owner', c.addReasons[0]);
  });

  it('offers only reasons the server accepts as they are', () => {
    for (const reason of [...c.addReasons, ...c.removeReasons]) {
      expect(reason.trim().length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('removing an assistant', () => {
  it('asks for a reason first and sends that reason', async () => {
    roleSet.mockResolvedValue({ ok: true });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: c.remove }));
    expect(roleSet).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', { name: c.confirmRemove });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: c.removeReasons[0] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: c.confirmRemove }));
    });

    expect(roleSet).toHaveBeenCalledWith('assistant', 'student', c.removeReasons[0]);
    await waitFor(() => expect(screen.getByText(c.removed)).toBeInTheDocument());
  });

  it('shows a failed change as a failure', async () => {
    roleSet.mockResolvedValue({ ok: false, message: c.failed });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: c.remove }));
    fireEvent.change(screen.getByLabelText(c.reasonLabel), { target: { value: c.removeReasons[0] } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: c.confirmRemove }));
    });

    await waitFor(() => expect(screen.getByText(c.failed)).toHaveClass('text-danger'));
  });

  it('offers no buttons on an admin — nothing on this screen applies to one', () => {
    renderSection();

    // تلاتة في الفريق، واحد بس مساعد: زرار «شيله» واحد، و«الصلاحيات» واحد.
    expect(screen.getAllByRole('button', { name: c.remove })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: member.open })).toHaveLength(1);
    expect(screen.getAllByText(member.adminHasEverything)).toHaveLength(2);
    expect(screen.getByText(c.you)).toBeInTheDocument();
  });
});

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
        reasonMin={8}
      />,
    );
    expect(screen.getByRole('button', { name: member.open })).toBeInTheDocument();
  });

  it('never offers it for an admin account, and says why', () => {
    render(
      <StaffSection
        members={[{ id: 'u2', name: 'أيمن', phone: '0100', role: 'admin' }]}
        currentUserId="me"
        reasonMin={8}
      />,
    );
    expect(screen.queryByRole('button', { name: member.open })).not.toBeInTheDocument();
    // والسبب مكتوب — مش زرار مقفول من غير تفسير.
    expect(screen.getByText(member.adminHasEverything)).toBeInTheDocument();
  });

  it('never offers it for the stack owner either', () => {
    /*
     * ⚠️ الحالة دي هي اللي بتحصل عند عادل وصبري: المدرّس والمساعد **نفس
     * الرول** (`owner`)، فمن غير العلامة دي المساعد كان بيشوف زرار على
     * المدرّس — ولو قفل عليه، مفيش حساب `admin` هناك يرجّعه.
     */
    render(
      <StaffSection
        members={[{ id: 'teacher', name: 'عادل', phone: '0100', role: 'owner' }]}
        currentUserId="assistant"
        founderId="teacher"
        reasonMin={8}
      />,
    );
    expect(screen.queryByRole('button', { name: member.open })).not.toBeInTheDocument();
    expect(screen.getByText(member.adminHasEverything)).toBeInTheDocument();
  });

  it('still offers it for an assistant who is not the stack owner', () => {
    render(
      <StaffSection
        members={[{ id: 'assistant', name: 'محمد', phone: '0100', role: 'owner' }]}
        currentUserId="teacher"
        founderId="teacher"
        reasonMin={8}
      />,
    );
    expect(screen.getByRole('button', { name: member.open })).toBeInTheDocument();
  });

  it('does not offer removal on an admin account either', () => {
    render(
      <StaffSection
        members={[{ id: 'u2', name: 'أيمن', phone: '0100', role: 'admin' }]}
        currentUserId="me"
        reasonMin={8}
      />,
    );
    // ⚠️ كان بيتعرض هنا، والسيرفر دلوقتي بيرفض شيل أدمن من الباب ده
    // (`setStaffRole` → 403). زرار بيوعد بحاجة مش هتحصل أوحش من مفيش زرار.
    expect(screen.queryByRole('button', { name: c.remove })).not.toBeInTheDocument();
  });
});
