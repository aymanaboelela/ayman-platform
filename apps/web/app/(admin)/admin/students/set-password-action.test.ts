import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';

vi.mock('@/lib/revalidate-screen', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const adminSend = vi.fn();
vi.mock('@/lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin-api')>('@/lib/admin-api');
  return { ...actual, adminSend: (...args: unknown[]) => adminSend(...args) };
});

const { setStudentPasswordAction } = await import('./actions');
const { AdminApiError } = await import('@/lib/admin-api');

afterEach(() => {
  vi.clearAllMocks();
});

function formDataOf(newPassword: string, confirmPassword = newPassword): FormData {
  const fd = new FormData();
  fd.set('newPassword', newPassword);
  fd.set('confirmPassword', confirmPassword);
  return fd;
}

/**
 * «مستر محمد عادل» — the platform's own seeded owner account — turns up in
 * `/admin/students?q=` alongside real students, and `<SetPasswordSection>`
 * now refuses to render on a non-student target for exactly this reason. This
 * is the fallback layer: if that guard is ever bypassed, the message must
 * still be true rather than «نحاول تاني» on a refusal retrying cannot fix.
 */
describe('setStudentPasswordAction — a target that is not a student', () => {
  it('says the account cannot take a password here, not "try again"', async () => {
    adminSend.mockRejectedValue(
      new AdminApiError('Forbidden', 403, { message: 'passwords can only be set on student accounts' }),
    );

    const result = await setStudentPasswordAction('owner-1', formDataOf('a-real-password-123'));

    expect(result).toEqual({ ok: false, message: copy.admin.students.setPasswordNotStudent });
  });

  it('keeps the generic message for an unrelated failure', async () => {
    adminSend.mockRejectedValue(new AdminApiError('Server error', 500, null));

    const result = await setStudentPasswordAction('student-1', formDataOf('a-real-password-123'));

    expect(result).toEqual({ ok: false, message: copy.admin.students.setPasswordFailed });
  });

  it('still catches a plain mismatch before the request is even sent', async () => {
    const result = await setStudentPasswordAction('student-1', formDataOf('one-password', 'another'));

    expect(result).toEqual({ ok: false, message: copy.admin.students.setPasswordMismatch });
    expect(adminSend).not.toHaveBeenCalled();
  });
});
