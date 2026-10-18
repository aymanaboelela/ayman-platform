import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminProfile } from '@ayman/contracts/admin/profile';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminProfileForm } from './admin-profile-form';
import { updateAdminProfileAction } from '@/app/(admin)/admin/profile/actions';

vi.mock('@/app/(admin)/admin/profile/actions', () => ({ updateAdminProfileAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUpdate = vi.mocked(updateAdminProfileAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A phone stored as typed, before the API normalised — it no longer would. */
const PROFILE: AdminProfile = {
  id: 'admin-1',
  name: 'مدرس المادة',
  email: 'admin@example.test',
  phoneNumber: '010 1234 567',
  role: 'admin',
  image: null,
  createdAt: '2026-08-13T10:00:00.000Z',
  activeSessionsCount: 1,
  permissions: [],
};

function saved(phoneNumber: string | null, name = PROFILE.name) {
  return { ok: true as const, data: { ...PROFILE, name, phoneNumber } };
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: copy.admin.profile.saveProfile }));
}

describe('AdminProfileForm — the phone goes only when it was edited', () => {
  it('saves a new name without resending a stored phone the API would now refuse', async () => {
    mockUpdate.mockResolvedValueOnce(saved(PROFILE.phoneNumber, 'اسم جديد'));
    render(<AdminProfileForm profile={PROFILE} />);

    fireEvent.change(screen.getByLabelText(copy.admin.profile.name), { target: { value: 'اسم جديد' } });
    submit();

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0]![0]).toEqual({ name: 'اسم جديد' });
  });

  it('sends an edited phone, then compares with what the server kept', async () => {
    mockUpdate.mockResolvedValueOnce(saved('+201012345678'));
    mockUpdate.mockResolvedValueOnce(saved('+201012345678'));
    render(<AdminProfileForm profile={PROFILE} />);

    const phone = screen.getByLabelText(copy.admin.profile.phone) as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '01012345678' } });
    submit();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0]![0]).toEqual({ name: PROFILE.name, phoneNumber: '01012345678' });

    // The box now shows the stored E.164, and a second save leaves it alone.
    await waitFor(() => expect(phone.value).toBe('+201012345678'));
    // The box can update before the transition ends, while the button still
    // reads «بنحفظ…» — wait for the button to be back, or the second click
    // finds nothing on a slow runner (it failed CI twice on #666).
    await screen.findByRole('button', { name: copy.admin.profile.saveProfile });
    submit();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockUpdate.mock.calls[1]![0]).toEqual({ name: PROFILE.name });
  });

  it('sends a cleared phone as null — clearing is an edit too', async () => {
    mockUpdate.mockResolvedValueOnce(saved(null));
    render(<AdminProfileForm profile={PROFILE} />);

    fireEvent.change(screen.getByLabelText(copy.admin.profile.phone), { target: { value: '  ' } });
    submit();
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0]![0]).toEqual({ name: PROFILE.name, phoneNumber: null });
  });
});
