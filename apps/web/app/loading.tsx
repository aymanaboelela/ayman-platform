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
/**
 * ⚠️ The root element is a `<div aria-hidden>`, NOT a `<main>`, and that is not
 * cosmetic.
 *
 * A streamed response carries the Suspense FALLBACK and the real content in the
 * same HTML document — the fallback in the prerendered shell, the content in the
 * tail that an inline script swaps in. A browser ends up with one `<main>`. A
 * crawler that does not run JS — which is most of the AI ones — parses the whole
 * document and sees every `<main>` in it. With this skeleton and the segment
 * skeleton both claiming the landmark, `/` served THREE `<main>` elements, the
 * first two full of shimmer bars, and the page's real `<h1>` arrived after the
 * footer. An AI-readiness scan on 2026-09-13 scored the site 0/20 on heading
 * hierarchy, 0/20 on semantic elements and 0/10 on landmarks because of it.
 *
 * A loading placeholder is not a landmark and has no accessible name worth
 * exposing, so `aria-hidden` is the honest markup here as well as the one that
 * leaves exactly one `<main>` in the document.
 *
 * Do not put an `<h1>`…`<h6>` in a skeleton for the same reason — an empty
 * heading in the shell outranks the real one in source order.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
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
    </div>
  );
}
