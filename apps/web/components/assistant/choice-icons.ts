import {
  ArrowRight,
  BadgeHelp,
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  CornerUpRight,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogIn,
  MessageSquareText,
  Play,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingUp,
  UserCog,
  UserPlus,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { AssistantChoiceId } from '@ayman/contracts/assistant/script';

/**
 * An icon for every choice in the tree.
 *
 * Lucide components, never emoji — Global Constraint 9, and the same rule
 * `admin/nav-items.ts` follows. A total `Record` over `AssistantChoiceId`
 * rather than a partial map, so a new branch cannot ship as the one row in the
 * panel with a blank square where every sibling has a glyph.
 *
 * This lives in `apps/web`, not in the contract: the tree is data both apps
 * could read, and `lucide-react` is a rendering concern with no business in a
 * package the API imports.
 */
export const CHOICE_ICONS: Record<AssistantChoiceId, LucideIcon> = {
  back: CornerUpRight,
  talk: MessageSquareText,

  courses: BookOpen,
  join: UserPlus,
  study: GraduationCap,
  account: UserCog,

  coursesAvailable: Layers,
  courseInside: Play,
  courseStart: CalendarClock,
  browseCourses: ExternalLink,
  essentials: Sparkles,

  joinAccount: UserPlus,
  joinEnroll: ArrowRight,
  joinPrice: CircleDollarSign,
  register: ExternalLink,

  studyQuizzes: ClipboardCheck,
  studyRetake: RefreshCw,
  studyAppeal: Scale,
  studyProgress: TrendingUp,
  dashboard: LayoutDashboard,

  accountPassword: KeyRound,
  accountProfile: UserCog,
  accountVideo: Video,
  login: LogIn,
  profile: BadgeHelp,
};
