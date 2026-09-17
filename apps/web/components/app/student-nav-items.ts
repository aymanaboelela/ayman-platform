import {
  BarChart3,
  BookMarked,
  BookOpen,
  LayoutDashboard,
  MonitorSmartphone,
  Route,
  Sprout,
  Terminal,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';

export interface StudentNavItem {
  href: string;
  labelAr: string;
  icon: LucideIcon;
  /** `true` when the item is only ever reached deliberately, not while
   *  studying — it renders in the rail's footer rather than its main list. */
  footer?: boolean;
}

/**
 * The signed-in student's navigation, in render order. One table, three
 * consumers: the desktop rail, the mobile sheet, and the topbar's current-page
 * title. Three copies of this list would drift within a week — the admin side
 * learned that already (`components/admin/nav-items.ts`), and this file
 * deliberately mirrors its shape so the two are read the same way.
 *
 * Icons are lucide components, never emoji (Global Constraint 9).
 *
 * No `permission` field, unlike the admin table: every entry here is reachable
 * by any signed-in student. The one privileged link in the shell — the admin
 * panel — is rendered by `<AccountMenu>`, which has the session in hand
 * anyway and checks `admin:access` there rather than teaching this table about
 * permissions for a single row.
 */
export const STUDENT_NAV: readonly StudentNavItem[] = [
  { href: '/dashboard', labelAr: copy.nav.dashboard, icon: LayoutDashboard },
  { href: '/path', labelAr: copy.nav.path, icon: Route },
  { href: '/results', labelAr: copy.nav.results, icon: BarChart3 },
  { href: '/library', labelAr: copy.nav.courses, icon: BookMarked },
  { href: '/foundations', labelAr: copy.nav.essentials, icon: Sprout },
  /*
   * `/store`, NOT `/books`, and the difference is the whole point of the
   * route.
   *
   * This entry used to send a signed-in student to `/books` — the MARKETING
   * shop, which renders in the site chrome. Pressing «الكتب» in the rail
   * therefore threw them out of the app: the rail vanished, the topbar was
   * replaced by the marketing header, and the way back was the browser's own
   * button. «متفتحهاش صفحة لوحدها», reported with a screenshot.
   *
   * `/store` is the same shop — the same `<BooksShop>`, the same `books.css` —
   * rendered inside the shell. `/books` is untouched and still the public,
   * indexed URL that the footer, the landing strip and every WhatsApp message
   * point at. See `app/(app)/store/page.tsx` for why they cannot be one route.
   *
   * `BookOpen`, not `BookMarked` — that one is «الكورسات» four rows up, and
   * two book icons in one rail is a rail nobody can scan.
   */
  { href: '/store', labelAr: copy.nav.books, icon: BookOpen },
  { href: '/playground', labelAr: copy.nav.playground, icon: Terminal },
  { href: '/profile', labelAr: copy.nav.profile, icon: UserRound, footer: true },
  { href: '/settings/devices', labelAr: copy.nav.devices, icon: MonitorSmartphone, footer: true },
] as const;

/**
 * Routes that light a nav entry they do not live under.
 *
 * The lesson player is at `/courses/:slug/lessons/:id` — a URL the student
 * reached from `/library`, which is where the shell's «الكورسات» entry points.
 * Without this the player lights nothing at all, and the rail claims the
 * student is nowhere while they are watching a lesson.
 *
 * The public `/courses` catalog is deliberately NOT listed. It renders in the
 * marketing chrome, which has no rail to light.
 */
const NAV_ALIASES: ReadonlyArray<readonly [prefix: string, href: string]> = [
  ['/courses/', '/library'],
] as const;

/**
 * The active item for a path. Longest matching `href` wins, so
 * `/settings/devices` beats nothing — the rail, the mobile sheet and the topbar
 * title all read this one function, or two things end up looking current at
 * once.
 *
 * `/dashboard` matches exactly rather than by prefix. It is the root of the
 * signed-in area, and a prefix match there would light it up on every future
 * `/dashboard/*` child alongside that child's own entry.
 */
export function activeStudentNav(pathname: string): StudentNavItem | null {
  const alias = NAV_ALIASES.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const target = alias ?? pathname;

  return (
    [...STUDENT_NAV]
      .filter((item) =>
        item.href === '/dashboard' ? target === '/dashboard' : target.startsWith(item.href),
      )
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Route rules for the shell itself.
 *
 * Both are pure string predicates rather than layout state so they can be
 * unit-tested without a render, and so the rail and the topbar cannot
 * disagree about which route they are on.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A running attempt hides the ENTIRE shell — rail and topbar both.
 *
 * `/quizzes/:lessonId/attempt/:attemptId` is a timed, graded exam: the runner
 * owns that whole viewport with its own timer, question navigator and submit
 * control, and any persistent chrome around it is one mis-click away from
 * navigating out of an attempt that is still counting down. This is the same
 * rule (and the same regex) the removed `AppHeader` carried.
 *
 * The review screen underneath it (`…/attempt/:id/review`) is NOT an attempt
 * and keeps the shell — hence the anchored `$`.
 */
export function isAttemptRoute(pathname: string): boolean {
  return /^\/quizzes\/[^/]+\/attempt\/[^/]+$/.test(pathname);
}

/**
 * The lesson player forces the rail down to its icon width.
 *
 * The player already renders its own course-outline sidebar. Two full-width
 * rails side by side would leave the video itself the narrowest column on the
 * screen, so on this route the student's collapse *preference* is overridden —
 * not overwritten. Leaving the lesson restores whatever they had chosen.
 */
export function isRailForcedCollapsed(pathname: string): boolean {
  return /^\/courses\/[^/]+\/lessons\/[^/]+/.test(pathname);
}
