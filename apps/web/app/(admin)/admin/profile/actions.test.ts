import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminAccount } from '@ayman/contracts/copy/admin-account';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: '__Host-csrf=token' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));

const { updateAdminProfileAction, changeAdminPasswordAction } = await import('./actions');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const MOCK_PROFILE = {
  id: 'usr-admin-1',
  name: 'أحمد محمود',
  email: 'admin@platform.test',
  phoneNumber: '+201012345678',
  role: 'admin',
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  activeSessionsCount: 2,
  permissions: ['*'],
};

/** A JSON error body the way `AllExceptionsFilter` writes it — the code is the contract. */
function refusal(status: number, code: string): Response {
  return new Response(JSON.stringify({ statusCode: status, message: 'Bad Request Exception', code }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('updateAdminProfileAction', () => {
  it('updates the profile when the input is valid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(MOCK_PROFILE)));

    const result = await updateAdminProfileAction({ name: 'أحمد محمود', phoneNumber: '01012345678' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe('usr-admin-1');
  });

  it('refuses a name under two letters before anything is sent', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await updateAdminProfileAction({ name: 'أ' });

    expect(result).toEqual({ ok: false, message: adminAccount.nameTooShort });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says a taken phone number in words, from the code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => refusal(409, 'phone_taken')));

    const result = await updateAdminProfileAction({ name: 'أحمد محمود', phoneNumber: '01012345678' });

    expect(result).toEqual({ ok: false, message: adminAccount.phoneTaken });
  });
});

describe('changeAdminPasswordAction', () => {
  it('changes the password and reports how many OTHER sessions ended', async () => {
    const fetchSpy = vi.fn(async () => Response.json({ status: true, revokedSessions: 0 }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: false,
    });

    expect(result).toEqual({ ok: true, revokedSessions: 0 });
    // What was sent: the flag exactly as the form set it — never defaulted on.
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ revokeOtherSessions: false });
  });

  it('still parses a result from an API that predates `revokedSessions`', async () => {
    // A rolling deploy: the API container answers in the old shape.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: true, message: 'تم تغيير كلمة المرور بنجاح' })));

    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: false,
    });

    expect(result).toEqual({ ok: true, revokedSessions: 0 });
  });

  it('refuses a new password under 8 characters, against that field, before anything is sent', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'short',
      revokeOtherSessions: false,
    });

    expect(result).toEqual({ ok: false, field: 'next', message: adminAccount.password.errors.tooShort });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['current_password_incorrect', 'current', adminAccount.password.errors.wrongCurrent],
    ['password_unchanged', 'next', adminAccount.password.errors.sameAsCurrent],
    ['no_credential_account', null, adminAccount.password.errors.noCredential],
  ] as const)('maps the API code %s to a sentence on the right field', async (code, field, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => refusal(400, code)));

    const result = await changeAdminPasswordAction({
      currentPassword: 'WrongPassword!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: false,
    });

    expect(result).toEqual({ ok: false, field, message });
  });

  it('falls back to one plain sentence for anything else — never the transport’s text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream exploded', { status: 502 })));

    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: true,
    });

    expect(result).toEqual({ ok: false, field: null, message: adminAccount.password.errors.failed });
  });
});
