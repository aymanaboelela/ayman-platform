import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { copy } from '@ayman/contracts/copy/admin';
import type { SessionDevice } from '@ayman/contracts/sessions';

type Result = { ok: true } | { ok: false; message: string };

const revokeOne = vi.fn<(userId: string, deviceId: string) => Promise<Result>>();
const revokeAll = vi.fn<(userId: string) => Promise<Result>>();
const setLimit = vi.fn<(userId: string, formData: FormData) => Promise<Result>>();

/*
 * الأكشنز سيرفر أكشنز فبتتبدّل — اللي بيتقاس هنا هو اللي الكارت بيعمله:
 * بيسأل قبل ما يقفل، بيبعت أنهي جهاز، وبيقول الحد الحقيقي.
 */
vi.mock('../actions', () => ({
  revokeStudentDeviceAction: (userId: string, deviceId: string) => revokeOne(userId, deviceId),
  revokeAllStudentDevicesAction: (userId: string) => revokeAll(userId),
  setStudentDeviceLimitAction: (userId: string, formData: FormData) => setLimit(userId, formData),
}));

const { DevicesSection } = await import('./devices-section');

afterEach(() => {
  cleanup();
  revokeOne.mockReset();
  revokeAll.mockReset();
  setLimit.mockReset();
});

const c = copy.admin.settings;

function device(id: string, deviceName: string): SessionDevice {
  return {
    id,
    deviceName,
    deviceType: 'mobile',
    ip: null,
    lastSeenAt: '2026-09-28T10:00:00.000Z',
    loggedInAt: '2026-09-20T10:00:00.000Z',
    isCurrent: false,
  };
}

const PHONE = device('d-phone', 'Chrome على Android');
const TABLET = device('d-tablet', 'Safari على iOS');

function renderSection(
  props: Partial<{ devices: SessionDevice[]; maxDevices: number | null; canManage: boolean }> = {},
) {
  return render(
    <DevicesSection
      userId="student-1"
      devices={props.devices ?? [PHONE, TABLET]}
      maxDevices={props.maxDevices ?? null}
      canManage={props.canManage ?? true}
    />,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

describe('the limit line says this account\'s real limit', () => {
  it('an untouched account reads the default — two', () => {
    renderSection({ maxDevices: null });
    expect(screen.getByText('الحساب مسموح له بـجهازين.')).toBeInTheDocument();
  });

  it('a raised account reads its own number, in Arabic digits and the plural', () => {
    renderSection({ maxDevices: 4 });
    expect(screen.getByText('الحساب مسموح له بـ٤ أجهزة.')).toBeInTheDocument();
  });

  it('one is «جهاز واحد», not «١ أجهزة»', () => {
    renderSection({ maxDevices: 1 });
    expect(screen.getByText('الحساب مسموح له بـجهاز واحد.')).toBeInTheDocument();
  });
});

describe('«سجّل خروج» from one device', () => {
  it('asks first, naming the device, and signs nothing out on the first press', () => {
    renderSection();

    fireEvent.click(within(rowOf(PHONE.deviceName)).getByRole('button', { name: c.studentDevicesSignOut }));

    expect(
      screen.getByText(`نسجّل خروج الحساب من «${PHONE.deviceName}»؟`, { exact: false }),
    ).toBeInTheDocument();
    expect(revokeOne).not.toHaveBeenCalled();
  });

  it('signs out THAT device of THIS account on the confirm', async () => {
    revokeOne.mockResolvedValue({ ok: true });
    renderSection();

    fireEvent.click(within(rowOf(TABLET.deviceName)).getByRole('button', { name: c.studentDevicesSignOut }));
    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesSignOutYes }));

    await waitFor(() => expect(revokeOne).toHaveBeenCalledWith('student-1', TABLET.id));
    expect(revokeOne).toHaveBeenCalledTimes(1);
  });

  it('cancel closes the question and calls nothing', () => {
    renderSection();

    fireEvent.click(within(rowOf(PHONE.deviceName)).getByRole('button', { name: c.studentDevicesSignOut }));
    fireEvent.click(screen.getByRole('button', { name: copy.admin.actions.cancel }));

    expect(screen.queryByRole('button', { name: c.studentDevicesSignOutYes })).not.toBeInTheDocument();
    expect(revokeOne).not.toHaveBeenCalled();
  });

  it('says why when the API refuses', async () => {
    revokeOne.mockResolvedValue({ ok: false, message: c.studentDevicesOutranked });
    renderSection();

    fireEvent.click(within(rowOf(PHONE.deviceName)).getByRole('button', { name: c.studentDevicesSignOut }));
    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesSignOutYes }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(c.studentDevicesOutranked));
  });
});

describe('«سجّل خروج من كل الأجهزة»', () => {
  it('asks, then signs the whole account out', async () => {
    revokeAll.mockResolvedValue({ ok: true });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesSignOutAll }));
    expect(screen.getByText(c.studentDevicesSignOutAllAsk)).toBeInTheDocument();
    expect(revokeAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesSignOutYes }));
    await waitFor(() => expect(revokeAll).toHaveBeenCalledWith('student-1'));
  });

  // With one device it is the row's own button a second time.
  it('is not offered for a single device', () => {
    renderSection({ devices: [PHONE] });
    expect(screen.queryByRole('button', { name: c.studentDevicesSignOutAll })).not.toBeInTheDocument();
  });
});

describe('the limit control', () => {
  it('starts on «الافتراضي» for an untouched account and saves a raised limit', async () => {
    setLimit.mockResolvedValue({ ok: true });
    renderSection({ maxDevices: null });

    const select = screen.getByLabelText(c.studentDevicesLimitLabel) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getByRole('option', { name: 'الافتراضي (جهازين)' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesLimitSave }));

    await waitFor(() => expect(setLimit).toHaveBeenCalledTimes(1));
    const [userId, formData] = setLimit.mock.calls[0]!;
    expect(userId).toBe('student-1');
    expect(formData.get('maxDevices')).toBe('5');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(c.studentDevicesLimitSaved));
  });

  it('offers every value from one to ten, and shows a stored override as picked', () => {
    renderSection({ maxDevices: 7 });

    const select = screen.getByLabelText(c.studentDevicesLimitLabel) as HTMLSelectElement;
    expect(select.value).toBe('7');
    // «الافتراضي» plus 1..10.
    expect(within(select).getAllByRole('option')).toHaveLength(11);
  });

  it('sends «الافتراضي» as an empty value, which the action turns into null', async () => {
    setLimit.mockResolvedValue({ ok: true });
    renderSection({ maxDevices: 3 });

    fireEvent.change(screen.getByLabelText(c.studentDevicesLimitLabel), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesLimitSave }));

    await waitFor(() => expect(setLimit).toHaveBeenCalledTimes(1));
    expect(setLimit.mock.calls[0]![1].get('maxDevices')).toBe('');
  });

  it('says so when the save fails', async () => {
    setLimit.mockResolvedValue({ ok: false, message: c.studentDevicesLimitFailed });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: c.studentDevicesLimitSave }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(c.studentDevicesLimitFailed));
  });
});

describe('an operator who may only read', () => {
  it('sees the devices and the limit, and not one control', () => {
    renderSection({ canManage: false, maxDevices: 3 });

    expect(screen.getByText(PHONE.deviceName)).toBeInTheDocument();
    expect(screen.getByText('الحساب مسموح له بـ٣ أجهزة.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(c.studentDevicesLimitLabel)).not.toBeInTheDocument();
  });
});
