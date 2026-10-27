import {
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarCheck,
  Crown,
  Flame,
  Gamepad2,
  Gift,
  Library,
  Layers,
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
  Timer,
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
  /** The rail section the row is drawn under — see `STUDENT_NAV_GROUPS`. */
  group: StudentNavGroup;
}

export type StudentNavGroup = 'main' | 'study' | 'grades' | 'play' | 'money';

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
  /* ── main: no heading — where a student lands and what they came to open. ── */
  { href: '/dashboard', labelAr: copy.nav.dashboard, icon: LayoutDashboard, tab: true, group: 'main' },
  { href: '/path', labelAr: copy.nav.path, icon: Route, tab: true, group: 'main' },
  { href: '/library', labelAr: copy.nav.courses, icon: BookMarked, tab: true, group: 'main' },
  /*
   * «كود الكورس» — right under the courses, because that is where a student
   * who just got a code on WhatsApp looks first: «فين أحط الكود؟». A code
   * opens a piece of a course, so it belongs with the courses, not with the
   * account settings in the footer.
   */
  { href: '/codes', labelAr: copy.nav.unlockCodes, icon: Ticket, group: 'main' },

  /* ── «المذاكرة»: the tools a student studies WITH, daily habits first. ── */
  /*
   * «خطة المذاكرة» and «سؤال اليوم» — the two daily habits. Behind their
   * entitlements (`feature`): on for Ayman, and they appear by themselves on
   * any stack the owner opens them for.
   */
  { href: '/plan', labelAr: copy.nav.plan, icon: CalendarCheck, feature: 'studyPlan', group: 'study' },
  /*
   * «المتراكم» — right under the plan, because the plan is built from it: not
   * «what is next» but «what did I leave behind». Ayman's stack only (asked
   * for that way); the API answers 404 elsewhere.
   */
  ...(aymanOnly(true)
    ? [{ href: '/backlog', labelAr: copy.nav.backlog, icon: ListTodo, group: 'study' as const }]
    : []),
  { href: '/daily', labelAr: copy.nav.daily, icon: Flame, feature: 'dailyQuestion', group: 'study' },
  /* «أوضة المذاكرة» — the third habit: the timer to study by. */
  { href: '/focus', labelAr: copy.nav.focus, icon: Timer, feature: 'focusRoom', group: 'study' },
  /*
   * «دفتر غلطاتي» — البند عند أيمن بس، فلاج `mistakes.enabled` مفتوح عنده
   * افتراضيًا ومقفول عند الباقي (نفس بوابة «ساحة التحدي»).
   */
  ...(aymanOnly(true)
    ? [{ href: '/mistakes', labelAr: copy.nav.mistakes, icon: NotebookPen, group: 'study' as const }]
    : []),
  /* «ملاحظاتي» — the other study notebook, beside «غلطاتي». */
  { href: '/notes', labelAr: copy.nav.notes, icon: StickyNote, feature: 'lessonNotes', group: 'study' },
  { href: '/cards', labelAr: copy.nav.cards, icon: Layers, feature: 'flashCards', group: 'study' },
  /*
   * «تجربة الكود» 404s on a stack whose subject is not code, so the row does
   * not exist there. Spread in place rather than filtered afterwards, so the
   * rail's ORDER on a programming stack is exactly what it was.
   *
   * «التأسيس» (`/foundations`) used to sit above «الكتب» under the same gate.
   * Taken out of the rail on request — the page itself still answers its own
   * URL, it just is not a destination a student is sent to any more.
   */
  ...(TEACHES_CODE
    ? [{ href: '/playground', labelAr: copy.nav.playground, icon: Terminal, group: 'study' as const }]
    : []),

  /* ── «درجاتي»: one question asked four ways — the mark, the place, the paper. ── */
  { href: '/results', labelAr: copy.nav.results, icon: BarChart3, tab: true, group: 'grades' },
  /*
   * «ترتيبي» — جنب «نتائجي» لأنه نفس السؤال من زاوية تانية: «درجاتي كام» ثم
   * «أنا فين وسط دفعتي». مش tab: الشريط اللي تحت أربعة بالعدد (شوف `tab`
   * فوق)، فعلى الموبايل بيبقى في «حاجات تانية».
   */
  { href: '/rank', labelAr: copy.nav.rank, icon: Trophy, group: 'grades' },
  /*
   * «أوسمتي» before «شهاداتي»: the ladder first, the paper at the top of it.
   * «شهاداتي» ورا `shareCards` (`feature` فوق): مفتوحة عند أيمن، وبتظهر عند أي
   * مدرّس صاحب المنصة يفتحهاله.
   */
  { href: '/badges', labelAr: copy.nav.badges, icon: Medal, feature: 'badges', group: 'grades' },
  { href: '/certificates', labelAr: copy.nav.certificates, icon: Award, feature: 'shareCards', group: 'grades' },
  { href: '/recap', labelAr: copy.nav.recap, icon: Sparkles, feature: 'monthlyRecap', group: 'grades' },

  /* ── «التحديات»: everything played against someone else. ── */
  /*
   * «تحدّي الأسئلة» — ورا فيتشر `quizGame`: مفتوحة عند أيمن (اتطلبت له)،
   * ومقفولة على أي ستاك تاني لحد ما صاحب المنصة يفتحها؛ الصف بيظهر لوحده
   * ساعتها. الصفحة والـAPI عليهم نفس الحارس.
   */
  { href: '/game', labelAr: copy.nav.game, icon: Gamepad2, feature: 'quizGame', group: 'play' },
  /*
   * «ساحة التحدي» — ماتش مباشر. البند عند أيمن بس، والصفحة والـAPI ورا فلاج
   * `arena.enabled` (مفتوح عنده افتراضيًا ومقفول عند الباقي). القايمة بتتبني
   * وقت البيلد ومابتقراش فلاجات، فستاك تاني فتح الفلاج بيوصلها من الرابط لحد
   * ما يتعمل للقايمة باب بيقرا الفلاج.
   */
  ...(aymanOnly(true) ? [{ href: '/arena', labelAr: copy.nav.arena, icon: Swords, group: 'play' as const }] : []),
  /* «دوري الأسبوع» — the same «where am I» as «ترتيبي», but a race over this week's work. */
  { href: '/league', labelAr: copy.nav.league, icon: Crown, feature: 'weeklyLeague', group: 'play' },

  /* ── «المحفظة والكتب»: everything with a price on it. ── */
  /*
   * «المحفظة» — the other thing a student does with money a teacher sent them
   * (a wallet code is typed here too). Not a tab: the bottom bar is four by
   * count, so on a phone it lives in «حاجات تانية».
   */
  { href: '/wallet', labelAr: copy.nav.wallet, icon: Wallet, group: 'money' },
  /*
   * «دعوة صحابك» — right under «المحفظة», because that is where its reward
   * lands: a student who just saw «مكافأة دعوة» on the statement finds the link
   * that earned it one row down. Behind `referrals` (`feature`): on for Ayman,
   * and it appears on a teacher's rail by itself once the owner opens it.
   */
  { href: '/invite', labelAr: copy.nav.invite, icon: Gift, feature: 'referrals', group: 'money' },
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
   * `BookOpen`, not `BookMarked` — that one is «الكورسات», and two identical
   * book icons in one rail is a rail nobody can scan.
   */
  { href: '/store', labelAr: copy.nav.books, icon: BookOpen, group: 'money' },
  /*
   * «الكتب الخارجية» — under the shop, a third book icon on purpose: `Library`
   * reads as a shelf, not a single volume. Before this row the books were only
   * reachable from the foot of each course page.
   */
  { href: '/external-books', labelAr: copy.nav.externalBooks, icon: Library, group: 'money' },

  { href: '/profile', labelAr: copy.nav.profile, icon: UserRound, footer: true, group: 'main' },
  { href: '/settings/devices', labelAr: copy.nav.devices, icon: MonitorSmartphone, footer: true, group: 'main' },
] as const;

/**
 * The rail's sections, in render order. Twenty-odd rows in one column was the
 * «رتّبهم بشكل كويس» report: a student looking for «شهاداتي» had to read past
 * the timer, the games and the notebooks to find it. `main` has no heading —
 * it is the top of the rail, and a heading there only pushes «حسابي» down.
 *
 * The table above is ALSO written in this order, so a reader of the file sees
 * what the rail draws; the list component groups by this array regardless.
 */
export const STUDENT_NAV_GROUPS: ReadonlyArray<{ id: StudentNavGroup; labelAr?: string }> = [
  { id: 'main' },
  { id: 'study', labelAr: copy.nav.groupStudy },
  { id: 'grades', labelAr: copy.nav.groupGrades },
  { id: 'play', labelAr: copy.nav.groupPlay },
  { id: 'money', labelAr: copy.nav.groupMoney },
] as const;

/**
 * The phone's bottom bar, derived from the table above and never written twice.
 *
 * ⚠️ ORDER MATTERS and it is not the rail's. The bar reads right-to-left like
 * the rest of the product, and «حسابي» — where a student lands after signing
 * in — has to be the outermost thumb-reachable slot, then «مساري»،
 * «الكورسات»، «نتائجي». The rail files «نتائجي» under its own «درجاتي»
 * section because a rail is scanned top to bottom at leisure; a thumb is not.
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
