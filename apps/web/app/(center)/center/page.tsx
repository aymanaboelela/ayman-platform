import { BadgeCheck, ClipboardList, Hourglass, MapPin, UserRoundX, Wallet } from 'lucide-react';
import { CenterPortalSchema } from '@ayman/contracts/center-reservations';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { apiGetAuthedOrNotFound } from '@/lib/api-server';
import { formatEGP } from '@/lib/price';
import { StatTile } from '@/app/(admin)/admin/centers/centers-ui';
import { PortalList } from './portal-list';

const a = reservationsCopy.admin;
const t = reservationsCopy.portal;

type Search = { centerId?: string };

/**
 * `/center` — one centre's reservations, read-only. The centre comes from the
 * signed-in account's own link on the API side; `?centerId=` is honoured only
 * for someone who already reads every centre (the dashboard's preview).
 */
export default async function CenterPortalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { centerId } = await searchParams;
  const preview = centerId && /^[0-9a-f-]{36}$/i.test(centerId) ? centerId : null;
  const data = await apiGetAuthedOrNotFound(
    preview ? `/api/center-portal?centerId=${preview}` : '/api/center-portal',
    CenterPortalSchema,
  );
  const { stats } = data;

  return (
    <>
      <div className="min-w-0">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{data.center.name}</h1>
        {data.center.address ? (
          <p className="mt-1 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {data.center.address}
          </p>
        ) : null}
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{t.lead}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
        <StatTile color="var(--viz-2)" icon={ClipboardList} value={stats.total} label={a.tiles.total} />
        <StatTile color="var(--ok)" icon={BadgeCheck} value={stats.confirmed} label={a.tiles.confirmed} />
        <StatTile color="var(--info)" icon={Hourglass} value={stats.submitted} label={a.tiles.submitted} />
        <StatTile color="var(--warn)" icon={UserRoundX} value={stats.started} label={a.tiles.started} />
        <StatTile color="var(--viz-1)" icon={Wallet} value={`${formatEGP(stats.confirmedCents)} ج`} label={a.tiles.confirmedMoney} wide />
      </div>

      <PortalList reservations={data.reservations} centerName={data.center.name} previewCenterId={preview} />
    </>
  );
}
