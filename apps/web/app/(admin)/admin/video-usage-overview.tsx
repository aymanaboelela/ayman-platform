import { connection } from 'next/server';
import Link from 'next/link';
import { HardDrive } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { controlPlaneTenants } from '@/lib/control-plane';
import { formatBytes } from '@/lib/upload-format';
import { tenantVideoUsage } from '@/lib/video-usage';
import { monthlyAtCurrentStorage } from '@/lib/video-usage-math';

const c = copy.admin.overview;

function usd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

/**
 * «استهلاك سيرفر الفيديوهات» — a compact teaser on `/admin` itself, not just
 * on `/admin/platforms`. كل باكِت فيديو لكل مدرّس قاعد على حساب كلاودفلير
 * بتاع صاحب المنصة (CLAUDE.md §٢)، فالرئيسية بتورّيه إجمالي المساحة وإجمالي
 * الفاتورة من غير ما يفتح شاشة تانية. التفاصيل لكل مدرّس لسه في
 * `/admin/platforms` — هنا بس المجموع، زي أي `StatTile` تاني في الصفحة دي.
 *
 * `IS_AYMAN`-gated من المكان اللي بيستدعيها، مش هنا — نفس القاعدة اللي
 * `/admin/platforms/page.tsx` ماشي عليها.
 */
export async function VideoUsageOverview() {
  await connection();
  const tenants = controlPlaneTenants();
  if (tenants.length === 0) return null;

  const result = await tenantVideoUsage(tenants);
  if (!result.ok) return null;

  const teachers = result.rows.filter((row) => row.key !== 'ayman');
  const totalStored = teachers.reduce((sum, row) => sum + row.storedBytes, 0);
  const totalMonthly = teachers.reduce((sum, row) => sum + monthlyAtCurrentStorage(row.storedBytes, row.key), 0);
  if (teachers.length === 0) return null;

  return (
    <Link
      href="/admin/platforms"
      className="panel mb-8 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 transition-colors duration-[160ms] hover:border-line-strong hover:bg-surface-3"
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text">
        <HardDrive className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{c.videoUsageTitle}</span>
        <span className="block text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.videoUsageLead, { n: teachers.length, stored: formatBytes(totalStored) })}
        </span>
      </span>
      <span dir="ltr" className="mono tabular shrink-0 text-[length:var(--fs-title-4)] font-semibold text-accent-text">
        {usd(totalMonthly)}
      </span>
    </Link>
  );
}
