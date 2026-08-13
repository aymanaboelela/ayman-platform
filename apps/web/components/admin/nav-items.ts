import {
  AlertTriangle,
  BookMarked,
  ChartColumn,
  ClipboardList,
  FileImage,
  Flag,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  ListTree,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
  Newspaper,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * Which sidebar block a link sits in. `overview` is its own group of one and
 * renders above the headings, because it is the destination the crumb trail
 * always starts from rather than a peer of the sections.
 */
export type AdminNavGroup = 'overview' | 'teaching' | 'site' | 'system';

export interface AdminNavItem {
  href: string;
  labelAr: string;
  icon: LucideIcon;
  /** Rendered only if the session holds this. The API re-checks regardless. */
  permission: string;
  group: AdminNavGroup;
}

/**
 * One table, consumed by the sidebar, the breadcrumb resolver AND the
 * command palette (Task 16). Three copies of this list would drift within a
 * week. Icons are lucide components — never emoji (Global Constraint 9).
 *
 * Order within the array is the render order; `ADMIN_NAV_GROUPS` below fixes
 * the order the groups themselves appear in, so neither is inferred from the
 * other.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: '/admin',
    labelAr: copy.admin.nav.overview,
    icon: LayoutDashboard,
    permission: 'admin:access',
    group: 'overview',
  },

  {
    href: '/admin/courses',
    labelAr: copy.admin.nav.courses,
    icon: BookMarked,
    // `course:read-admin`, NOT `course:read` — the latter is a STUDENT
    // permission (the player/catalog read path holds it), so gating this link
    // on it would render the admin courses link for every signed-in student
    // whose session reached this component. The route itself requires
    // `course:read-admin`; the sidebar must ask for the same thing.
    permission: 'course:read-admin',
    group: 'teaching',
  },
  {
    href: '/admin/students',
    labelAr: copy.admin.nav.students,
    icon: Users,
    permission: 'student:read',
    group: 'teaching',
  },
  {
    href: '/admin/attempts',
    labelAr: copy.admin.nav.attempts,
    icon: ClipboardList,
    permission: 'attempt:read',
    group: 'teaching',
  },
  {
    // `analytics:read` — the same permission the per-quiz item analysis
    // carries, so a role that may read one may read the other. In `teaching`
    // rather than `system`: it is about students and lessons, not about how
    // the platform is configured.
    href: '/admin/analytics',
    labelAr: copy.analytics.title,
    icon: ChartColumn,
    permission: 'analytics:read',
    group: 'teaching',
  },
  {
    // المساعد's inbox. In `teaching`, not `system`: it is student contact,
    // and it belongs beside the attempts list — the other screen where
    // someone is waiting on an answer.
    href: '/admin/inbox',
    labelAr: copy.admin.nav.inbox,
    icon: Inbox,
    permission: 'conversation:read',
    group: 'teaching',
  },
  {
    href: '/admin/taxonomy',
    labelAr: copy.admin.nav.taxonomy,
    icon: GraduationCap,
    permission: 'taxonomy:read',
    group: 'teaching',
  },

  {
    href: '/admin/home',
    labelAr: copy.admin.nav.home,
    icon: Home,
    permission: 'home:read',
    group: 'site',
  },
  {
    href: '/admin/navigation',
    labelAr: copy.admin.nav.navigation,
    icon: ListTree,
    permission: 'nav:read',
    group: 'site',
  },
  {
    href: '/admin/media',
    labelAr: copy.admin.nav.media,
    icon: FileImage,
    permission: 'media:read',
    group: 'site',
  },

  {
    // Branding, SEO and contact all live on this one screen (Task 8's stub
    // grew into the real settings editor) — the label and icon are the
    // generic "settings" pair, not the branding-only ones, now that saving a
    // logo is one section among three rather than the whole page.
    href: '/admin/settings/branding',
    labelAr: copy.admin.nav.settings,
    icon: Settings,
    permission: 'settings:read',
    group: 'system',
  },
  {
    href: '/admin/news',
    labelAr: copy.admin.nav.news,
    icon: Newspaper,
    permission: 'news:read',
    group: 'site',
  },
  {
    href: '/admin/flags',
    labelAr: copy.admin.nav.flags,
    icon: Flag,
    permission: 'flags:read',
    group: 'system',
  },
  {
    // The error log. In `system`, beside the audit trail, because both answer
    // "what happened" rather than "what should I teach" — and because during
    // an incident it is the first screen to open, so it wants to be next to
    // the other one that is read the same way.
    href: '/admin/errors',
    labelAr: copy.admin.nav.errors,
    icon: AlertTriangle,
    permission: 'diagnostics:read',
    group: 'system',
  },
  {
    href: '/admin/audit',
    labelAr: copy.admin.nav.audit,
    icon: ScrollText,
    permission: 'audit:read',
    group: 'system',
  },
] as const;

/** Render order of the sidebar blocks, and the heading each one carries. */
export const ADMIN_NAV_GROUPS: readonly { id: AdminNavGroup; labelAr: string | null }[] = [
  { id: 'overview', labelAr: null },
  { id: 'teaching', labelAr: copy.admin.nav.groupTeaching },
  { id: 'site', labelAr: copy.admin.nav.groupSite },
  { id: 'system', labelAr: copy.admin.nav.groupSystem },
] as const;

/**
 * The active link for a path. Longest matching `href` wins, so
 * `/admin/settings/branding` beats `/admin` — the sidebar, the breadcrumb and
 * the mobile sheet all have to agree on this or two things look "current" at
 * once.
 */
export function activeNavItem(pathname: string): AdminNavItem | null {
  return (
    [...ADMIN_NAV]
      .filter((item) =>
        item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href),
      )
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
