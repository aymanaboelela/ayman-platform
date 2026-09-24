import {
  ArrowDownLeft,
  AlertTriangle,
  BookMarked,
  Building2,
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
  TicketCheck,
  Trophy,
  Users,
  UserRoundSearch,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  PackageOpen,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import type { Entitlements, FeatureKey } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
/*
 * The tenant gate, read here so BOTH consumers of this table get it from one
 * place. `lib/tenant.ts` is isomorphic — `TENANT_KEY` is inlined into the
 * client bundle by `next.config.ts`'s `env` block on purpose — so the sidebar
 * (a client component) and `/admin`'s grid (a server component) reach the same
 * answer and React has no hydration mismatch to resolve.
 */
import { IS_AYMAN } from '@/lib/tenant';

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
  /**
   * الفيتشر اللي القسم ده بيعيش جوّاها، لو كان جوّه واحدة.
   *
   * مفيش قيمة = القسم ده المنصة نفسها ومابيتقفلش على حد (الكورسات، الطلبة،
   * الإعدادات). وفيه قيمة = المدرّس اللي الفيتشر دي مقفولة عنده مايشوفش
   * الصف ده خالص — لا في السايدبار، ولا في جريد `/admin`.
   *
   * ⚠️ ودي عكس `aymanOnly` تحت، مش نسخة تانية منها: `aymanOnly` بتقول «ده
   * لصاحب السوفتوير بس»، ودي بتقول «ده لكل مدرّس فتحهاله». وعشان كده
   * `aymanOnly` بتتقرا من `TENANT_KEY` المحقون وقت البناء، ودي بتتقرا من
   * `GET /api/entitlements` — قيمة وقت تشغيل، عشان مستند جديد يوصل
   * بإعادة تشغيل مش بإعادة بناء.
   *
   * وزي `aymanOnly` بالظبط: ده إخفاء مش قفل. القفل `@RequireFeature` على
   * الكونترولر في الـAPI.
   */
  feature?: FeatureKey;
  group: AdminNavGroup;
  /**
   * Rendered on Ayman's stack and nowhere else — the control plane, and
   * anything else that is about the OTHER stacks rather than about this one.
   *
   * ## Why this is not a permission
   *
   * Every instructor stack creates its first account with `role: 'admin'`
   * (`apps/api/src/scripts/create-admin.ts`, run from `docker-entrypoint.sh`
   * on every boot with the `ADMIN_*` pair that `deploy/tenant.env.example`
   * hands to EVERY tenant), and `admin` is `'*'` in `permissions.ts` — it
   * picks up any new permission the moment the string is written. So a
   * `control:sign` invented for this row would be held by Mohamed and by
   * Adel, on their own stacks, the day it shipped. `IS_AYMAN` is the gate;
   * a permission here would be a green test guarding nothing.
   *
   * ## And why the row stays in the table
   *
   * `activeNavItem()` below is what `admin-header.tsx` resolves the breadcrumb
   * from, so a row removed from `ADMIN_NAV` is a page with a blank title
   * rather than a page that does not exist. The hiding happens where the list
   * is RENDERED — `admin-nav-list.tsx` and `/admin`'s section grid — and the
   * route itself calls `notFound()` on its own.
   */
  aymanOnly?: true;
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
    // «التحويلات الواردة» — the evidence behind the queue above it. Its own
    // entry rather than a tab inside `/admin/payments` because it answers a
    // different question: that screen is "who is asking", this is "what
    // actually arrived", and most of the time the two are matched by the
    // piastre code with nobody reading either.
    href: '/admin/transfers',
    labelAr: copy.admin.nav.transfers,
    icon: ArrowDownLeft,
    permission: 'payment:read',
    feature: 'transfers',
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
    // «أكواد الفتح» — under the money pair because it IS a sale, just one
    // agreed on WhatsApp instead of claimed through the checkout: the price
    // on each code is what the student paid. `payment:read` to see the list,
    // like the two above; creating and pulling a code is `payment:review`,
    // checked by the API and by the page before it renders the controls.
    href: '/admin/unlock-codes',
    labelAr: copy.admin.nav.unlockCodes,
    icon: TicketCheck,
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
    feature: 'books',
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
    feature: 'homework',
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
    feature: 'exams',
    group: 'teaching',
  },
  {
    // تصحيح الورق — the essay queue. Directly under «امتحانات الشهر» because it
    // is the other half of one paper: what he sets, and what comes back needing
    // a human. Its own permission, `attempt:grade`, so a role that may author a
    // paper does not automatically hold the pen that moves a student's score.
    // ⚠️ ومن غير `feature: 'exams'` عن قصد. الشاشة دي بتصحّح **كل** سؤال
    // مقالي على المنصة — كويزات المحاضرات وامتحان نهاية الكورس كمان، مش
    // امتحان الشهر بس. والسؤال المقالي اللي ماتصحّحش بيتحسب صفر في مجموع
    // الطالب، فإخفاؤها مع فيتشر الامتحانات الشهرية كان هيصفّر درجات على
    // ستاك مالوش امتحانات شهرية أصلًا.
    href: '/admin/grading',
    labelAr: copy.admin.nav.grading,
    icon: SquarePen,
    permission: 'attempt:grade',
    group: 'teaching',
  },
  {
    // لوحة الشرف — تحت التصحيح مباشرة، وده مقصود: الورقة بتتثبّت من الشاشة
    // اللي فوق، والصف اليدوي بيتحط من دي، والاتنين بيطلعوا على نفس اللوحة
    // العامة. حد بيدوّر على «مين على اللوحة» بيلاقي الشاشتين جنب بعض.
    //
    // `feature: 'honorBoard'` زي الراوت بالظبط: ستاك مقفول فيه الفيتشر مالوش
    // لوحة ولا أرشيف، والشاشة كانت هتبقى زرار بيكتب في جدول مالوش قارئ.
    href: '/admin/honor-board',
    labelAr: copy.admin.nav.honorBoard,
    icon: Trophy,
    permission: 'honor:read',
    feature: 'honorBoard',
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
    feature: 'assistant',
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
    // The one deliberate exception to «مفيش زرار إرسال للكل» — its own link,
    // its own icon, right beside the automated log so the two are never
    // mistaken for one feature. `conversation:reply`, the same authority
    // `AdminInboxController` already guards a reply with.
    //
    // NOT `Megaphone`: «التسويق» below already owns that icon, and these two
    // are the pair most worth telling apart at a glance — one writes into a
    // conversation the student already has with the instructor, the other
    // sends a message out to a phone.
    href: '/admin/broadcast',
    labelAr: copy.admin.nav.broadcast,
    icon: MessagesSquare,
    permission: 'conversation:reply',
    feature: 'broadcast',
    group: 'teaching',
  },
  {
    // «متابعة الطلبة» — between the log and the send button, because it is the
    // screen that produces the REASON to send. `student:read`, not
    // `outreach:read`: the rows are students and their progress, and every one
    // of them links to a record that same permission already opens. The send
    // routes under it carry `conversation:reply` on their own.
    href: '/admin/follow-up',
    labelAr: copy.admin.nav.followUp,
    icon: UserRoundSearch,
    permission: 'student:read',
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
    feature: 'marketing.whatsapp',
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
    // «المساعد يقدر يعمل إيه». في `system` جنب الفلاجات وسجل التدقيق: التلاتة
    // بيتسألوا عن المنصة نفسها مش عن التدريس.
    //
    // `role:read` مش `admin:access` — الصفحة دي بتقرر مين يوصل لفلوسك، فاللي
    // بيفتحها لازم يكون متداله الصلاحية دي بعينها. وهي مش في `grantable`
    // أصلًا (`NEVER_GRANTABLE`)، يعني مساعد اتفتحتله الشاشة مايقدرش يدّي
    // نفسه باقي المنصة.
    href: '/admin/roles',
    labelAr: copy.admin.nav.roles,
    icon: ShieldCheck,
    permission: 'role:read',
    group: 'system',
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
  {
    // منصات المدرّسين. `system`, at the end: it is the only section that is
    // about stacks OTHER than this one, so it reads last rather than beside
    // the screens that configure the stack you are standing on.
    //
    // `admin:access` is the permission every admin session already holds —
    // it is here because the field is required and the three consumers filter
    // on it, NOT because it gates anything. `aymanOnly` is the gate; see the
    // note on the field.
    href: '/admin/platforms',
    labelAr: copy.admin.nav.platforms,
    icon: Building2,
    permission: 'admin:access',
    group: 'system',
    aymanOnly: true,
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
 * The rows a given session may see — the one rule, for every surface.
 *
 * Both callers used to spell `ADMIN_NAV.filter((item) =>
 * permissions.includes(item.permission))` out by hand: the sidebar and the
 * mobile sheet through `admin-nav-list.tsx`, and `/admin`'s section grid. Two
 * copies of a visibility rule is how a section ends up hidden from the
 * sidebar and still sitting as a tile on the overview — which is exactly what
 * `aymanOnly` would have caused on the day it was added.
 *
 * `activeNavItem` deliberately does NOT go through this: the breadcrumb has
 * to resolve a title for a page you are already standing on, and a route that
 * renders is a route whose name should appear at the top of it.
 */
export function visibleNavItems(
  permissions: readonly string[],
  features: Entitlements,
): readonly AdminNavItem[] {
  return ADMIN_NAV.filter(
    (item) =>
      permissions.includes(item.permission) &&
      (!item.aymanOnly || IS_AYMAN) &&
      // مطلوب عن قصد ومالوش قيمة افتراضية: سطح جديد ينسى يمرّره يبقى خطأ
      // كومبايل، مش قسم بيظهر على ستاك مقفول عنده.
      (item.feature === undefined || features[item.feature]),
  );
}

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
