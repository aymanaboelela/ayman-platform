import { Suspense } from 'react';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { AssistantWidget } from './assistant-widget';

type AssistantVariant = 'floating' | 'docked';

/**
 * What the three group layouts mount instead of `<AssistantWidget/>` directly.
 *
 * ## Why a slot, and why the Suspense boundary
 *
 * The widget needs the admin's WhatsApp settings, and settings are a server
 * read. Awaiting that read in `(app)/layout.tsx` would make the SHELL await —
 * the thing that file spends a paragraph forbidding, because every client-side
 * transition into the group would then block on it with the previous page
 * still on screen. Wrapped like this, the layout renders immediately and the
 * launcher arrives with the stream, exactly as `NotificationBell` does.
 *
 * ## Why it is not a per-view request
 *
 * `getPublicSettingsOrDefaults()` is `'use cache'` with `cacheLife('hours')`,
 * and `site-footer.tsx` already calls it on every public page. This adds a
 * consumer to a cached read, not a request to a hot path — which is the
 * distinction the dashboard's own taxonomy note was written about after the
 * rate limiter started answering 429.
 *
 * ## Why `null` is a real answer
 *
 * Both fields are admin-editable and start empty. The widget renders no
 * WhatsApp row at all in that case rather than a placeholder link — the panel
 * is otherwise unchanged, and a student who taps it never lands on WhatsApp's
 * own marketing page.
 */
export function AssistantSlot({ variant }: { variant?: AssistantVariant }) {
  return (
    <Suspense fallback={null}>
      <AssistantWithContacts variant={variant} />
    </Suspense>
  );
}

async function AssistantWithContacts({ variant }: { variant?: AssistantVariant }) {
  const { contact } = await getPublicSettingsOrDefaults();

  return (
    <AssistantWidget
      variant={variant}
      whatsapp={{ channel: contact.whatsappChannel, number: contact.whatsapp }}
    />
  );
}
