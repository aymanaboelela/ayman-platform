import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';

vi.mock('../actions', () => ({ setStudentPasswordAction: vi.fn() }));

const { SetPasswordSection } = await import('./set-password-section');

afterEach(cleanup);

function student(overrides: Partial<AdminStudentDetail> = {}): AdminStudentDetail {
  return {
    id: 'u-1',
    fullName: 'طالب تجريبي',
    email: null,
    phone: '+201000000000',
    gender: 'male',
    governorateCode: '01',
    governorateNameAr: 'القاهرة',
    systemSlug: 'bacalorya',
    year: 2,
    schoolStream: null,
    trackLabelAr: null,
    onboardingCompleted: true,
    createdAt: new Date().toISOString(),
    bannedAt: null,
    role: 'student',
    schoolName: null,
    cityId: null,
    cityNameAr: null,
    studyType: null,
    attendanceMode: null,
    studentNumber: 1,
    fatherPhone: null,
    motherPhone: null,
    electiveSubjectNameAr: null,
    bannedReason: null,
    bannedByName: null,
    honorPhotoKey: null,
    maxDevices: null,
    ...overrides,
  };
}

/**
 * «مستر محمد عادل» — the platform's own seeded owner account — turns up on
 * this same detail page because `/admin/students?q=` searches staff too. The
 * API refuses a password reset on anything but a student row; this card must
 * not offer the button at all rather than let the operator press it and read
 * «مقدرناش نغيّر كلمة السر — نحاول تاني» on a refusal retrying cannot fix.
 */
describe('SetPasswordSection — who this card is for', () => {
  it('offers the button on a real student', () => {
    render(<SetPasswordSection student={student({ role: 'student' })} />);
    expect(screen.getByText(copy.admin.students.setPasswordAction)).toBeTruthy();
  });

  it('renders nothing at all for an owner or staff account', () => {
    const { container: owner } = render(<SetPasswordSection student={student({ role: 'owner' })} />);
    expect(owner.textContent).toBe('');
    cleanup();

    const { container: staff } = render(<SetPasswordSection student={student({ role: 'staff' })} />);
    expect(staff.textContent).toBe('');
  });
});
