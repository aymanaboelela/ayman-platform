import type { Metadata } from 'next';
import { copy } from '@ayman/contracts';
import { DevicesList } from '@/components/settings/devices-list';

export const metadata: Metadata = { title: copy.settings.devices.title };

/**
 * أجهزتي — server shell (title/subtitle only, no async work, so no
 * Suspense/`loading.tsx` boundary is needed under `cacheComponents`) around
 * the client `DevicesList`, which owns its own fetch/loading/error states
 * (the data is inherently per-user and depends on the request's own
 * session, so there is nothing here worth prerendering).
 */
export default function DevicesPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-[length:var(--fs-title-1)] font-semibold">
        {copy.settings.devices.title}
      </h1>
      <p className="mb-8 text-[length:var(--fs-text-base)] text-fg-muted">
        {copy.settings.devices.subtitle}
      </p>
      <DevicesList />
    </main>
  );
}
