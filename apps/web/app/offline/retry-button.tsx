'use client';

/**
 * «حاول تاني» — a reload, not a router push.
 *
 * `router.refresh()` would ask the Next client router to re-fetch the current
 * route, and the current route IS this page: the student would be retrying the
 * offline screen. `location.reload()` re-issues the navigation the service
 * worker intercepted, which is the request that actually failed.
 *
 * The label is passed in rather than read here so this file holds no Arabic —
 * every user-facing string in the product comes from `copy`.
 */
export function RetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] transition-colors duration-[160ms] hover:bg-accent-hover"
    >
      {label}
    </button>
  );
}
