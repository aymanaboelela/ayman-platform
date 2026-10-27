/**
 * The page an account outside the teaching team lands on — its own shell,
 * not the dashboard and not the student pages.
 *
 * A graphic designer (`designer`) and a video editor (`video_editor`) hold
 * their one section's permissions and no `admin:access`. Sending them to
 * `/dashboard` first meant the student shell's loading screen, then a server
 * redirect to where they were always going — «بشوف لودنج كدا بتاع صفحة
 * الطالب وبعد كدا بيشوفه». Pure and dependency-free, because three places ask
 * the same question at three different moments: the login form (`lib/
 * onboarding-redirect.ts`), the proxy (`proxy.ts`) and the dashboard page
 * itself (`lib/dashboard-access.ts`).
 */
export function staffShellFor(permissions: readonly string[]): '/studio' | '/montage' | null {
  if (permissions.includes('admin:access')) return null;
  if (permissions.includes('design:read')) return '/studio';
  if (permissions.includes('montage:read')) return '/montage';
  return null;
}
