import {
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarCheck,
  Flame,
  Gamepad2,
  Library,
  LayoutDashboard,
  ListTodo,
  Medal,
  MonitorSmartphone,
  NotebookPen,
  Route,
  Sparkles,
  StickyNote,
  Swords,
  Terminal,
  Ticket,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy';
import { aymanOnly } from '@/lib/tenant';
import { TEACHES_CODE } from '@/lib/tenant-subject';

export interface StudentNavItem {
  href: string;
  labelAr: string;
  icon: LucideIcon;
  /** `true` when the item is only ever reached deliberately, not while
   *  studying — it renders in the rail's footer rather than its main list. */
  footer?: boolean;
  /**
   * `true` when the item earns a slot in the phone's bottom bar.
   *
   * FOUR of them, and the number is the constraint rather than a preference: a
   * 360px screen divided five ways leaves 72px a tab, which is under the 44px
   * target plus a readable Arabic word beside it. Adding a fifth means taking
   * one out.
   *
   * The four are the ones a student opens on a normal evening — «حسابي» to see
   * where they are, «مساري» for what is next, «الكورسات» to watch, «نتائجي» for
   * the mark. Everything else («المتراكم»، «تجربة الكود»، «كود الكورس»،
   * «الكتب») is a deliberate visit, and a deliberate visit is what a menu is
   * for.
   */
  tab?: boolean;
  /**
   * An entitlement the row needs. The row is in the table on every stack and
   * the rail hides it until the stack reports the feature on
   * (`student-features.tsx`) — so a feature the owner opens for a teacher
   * from `/admin/platforms` shows up in that teacher's rail by itself.
   */
  feature?: FeatureKey;
}

/**
 * The signed-in student's navigation, in render order. One table, FOUR
 * consumers: the desktop rail, the mobile sheet, the phone's bottom bar, and
 * the topbar's current-page title. Four copies of this list would drift within
 * a week — the admin side learned that already
 * (`components/admin/nav-items.ts`), and this file deliberately mirrors its
 * shape so the two are read the same way.
 *
 * `tab` picks the bottom bar's four; `footer` picks the rail's footer group.
 * Neither is computed at a call site, so no two consumers can disagree about
 * which group a row is in — `STUDENT_TABS` below is the only reader of the
 * first, and `StudentNavFooterList` of the second.
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
  { href: '/dashboard', labelAr: copy.nav.dashboard, icon: LayoutDashboard, tab: true },
  { href: '/path', labelAr: copy.nav.path, icon: Route, tab: true },
  /*
   * «المتراكم» — right under «مساري», because it is the same question asked
   * the other way round: not «what is next» but «what did I leave behind».
   * Ayman's stack only (asked for that way); the API answers 404 elsewhere.
   */
  ...(aymanOnly(true) ? [{ href: '/backlog', labelAr: copy.nav.backlog, icon: ListTodo }] : []),
  /*
   * «خطة المذاكرة» and «سؤال اليوم» — the two daily habits, right under the
   * backlog the plan is built from. Behind their entitlements (`feature`):
   * on for Ayman, and they appear by themselves on any stack the owner opens
   * them for.
   */
  { href: '/plan', labelAr: copy.nav.plan, icon: CalendarCheck, feature: 'studyPlan' },
  { href: '/daily', labelAr: copy.nav.daily, icon: Flame, feature: 'dailyQuestion' },
  { href: '/results', labelAr: copy.nav.results, icon: BarChart3, tab: true },
  /*
   * «ترتيبي» — جنب «نتائجي» لأنه نفس السؤال من زاوية تانية: «درجاتي كام» ثم
   * «أنا فين وسط دفعتي». مش tab: الشريط اللي تحت أربعة بالعدد (شوف `tab`
   * فوق)، فعلى الموبايل بيبقى في «حاجات تانية».
   */
  { href: '/rank', labelAr: copy.nav.rank, icon: Trophy },
  /*
   * «شهاداتي» — بعد «نتائجي» و«ترتيبي» لأنها آخر محطة في نفس السؤال: الدرجات،
   * المكان وسط الدفعة، وبعدين الكورس اللي اكتمل. ورا `shareCards` (`feature`
   * فوق): مفتوحة عند أيمن، وبتظهر عند أي مدرّس صاحب المنصة يفتحهاله.
   */
  /* «أوسمتي» before «شهاداتي»: the ladder first, the paper at the top of it. */
  { href: '/badges', labelAr: copy.nav.badges, icon: Medal, feature: 'badges' },
  { href: '/certificates', labelAr: copy.nav.certificates, icon: Award, feature: 'shareCards' },
  { href: '/recap', labelAr: copy.nav.recap, icon: Sparkles, feature: 'monthlyRecap' },
  /*
   * «تحدّي الأسئلة» — ورا فيتشر `quizGame`: مفتوحة عند أيمن (اتطلبت له)،
   * ومقفولة على أي ستاك تاني لحد ما صاحب المنصة يفتحها؛ الصف بيظهر لوحده
   * ساعتها. الصفحة والـAPI عليهم نفس الحارس.
   */
  { href: '/game', labelAr: copy.nav.game, icon: Gamepad2, feature: 'quizGame' },
  /*
   * «ساحة التحدي» — ماتش مباشر. نفس بوابة «الألعاب»: البند عند أيمن بس، والصفحة
   * والـAPI ورا فلاج `arena.enabled` (مفتوح عنده افتراضيًا ومقفول عند الباقي).
   * القايمة بتتبني وقت البيلد ومابتقراش فلاجات، فستاك تاني فتح الفلاج بيوصلها
   * من الرابط لحد ما يتعمل للقايمة باب بيقرا الفلاج.
   */
  ...(aymanOnly(true) ? [{ href: '/arena', labelAr: copy.nav.arena, icon: Swords }] : []),
  /*
   * «دفتر غلطاتي» — نفس بوابة «ساحة التحدي» بالظبط: البند عند أيمن بس، فلاج
   * `mistakes.enabled` مفتوح عنده افتراضيًا ومقفول عند الباقي.
   */
  ...(aymanOnly(true) ? [{ href: '/mistakes', labelAr: copy.nav.mistakes, icon: NotebookPen }] : []),
  /* «ملاحظاتي» — the other study notebook, beside «غلطاتي». */
  { href: '/notes', labelAr: copy.nav.notes, icon: StickyNote, feature: 'lessonNotes' },
  { href: '/library', labelAr: copy.nav.courses, icon: BookMarked, tab: true },
  /*
   * «كود الكورس» — right under the courses, because that is where a student
   * who just got a code on WhatsApp looks first: «فين أحط الكود؟». A code
   * opens a piece of a course, so it belongs with the courses, not with the
   * account settings in the footer.
   */
  { href: '/codes', labelAr: copy.nav.unlockCodes, icon: Ticket },
  /*
   * «المحفظة» — right under «كود الكورس», and for the same reason: it is the
   * other thing a student does with money a teacher sent them (a wallet code
   * is typed here too). Not a tab: the bottom bar is four by count, so on a
   * phone it lives in «حاجات تانية».
   */
  { href: '/wallet', labelAr: copy.nav.wallet, icon: Wallet },
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
  /*
   * «الكتب الخارجية» — under the shop, a third book icon on purpose: `Library`
   * reads as a shelf, not a single volume. Before this row the books were only
   * reachable from the foot of each course page.
   */
  { href: '/external-books', labelAr: copy.nav.externalBooks, icon: Library },
  /*
   * «تجربة الكود» 404s on a stack whose subject is not code, so the row does
   * not exist there. Spread in place rather than filtered afterwards, so the
   * rail's ORDER on a programming stack is exactly what it was.
   *
   * «التأسيس» (`/foundations`) used to sit above «الكتب» under the same gate.
   * Taken out of the rail on request — the page itself still answers its own
   * URL, it just is not a destination a student is sent to any more.
   */
  ...(TEACHES_CODE ? [{ href: '/playground', labelAr: copy.nav.playground, icon: Terminal }] : []),
  { href: '/profile', labelAr: copy.nav.profile, icon: UserRound, footer: true },
  { href: '/settings/devices', labelAr: copy.nav.devices, icon: MonitorSmartphone, footer: true },
] as const;

/**
 * The phone's bottom bar, derived from the table above and never written twice.
 *
 * ⚠️ ORDER MATTERS and it is not the rail's. The bar reads right-to-left like
 * the rest of the product, and «حسابي» — where a student lands after signing
 * in — has to be the outermost thumb-reachable slot, then «مساري»،
 * «الكورسات»، «نتائجي». The rail's order puts «نتائجي» third because a rail is
 * scanned top to bottom at leisure; a thumb is not.
 */
export const STUDENT_TABS: readonly StudentNavItem[] = [
  '/dashboard',
  '/path',
  '/library',
  '/results',
].map((href) => {
  const item = STUDENT_NAV.find((entry) => entry.href === href && entry.tab === true);
  /* Throws at import time, not at render: a typo here would otherwise ship a
     bar with a hole in it, and the hole looks like a deliberate three-tab
     design. `student-nav-items.test.ts` asserts the two stay in step. */
  if (!item) throw new Error(`STUDENT_TABS: ${href} مش متعلّم بـtab في STUDENT_NAV`);
  return item;
});

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
