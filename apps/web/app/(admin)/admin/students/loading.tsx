import { Skeleton } from '@ayman/ui';
import { copy } from '@ayman/contracts';

const ROW_WIDTHS = ['full', 'wide', 'narrow', 'wide', 'full', 'narrow'] as const;

export default function StudentsLoading() {
  return (
    <>
      <Skeleton width="narrow" className="mb-16 h-24" />
      <div className="mb-16">
        <Skeleton width="narrow" className="h-9 max-w-72" />
      </div>
      <div className="w-full overflow-hidden rounded-[var(--r-lg)] border border-line">
        {ROW_WIDTHS.map((width, index) => (
          <div key={index} className="border-b border-line-subtle px-12 py-12 last:border-b-0">
            <Skeleton width={width} />
          </div>
        ))}
      </div>
      <span className="sr-only">{copy.common.loading}</span>
    </>
  );
}
