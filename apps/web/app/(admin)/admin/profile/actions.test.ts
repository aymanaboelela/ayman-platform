import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('updateAdminProfileAction', () => {
  it('updates profile successfully when input is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(MOCK_PROFILE)),
    );

    const result = await updateAdminProfileAction({
      name: 'أحمد محمود',
      phoneNumber: '+201012345678',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('أحمد محمود');
      expect(result.data.id).toBe('usr-admin-1');
    }
  });

  it('fails with validation error if name is too short', async () => {
    const result = await updateAdminProfileAction({
      name: 'أ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('حرفين على الأقل');
    }
  });

  it('handles 409 conflict when phone number is already taken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 409, message: 'Phone number already exists' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const result = await updateAdminProfileAction({
      name: 'أحمد محمود',
      phoneNumber: '+201012345678',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('مستخدم بالفعل');
    }
  });
});

describe('changeAdminPasswordAction', () => {
  it('changes password successfully when valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          Response.json({
            status: true,
            message: 'تم تغيير كلمة المرور بنجاح',
          }),
      ),
    );

    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe(true);
    }
  });

  it('fails with validation error when new password is too short', async () => {
    const result = await changeAdminPasswordAction({
      currentPassword: 'CurrentPassword123!',
      newPassword: 'short',
      revokeOtherSessions: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('8 أحرف');
    }
  });

  it('surfaces backend error message when current password is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ statusCode: 400, message: 'كلمة المرور الحالية غير صحيحة' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const result = await changeAdminPasswordAction({
      currentPassword: 'WrongPassword!',
      newPassword: 'NewPassword123!',
      revokeOtherSessions: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('كلمة المرور الحالية غير صحيحة');
    }
  });
});
