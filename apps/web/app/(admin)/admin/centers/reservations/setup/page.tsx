import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { GRADES } from '@ayman/contracts/grades';
import { ReservationSetupSchema } from '@ayman/contracts/center-reservations';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { adminGet } from '@/lib/admin-api';
import { featureEnabled } from '@/lib/entitlements';
import { SITE_URL } from '@/lib/seo/site-url';
import { TENANT_GRADES } from '@/lib/tenant-grades';
import { CentersSetup, ManagersSetup, PageSettingsForm } from './setup-forms';

const a = reservationsCopy.admin;

export const metadata = { title: a.setupTitle };

/**
 * `/admin/centers/reservations/setup` — the page's switches, which centres it
 * lists, the share of a session paid to book, and the logins handed to centre owners.
 */
export default async function ReservationSetupPage() {
  if (!(await featureEnabled('centerReservations'))) notFound();
  const setup = await adminGet('/api/admin/center-reservations/setup', ReservationSetupSchema);

  return (
    <>
      <Link
        href="/admin/centers/reservations"
        className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {a.backToList}
      </Link>
      <h1 className="mt-2 text-[length:var(--fs-title-2)] font-semibold text-fg">{a.setupTitle}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{a.setupSubtitle}</p>

      <div className="mt-6 flex flex-col gap-6">
        <PageSettingsForm
          settings={setup.settings}
          grades={GRADES.filter(
            (g) =>
              setup.settings.grades.includes(g.slug) ||
              (TENANT_GRADES.length > 0 ? TENANT_GRADES.includes(g) : g.system === 'bacalorya'),
          ).map((g) => ({ slug: g.slug, label: g.labelAr }))}
        />
        <CentersSetup centers={setup.centers} platform={setup.platformPayment} />
        <ManagersSetup
          managers={setup.managers}
          centers={setup.centers.map((c) => ({ id: c.id, name: c.name }))}
          loginUrl={`${SITE_URL}/login`}
        />
      </div>
    </>
  );
}
