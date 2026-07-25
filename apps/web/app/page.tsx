import { copy } from '@ayman/contracts';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[var(--w-shell)] flex-col justify-center px-6">
      <p className="eyebrow mb-3">01 / المنصة</p>
      <h1 className="text-[length:var(--fs-display-2)] font-semibold leading-[var(--lh-display-2)]">
        {copy.site.name}
      </h1>
      <p className="mt-4 max-w-[var(--w-prose)] text-fg-muted">{copy.site.tagline}</p>
    </main>
  );
}
