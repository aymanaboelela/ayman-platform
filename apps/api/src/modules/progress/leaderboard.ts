import type { LeaderboardCohort } from '@ayman/contracts/admin/leaderboard';
import { RANK_LEVELS, levelFor, type RankLevelKey } from '@ayman/contracts/rank';
import { foldArabic } from '../../common/arabic-fold';
import { competitiveRanks, type CohortKey, type CohortMember } from './cohort-rank.service';

/**
 * الحسابات الصافية ورا «الأوائل» في الأدمن — من غير داتابيز، عشان تتختبر
 * لوحدها. الكويريز في `leaderboard.service.ts`.
 */

export interface RankedMember extends CohortMember {
  rank: number;
}

/**
 * الدفعة مترتّبة بالنقط، وكل صف برقمه.
 *
 * الرقم من `competitiveRanks` — نفس الدالة اللي `standing` بيدّي بيها الطالب
 * رقمه — فاتنين متعادلين بياخدوا نفس الرقم هنا وهناك. ترتيب المتعادلين جوّه
 * الرقم الواحد بالاسم: ماحدش فيهم «قبل» التاني، فالأبجدية أسهل حاجة تتقري.
 */
export function rankMembers(rows: readonly CohortMember[]): RankedMember[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      a.fullName.localeCompare(b.fullName, 'ar') ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  const ranks = competitiveRanks(sorted.map((row) => row.points));
  return sorted.map((row, i) => ({ ...row, rank: ranks[i]! }));
}

/** ٠١٢ → 012 — الكيبورد العربي على الموبايل بيكتب الأرقام دي. */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function squash(text: string): string {
  return foldArabic(text).replace(/\s+/g, ' ').trim();
}

/**
 * طالب بيطابق البحث؟ بالاسم أو بالموبايل.
 *
 * - الاسم بعد طي الهمزة على الناحيتين (`foldArabic`): «امجد» بتلاقي «أمجد» —
 *   نفس قاعدة بحث `/admin/students`.
 * - الموبايل متخزّن `+2010…`، والمدرّس بيكتب `010…`. فالصفر اللي في الأول
 *   بيتشال، وبعدها «جوّه الرقم» بيكفي. تلات أرقام على الأقل: رقمين بيطابقوا
 *   نص الدفعة.
 */
export function matchesSearch(member: Pick<CohortMember, 'fullName' | 'phone'>, q: string): boolean {
  const query = latinDigits(q).trim();
  if (query === '') return true;

  const name = squash(query);
  if (name !== '' && squash(member.fullName).includes(name)) return true;

  const digits = query.replace(/\D/g, '');
  if (digits.length < 3 || member.phone === null) return false;
  const needle = digits.startsWith('0') ? digits.slice(1) : digits;
  return member.phone.replace(/\D/g, '').includes(needle);
}

/**
 * البحث وعربي/لغات بيضيّقوا القايمة — **بعد** الترتيب، فرقم كل طالب هو رقمه
 * على الدفعة كلها مش على اللي باقيين في الشاشة.
 */
export function filterMembers(
  ranked: readonly RankedMember[],
  filter: { q: string; stream?: 'general' | 'languages' },
): RankedMember[] {
  return ranked.filter(
    (row) => (filter.stream === undefined || row.stream === filter.stream) && matchesSearch(row, filter.q),
  );
}

/**
 * أرقام الدفعة اللي فوق القايمة. المستويات من `levelFor` — نفس الدالة اللي
 * بتكتب «مستواك: دهب» للطالب — فـ«١٢ في الدهب» هنا هم نفس الـ١٢ اللي شايفين
 * «دهب» عندهم.
 */
export function summarize(rows: readonly CohortMember[]): {
  size: number;
  active: number;
  averagePoints: number;
  pendingReview: number;
  levels: Array<{ key: RankLevelKey; count: number }>;
} {
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  const tally = new Map<RankLevelKey, number>();
  for (const row of rows) {
    const key = levelFor(row.points).key;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return {
    size: rows.length,
    active: rows.filter((row) => row.points > 0).length,
    averagePoints: rows.length > 0 ? Math.round((total / rows.length) * 10) / 10 : 0,
    pendingReview: rows.reduce((sum, row) => sum + row.stats.pendingReview, 0),
    levels: RANK_LEVELS.map((level) => ({ key: level.key, count: tally.get(level.key) ?? 0 })),
  };
}

export interface AcademicYearRow {
  systemId: string;
  year: number;
  labelAr: string;
  systemOrder: number;
}

/**
 * التابات: كل (نظام، سنة) في `academic_years`، بعدد طلبته.
 *
 * العدد = اللي نظامهم ده + اللي مالهمش نظام خالص في نفس السنة، لأن
 * `CohortRankService.cohort` بيدخّل التانيين مع سنتهم في كل نظام. لو التاب
 * عدّ الأولانيين بس، الرقم اللي عليه كان هيبقى أقل من القايمة اللي تحته.
 */
export function cohortTabs(
  years: readonly AcademicYearRow[],
  counts: ReadonlyArray<{ systemId: string | null; year: number | null; n: number }>,
): LeaderboardCohort[] {
  const count = (systemId: string | null, year: number) =>
    counts.find((row) => row.systemId === systemId && row.year === year)?.n ?? 0;

  return [...years]
    .sort((a, b) => a.systemOrder - b.systemOrder || a.year - b.year)
    .map((row) => ({
      year: row.year,
      systemId: row.systemId,
      label: row.labelAr,
      size: count(row.systemId, row.year) + count(null, row.year),
    }));
}

/**
 * أنهي دفعة تتفتح. اللي في الرابط لو فيه سنة؛ وغير كده أكبر دفعة — دي اللي
 * المدرّس غالبًا فاتح الشاشة عشانها، والتاب الأول ممكن يبقى سنة فاضية.
 *
 * نظام من غير سنة مالوش معنى (أنهي سنة؟)، فبيتساب ويتفتح الافتراضي.
 */
export function pickCohort(
  tabs: readonly LeaderboardCohort[],
  query: { year?: number; systemId?: string },
): CohortKey | null {
  if (query.year !== undefined) return { year: query.year, systemId: query.systemId ?? null };
  let best: LeaderboardCohort | null = null;
  for (const tab of tabs) {
    if (tab.size > 0 && (best === null || tab.size > best.size)) best = tab;
  }
  return best ? { year: best.year, systemId: best.systemId } : null;
}
