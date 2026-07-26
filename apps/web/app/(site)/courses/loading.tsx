import { Card, CardBody, CardHeader, Skeleton } from '@ayman/ui';

/**
 * A Server Component, so this ships inside the SSR'd HTML. Bar widths vary
 * (100% / 85% / 60% via `Skeleton`'s `width` prop) — uniform bars are the
 * single biggest "cheap skeleton" tell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-16">
      <Skeleton width="narrow" className="mb-2 h-3" />
      <Skeleton width="wide" className="mb-2 h-9" />
      <Skeleton width="narrow" className="mb-10 h-4" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardHeader className="flex items-start justify-between gap-3">
              <Skeleton width="wide" className="h-5" />
              <Skeleton className="h-5 w-14 shrink-0" />
            </CardHeader>
            <CardBody className="space-y-3">
              <Skeleton width="full" className="h-4" />
              <Skeleton width="narrow" className="h-3" />
            </CardBody>
          </Card>
        ))}
      </div>
    </main>
  );
}
