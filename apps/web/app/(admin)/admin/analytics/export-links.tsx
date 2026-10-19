import { Download } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.analytics;

/**
 * «تنزيل Excel» plus the raw CSV beside it, for every analytics export.
 *
 * Excel is the main button because that is what the instructor opens: the CSV
 * landed in one column on an Arabic Windows (`apps/api/.../analytics/xlsx.ts`
 * says why). The CSV stays as a quiet link for the pandas workflow it was
 * built for. `base` is the export path without its extension and `query` the
 * screen's filters, so both files are always the table on the screen.
 */
export function ExportLinks({
  base,
  query = '',
  className,
}: {
  base: string;
  query?: string;
  className?: string;
}) {
  const qs = query ? `?${query}` : '';
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <a
        href={`${base}.xlsx${qs}`}
        download
        title={c.exportXlsxHint}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5',
          'text-[length:var(--fs-text-sm)] font-medium text-fg',
          'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
        )}
      >
        <Download className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        {c.exportXlsx}
      </a>
      <a
        href={`${base}.csv${qs}`}
        download
        title={c.exportHint}
        className={cn(
          'rounded-md px-2 py-1.5 text-[length:var(--fs-text-xs)] text-fg-muted',
          'transition-colors duration-[160ms] ease-out hover:bg-surface-2 hover:text-fg',
        )}
      >
        {c.exportCsv}
      </a>
    </div>
  );
}
