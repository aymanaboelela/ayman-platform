'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { signInWithSocial, type SocialProvider } from '@/lib/auth-client';
import { useShouldShowAppleButton } from '@/lib/use-apple-platform';

/**
 * Both providers land a fresh account on the same place an email/password
 * registration does — onboarding is never complete for a brand-new user, so
 * there is no server round-trip to make first (contrast with the
 * email/password LOGIN path, which genuinely doesn't know and has to ask).
 */
const POST_SOCIAL_CALLBACK_URL = '/onboarding';

/**
 * Google renders unconditionally. Apple renders only on an Apple platform,
 * per `useShouldShowAppleButton` — `false` (hidden) on the server and on the
 * very first client render, so it can never flash into existence on a
 * platform where it doesn't belong.
 *
 * Neither provider can be driven end-to-end in this environment: Google has
 * no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` configured in local `.env`
 * yet, and Apple rejects `http://localhost` redirect URIs outright
 * regardless of configuration (Task 1's report). Both buttons are wired to
 * make the real request and follow whatever the server returns — this is
 * scaffolding, not a verified round-trip.
 */
export function AuthProviders() {
  const showApple = useShouldShowAppleButton();
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null);

  async function handleProviderClick(provider: SocialProvider) {
    if (pendingProvider) return;
    setPendingProvider(provider);
    try {
      const result = await signInWithSocial(provider, POST_SOCIAL_CALLBACK_URL);
      if (result.url) {
        window.location.href = result.url;
        return; // navigating away — no need to clear the pending state
      }
    } catch {
      // Provider-specific failures aren't in scope for the generic-message
      // requirement (that's the email/password login path, S1) — there is
      // no real provider round-trip possible here to fail meaningfully (see
      // the module doc comment above), so this just releases the pending
      // state rather than inventing a message for an error that can't
      // actually happen against a real, configured provider yet.
    }
    setPendingProvider(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" role="separator" aria-label={copy.auth.providers.divider}>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {copy.auth.providers.divider}
        </span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={pendingProvider !== null}
        onClick={() => handleProviderClick('google')}
      >
        {copy.auth.providers.google}
      </Button>

      {showApple && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pendingProvider !== null}
          onClick={() => handleProviderClick('apple')}
        >
          {copy.auth.providers.apple}
        </Button>
      )}
    </div>
  );
}
