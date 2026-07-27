import {
  ClipboardList,
  FileImage,
  Flag,
  GraduationCap,
  Home,
  LayoutDashboard,
  ListTree,
  ScrollText,
  Scale,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts';

export interface AdminNavItem {
  href: string;
  labelAr: string;
  icon: LucideIcon;
  /** Rendered only if the session holds this. The API re-checks regardless. */
  permission: string;
}

/**
 * One table, consumed by the sidebar, the breadcrumb resolver AND the
 * command palette (Task 16). Three copies of this list would drift within a
 * week. Icons are lucide components — never emoji (Global Constraint 9).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', labelAr: copy.admin.nav.overview, icon: LayoutDashboard, permission: 'admin:access' },
  { href: '/admin/students', labelAr: copy.admin.nav.students, icon: Users, permission: 'student:read' },
  {
    href: '/admin/attempts',
    labelAr: copy.admin.nav.attempts,
    icon: ClipboardList,
    permission: 'attempt:read',
  },
  { href: '/admin/appeals', labelAr: copy.admin.nav.appeals, icon: Scale, permission: 'appeal:read' },
  {
    href: '/admin/taxonomy',
    labelAr: copy.admin.nav.taxonomy,
    icon: GraduationCap,
    permission: 'taxonomy:read',
  },
  { href: '/admin/home', labelAr: copy.admin.nav.home, icon: Home, permission: 'home:read' },
  {
    href: '/admin/navigation',
    labelAr: copy.admin.nav.navigation,
    icon: ListTree,
    permission: 'nav:read',
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
  },
  { href: '/admin/flags', labelAr: copy.admin.nav.flags, icon: Flag, permission: 'flags:read' },
  { href: '/admin/media', labelAr: copy.admin.nav.media, icon: FileImage, permission: 'media:read' },
  { href: '/admin/audit', labelAr: copy.admin.nav.audit, icon: ScrollText, permission: 'audit:read' },
] as const;
