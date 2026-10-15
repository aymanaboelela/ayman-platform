import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { aymanOnly } from '@/lib/tenant';

/**
 * «الصفحة كطالب» — `/dashboard` with the admin's own session, not anyone
 * else's. Ayman's stack only (`aymanOnly`); every other stack renders nothing.
 *
 * At the TOP of the rail and of the mobile sheet, never after the list: at the
 * bottom of a ~3000px rail it sat two and a half screens below the fold, and
 * the sheet did not carry it at all — «هي فين؟» on 2026-10-12.
 */
export function StudentViewLink({ onNavigate }: { onNavigate?: () => void }) {
  if (!aymanOnly(true)) return null;
  return (
    <Link href="/dashboard" className="nav-pill" onClick={onNavigate}>
      <span className="nav-pill__well" aria-hidden="true">
        <GraduationCap className="size-4" />
      </span>
      <span className="nav-pill__label">{copy.admin.nav.studentView}</span>
    </Link>
  );
}
