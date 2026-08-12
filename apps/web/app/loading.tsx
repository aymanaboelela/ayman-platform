import { Skeleton } from '@ayman/ui/components/skeleton';

/**
 * The root skeleton — the fallback for any segment that has no closer
 * `loading.tsx`. Deliberately generic: a heading block and a few content
 * bands, nothing that implies a specific page's shape.
 *
 * A Server Component, so it ships inside the SSR'd HTML. Bar widths vary
 * rather than being uniform, which is the biggest "cheap skeleton" tell.
 *
 * The import is the `@ayman/ui/components/skeleton` subpath, not the
 * `@ayman/ui` barrel, and that matters more in this file than in any other:
 * the root `loading.tsx` sits in every route's segment tree, so whatever it
 * imports is registered on every route's client manifest. Through the barrel
 * that meant dialog, dropdown-menu, sheet, field, switch, checkbox and
 * radio-group — seven Radix client modules, ~92 KB raw / ~28 KB gzip —
 * downloaded, parsed and compiled on 64 of the 65 routes, including `/offline`
 * and `/_not-found`, which mount none of them. `skeleton.tsx` on its own pulls
 * in nothing but React types and `../lib/cn`.
 *
 * The other 37 `loading.tsx` files use the subpath for the same reason, one
 * segment down. Keep it that way, and do not swap it for
 * `optimizePackageImports`: the subpath is deterministic, the transform is not.
 * (`tailwind-merge` — 67 KB of the same chunk — still arrives via `cn`, which
 * is genuinely used everywhere. Separate, larger decision.)
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <div className="mb-8 space-y-3">
        <Skeleton width="narrow" className="h-3" />
        <Skeleton width="wide" className="h-8" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-line bg-surface-2 p-5">
            <Skeleton width={index === 1 ? 'narrow' : 'wide'} className="h-5" />
            <Skeleton width="full" className="h-3" />
          </div>
        ))}
      </div>
    </main>
  );
}
