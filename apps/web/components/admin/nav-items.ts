import {
  AlertTriangle,
  BookMarked,
  CalendarClock,
  ChartColumn,
  ClipboardList,
  Coins,
  FileImage,
  Flag,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  ListTree,
  ScrollText,
  Send,
  Settings,
  SquarePen,
  Users,
  type LucideIcon,
  Megaphone,
  Newspaper,
  NotebookPen,
  PackageOpen,
  Wallet,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';

/**
 * Which sidebar block a link sits in. `overview` is its own group of one and
 * renders above the headings, because it is the destination the crumb trail
 * always starts from rather than a peer of the sections.
 */
export type AdminNavGroup = 'overview' | 'teaching' | 'marketing' | 'site' | 'system';

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
    // Vodafone Cash review queue. Beside «الطلبة»: it is a per-student
    // decision (approve/reject a claim), same shape as the record it opens
    // from, but its own screen because it is a QUEUE — someone waiting on a
    // decision, like the inbox below it.
    href: '/admin/payments',
    labelAr: copy.admin.nav.payments,
    icon: Wallet,
    permission: 'payment:read',
    group: 'teaching',
  },
  {
    // «الاشتراكات والإيرادات» — directly under the review queue: `payments`
    // decides a CLAIM, this reports the subscriptions those decisions
    // produced. Same `payment:read`, deliberately — see the controller's own
    // note on why this is not a second permission.
    href: '/admin/finance',
    labelAr: copy.admin.nav.finance,
    icon: Coins,
    permission: 'payment:read',
    group: 'teaching',
  },
  {
    // الكتاب الورقي — a shipping queue, same shape as the payment review
    // queue above but its own permission: shipping a book decides nothing
    // about money or platform access, so it never needed `payment:*`.
    href: '/admin/books',
    labelAr: copy.admin.nav.books,
    icon: PackageOpen,
    permission: 'book-order:read',
    group: 'teaching',
  },
  {
    // الواجب — the review queue. Beside «أوراق الامتحانات» because the two are
    // the same act on two kinds of work: something a student handed in that is
    // waiting on a mark. Its own permission, so a role that may look at exam
    // papers does not silently gain the ability to delete a student's uploads.
    href: '/admin/homework',
    labelAr: copy.admin.nav.homework,
    icon: NotebookPen,
    permission: 'homework:read',
    group: 'teaching',
  },
  {
    // امتحانات الشهر — and the ONLY door to a monthly exam. `LESSON_KINDS` in
    // the lesson panel is `['video','text','attachment']` on purpose, so there
    // is no path through the course editor that can author one; without this
    // row the screen exists and cannot be reached.
    //
    // ⚠️ `quiz:write`, NOT `quiz:read`. `quiz:read` is in the STUDENT
    // permission set (`apps/api/src/auth/permissions.ts`), so gating this on it
    // would render an admin link for every signed-in student whose session
    // reached the sidebar — the exact bug the courses row above documents for
    // `course:read` vs `course:read-admin`. `AdminExamsController` carries
    // `quiz:write`; the sidebar asks for the same thing.
    href: '/admin/exams',
    labelAr: copy.admin.nav.monthlyExams,
    icon: CalendarClock,
    permission: 'quiz:write',
    group: 'teaching',
  },
  {
    // تصحيح الورق — the essay queue. Directly under «امتحانات الشهر» because it
    // is the other half of one paper: what he sets, and what comes back needing
    // a human. Its own permission, `attempt:grade`, so a role that may author a
    // paper does not automatically hold the pen that moves a student's score.
    href: '/admin/grading',
    labelAr: copy.admin.nav.grading,
    icon: SquarePen,
    permission: 'attempt:grade',
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
    // «رسايل م. أيمن». Directly under the inbox because the two screens are
    // the two directions of one conversation — and `outreach:read`, not
    // `conversation:read`, so a support role that answers questions does not
    // silently gain an audit of everything sent in the instructor's name.
    href: '/admin/outreach',
    labelAr: copy.admin.nav.outreach,
    icon: Send,
    permission: 'outreach:read',
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
    // التسويق — الرسايل اللي بتخرج برّه المنصة. مجموعتها لوحدها ومش تحت
    // «التدريس»: دي مش رسالة بمناسبة حصلت للطالب جوه المنصة (ده outreach
    // فوق) — دي حملة بتتبعت لحد أصلاً برّه.
    href: '/admin/marketing/campaigns',
    labelAr: copy.admin.nav.marketing,
    icon: Megaphone,
    permission: 'marketing:read',
    group: 'marketing',
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
  { id: 'marketing', labelAr: copy.admin.nav.groupMarketing },
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
