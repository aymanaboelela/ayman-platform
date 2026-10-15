import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { canOpenDashboard, DASHBOARD_PERMISSIONS } from './dashboard-access';
import type { SessionUser } from './session';

function session(role: string, permissions: readonly string[]): SessionUser {
  return {
    id: 'u1',
    email: null,
    phoneNumber: '+201000000000',
    name: 'حساب',
    image: null,
    role,
    permissions: [...permissions],
  } as SessionUser;
}

describe('canOpenDashboard', () => {
  it('lets a student in', () => {
    expect(canOpenDashboard(session('student', DASHBOARD_PERMISSIONS))).toBe(true);
  });

  it('lets the owner in — every permission, so «الصفحة كطالب» actually arrives', () => {
    expect(canOpenDashboard(session('admin', [...DASHBOARD_PERMISSIONS, 'admin:access', 'course:write']))).toBe(true);
  });

  it('turns away an assistant missing a permission the page reads with (#603)', () => {
    expect(canOpenDashboard(session('owner', ['admin:access', 'student:read', 'payment:read']))).toBe(false);
    expect(canOpenDashboard(session('owner', ['enrollment:read', 'profile:read']))).toBe(false);
  });

  it('leaves a signed-out visitor to the page’s own sign-in handling', () => {
    expect(canOpenDashboard(null)).toBe(true);
  });
});
