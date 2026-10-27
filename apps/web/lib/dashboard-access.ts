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

/**
 * Where an account that cannot open the dashboard goes instead.
 *
 * A graphic designer (`designer`) holds the studio and nothing else — no
 * `admin:access` — so sending them to `/admin` was a 404 straight after
 * signing in. Everyone else who lands here is staff with the dashboard.
 */
export function landingForStaff(session: SessionUser | null): '/admin' | '/studio' | '/montage' {
  if (session && !can(session, 'admin:access')) {
    if (can(session, 'design:read')) return '/studio';
    // The video editor (`video_editor`) — «المونتاج» and nothing else.
    if (can(session, 'montage:read')) return '/montage';
  }
  return '/admin';
}
