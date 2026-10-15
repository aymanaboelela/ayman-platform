import { can, type SessionUser } from '@/lib/session';

/**
 * What `/dashboard`'s THROWING reads need — `/api/me/dashboard`
 * (`enrollment:read`), `/api/profile/me` (`profile:read`), `/api/me/quizzes`
 * (`quiz:read`). Every other read on the page catches its own failure.
 */
export const DASHBOARD_PERMISSIONS = ['enrollment:read', 'profile:read', 'quiz:read'] as const;

/**
 * Whether this session can open the student dashboard without it crashing.
 *
 * Asked by PERMISSION, not by role. #603 sent every non-student to `/admin`,
 * after an assistant Sabry made with six permissions crashed here on a 403.
 * That also bounced the owner, who has every permission, real enrollments and
 * quiz history — and «الصفحة كطالب» (#648) went nowhere: «بتحمل ومش بتديني
 * هناك» (2026-10-12). Assistants are role `owner` with per-account permissions
 * (see the API's `permissions.ts`), so the role never told the two apart.
 */
export function canOpenDashboard(session: SessionUser | null): boolean {
  if (session === null) return true;
  return DASHBOARD_PERMISSIONS.every((permission) => can(session, permission));
}
