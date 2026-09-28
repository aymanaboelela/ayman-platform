import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * نفس مناطق الصفحة بالترتيب — الهيرو، المستوى والقرص، أربع بلاطات، الأوائل
 * واللي حواليك — عشان مفيش حاجة تنط لما الريكويست يرجع. الهيرو بلونه الحقيقي
 * مش رمادي: أول حاجة بتبان هي الشريط الملوّن، وسكيلتون رمادي مكانه بيعمل
 * «فلاش» لما يتبدّل.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
        <Skeleton width="wide" className="h-4" />
      </div>

      <div className="h-72 rounded-lg bg-[color-mix(in_oklab,var(--viz-3)_55%,var(--viz-5))] opacity-70 md:h-64" />

      <div className="mt-6 grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4 rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-10" />
          <Skeleton width="full" className="h-3" />
          <Skeleton width="wide" className="h-4" />
        </div>
        <div className="grid place-items-center rounded-lg border border-line bg-surface-2 p-5">
          <Skeleton width="narrow" className="h-36 w-36 rounded-full" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <Skeleton width="narrow" className="h-7" />
            <Skeleton width={index % 2 === 0 ? 'narrow' : 'wide'} className="h-4" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width="narrow" className="h-5" />
            <Skeleton width="full" className="h-40" />
          </div>
        ))}
      </div>
    </main>
  );
}
