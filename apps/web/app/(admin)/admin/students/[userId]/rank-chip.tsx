import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Medal } from 'lucide-react';
import { AdminStudentRankSchema } from '@ayman/contracts/admin/leaderboard';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { adminGetOrForbidden } from '@/lib/admin-api';

const c = copy.admin.leaderboard;
const NUM = new Intl.NumberFormat('en-US');

/**
 * «الترتيب في الدفعة: #٤ من ١٢٠» — جنب الاسم فوق صفحة الطالب.
 *
 * نفس حساب «ترتيبي» عند الطالب (`CohortRankService.forAdmin`)، فالرقم ده هو
 * اللي الطالب شايفه دلوقتي. والشريحة لينك على «الأوائل» مفتوحة على دفعته
 * ومدوّرة عليه، فالمدرّس يشوف مين قدّامه ومين وراه.
 *
 * ## بتسكت بدل ما توقّع الصفحة
 *
 * في `Suspense` لوحدها، وأي فشل بيرجّع `null`: الصفحة دي بتتفتح عشان رقم
 * موبايل أو كورس، والترتيب معلومة زيادة. و`OrForbidden` لأن دور من غير
 * `analytics:read` بيفتح الصفحة عادي — ده «مش ليك»، مش عطل.
 */
export async function RankChip({ userId, fullName }: { userId: string; fullName: string }) {
  let rank;
  try {
    rank = await adminGetOrForbidden(
      `/api/admin/leaderboard/students/${encodeURIComponent(userId)}`,
      AdminStudentRankSchema,
    );
  } catch {
    return null;
  }
  if (rank === null) return null;

  const chip =
    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[length:var(--fs-text-sm)] font-semibold ' +
    'border-[color-mix(in_oklab,var(--chip)_40%,transparent)] bg-[color-mix(in_oklab,var(--chip)_12%,transparent)] ' +
    'text-[color:color-mix(in_oklab,var(--chip),var(--color-fg)_30%)]';

  if (rank.cohort === null || rank.rank === null) {
    return (
      <span className={chip} style={{ '--chip': 'var(--color-fg-muted)' } as CSSProperties}>
        <Medal className="size-4" aria-hidden="true" />
        {c.studentChipNoYear}
      </span>
    );
  }

  const top = rank.rank <= 3 && rank.points > 0;
  const href = `/admin/leaderboard?${new URLSearchParams({
    year: String(rank.cohort.year),
    ...(rank.cohort.systemId ? { systemId: rank.cohort.systemId } : {}),
    q: fullName,
  })}`;

  return (
    <Link
      href={href}
      className={`${chip} transition-colors duration-[160ms] ease-out hover:bg-[color-mix(in_oklab,var(--chip)_20%,transparent)]`}
      style={{ '--chip': top ? 'var(--print-gold)' : 'var(--viz-3)' } as CSSProperties}
      title={rank.cohort.label}
    >
      <Medal className="size-4" aria-hidden="true" />
      {formatCopy(c.studentChip, { rank: rank.rank, size: NUM.format(rank.cohort.size) })}
      <span className="font-normal opacity-80">· {formatCopy(c.studentChipPoints, { points: NUM.format(rank.points) })}</span>
    </Link>
  );
}
