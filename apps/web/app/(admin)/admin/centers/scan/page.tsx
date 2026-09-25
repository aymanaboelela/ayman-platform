import { CalendarClock, ShieldAlert } from 'lucide-react';
import { AdminCentersSchema } from '@ayman/contracts/admin/centers';
import { CentersListSchema, formatSlotTime } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { cairoNow } from '../centers-ui';
import { DoorScanner, type ScanSlotOption } from './door-scanner';

const c = copy.admin.centers;
const s = c.scan;

export const metadata = { title: s.title };

/** Students arrive before the class starts; the door opens this long before. */
const EARLY_MINUTES = 45;

/**
 * The slot the door is most likely standing at: the one running now (or
 * about to), else the next one today, else the first. A `?slot=` from a
 * slot card wins over all of it.
 */
function pickDefault(
  options: readonly ScanSlotOption[],
  requested: string | undefined,
): { defaultSlotId: string | null; nowSlotId: string | null } {
  const { dayOfWeek, minute } = cairoNow();
  const today = options
    .filter((option) => option.active && option.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startMinute - b.startMinute);
  const running = today.find(
    (option) => minute >= option.startMinute - EARLY_MINUTES && minute <= option.endMinute,
  );
  const next = today.find((option) => option.endMinute >= minute);
  const fallback = running ?? next ?? options.find((option) => option.active) ?? options[0];
  const chosen =
    requested && options.some((option) => option.id === requested) ? requested : fallback?.id;
  return { defaultSlotId: chosen ?? null, nowSlotId: running?.id ?? null };
}

/**
 * `/admin/centers/scan` — the phone at the centre's door.
 *
 * ## Where the slot list comes from
 *
 * `GET /api/admin/centers` is `center:read`, and the person at the door may
 * hold `center:attendance` and nothing else — that is the whole point of the
 * permission. So a 403 there falls back to `GET /api/centers`, the active
 * slots a signed-in account can see (`profile:read`, which every staff role
 * already holds). Both are reduced to the one shape the picker needs.
 */
export default async function DoorScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const requested = typeof params.slot === 'string' ? params.slot : undefined;

  if (!can(session, 'center:attendance')) {
    return (
      <>
        <Heading />
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <ShieldAlert className="size-8 text-err" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{s.forbidden}</p>
        </div>
      </>
    );
  }

  let options: ScanSlotOption[] = [];
  const admin = await adminGetOrForbidden('/api/admin/centers', AdminCentersSchema);
  if (admin) {
    options = admin.centers.flatMap((center) =>
      center.slots
        // Only what can actually be running at a door — plus the one a slot
        // card linked to, even if it was switched off since.
        .filter((slot) => (center.isActive && slot.isActive) || slot.id === requested)
        .map((slot) => ({
          id: slot.id,
          centerName: center.name,
          label: slot.label,
          time: formatSlotTime(slot),
          dayOfWeek: slot.dayOfWeek,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          active: center.isActive && slot.isActive,
        })),
    );
  } else {
    const open = await adminGetOrForbidden('/api/centers', CentersListSchema);
    options = (open?.centers ?? []).flatMap((center) =>
      center.slots.map((slot) => ({
        id: slot.id,
        centerName: center.name,
        label: slot.label,
        time: formatSlotTime(slot),
        dayOfWeek: slot.dayOfWeek,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        active: true,
      })),
    );
  }

  if (options.length === 0) {
    return (
      <>
        <Heading />
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <CalendarClock className="size-8 text-info" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{s.noSlots}</p>
          <p className="max-w-[30rem] text-[length:var(--fs-text-sm)] text-fg-muted">{s.noSlotsHint}</p>
        </div>
      </>
    );
  }

  const { defaultSlotId, nowSlotId } = pickDefault(options, requested);

  return (
    <>
      <Heading />
      <DoorScanner slots={options} defaultSlotId={defaultSlotId} nowSlotId={nowSlotId} />
    </>
  );
}

function Heading() {
  return (
    <div>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {s.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{s.title}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{s.subtitle}</p>
    </div>
  );
}
