import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { formatEGP } from '@/lib/price';
import { Chip, yearLabel } from '../../centers-ui';

const c = copy.admin.centers;

/** The slot's title block — shared with the sheet, which is the same slot
 *  seen from its dates rather than its people. */
export function SlotHeader({
  eyebrow,
  title,
  year,
  full,
  active,
  priceCents,
}: {
  eyebrow: string;
  title: string;
  year: number | null;
  full: boolean;
  active: boolean;
  priceCents: number | null;
}) {
  return (
    <div>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{title}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip color={year === null ? 'var(--viz-5)' : 'var(--viz-3)'}>{yearLabel(year)}</Chip>
        <Chip color="var(--viz-1)">
          {priceCents === null ? c.noPrice : formatCopy(c.perClass, { price: formatEGP(priceCents) })}
        </Chip>
        {full ? <Chip color="var(--warn)">{c.full}</Chip> : null}
        {!active ? <Chip color="var(--err)">{c.inactive}</Chip> : null}
      </div>
    </div>
  );
}
