'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { signInWithSocial } from '@/lib/auth-client';
import { withNext } from '@/lib/safe-next';

/**
 * A fresh social account lands on the same place an email/password
 * registration does — onboarding is never complete for a brand-new user, so
 * there is no server round-trip to make first (contrast with the
 * email/password LOGIN path, which genuinely doesn't know and has to ask).
 */
const POST_SOCIAL_CALLBACK_URL = '/onboarding';

/**
 * Google's four-colour "G", inlined rather than pulled from `simple-icons`
 * like `components/site/social-icons.tsx` does for the footer marks. That
 * package ships every brand as a single monochrome silhouette path, which is
 * explicitly NOT what Google's sign-in branding guidelines permit on a
 * "continue with Google" button — the mark has to be the four-colour G (or
 * its white/mono variants, neither of which fits this surface). Four paths,
 * fixed brand hex values, no `currentColor`: the colours are the point.
 *
 * `aria-hidden` because the button already carries the full Arabic label —
 * a title on the mark would make screen readers announce "Google" twice.
 */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Google is the only social provider on this surface. Apple was removed from
 * the UI — the API-side Apple wiring in `auth.config.ts` is still present but
 * inert (it only registers when the four `APPLE_*` env vars are set, and they
 * aren't), so bringing the button back later is a UI-only change.
 */
export function AuthProviders({ next }: { next?: string | null }) {
  const [pending, setPending] = useState(false);

  async function handleGoogleClick() {
    if (pending) return;
    setPending(true);
    try {
      // `next` is carried on the callback URL rather than acted on here: this
      // handler navigates to Google and never regains control, so the only way
      // a visitor's original destination survives the round trip is by being
      // part of where Google sends them back to.
      const result = await signInWithSocial('google', withNext(POST_SOCIAL_CALLBACK_URL, next));
      if (result.url) {
        window.location.href = result.url;
        return; // navigating away — no need to clear the pending state
      }
    } catch {
      // Provider-specific failures aren't in scope for the generic-message
      // requirement (that's the email/password login path, S1). Releasing the
      // pending state is the whole handler: the user can simply press again,
      // and inventing a distinct message here would be the one place the UI
      // leaks *which* step failed.
    }
    setPending(false);
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
        disabled={pending}
        onClick={handleGoogleClick}
      >
        <GoogleMark />
        {copy.auth.providers.google}
      </Button>
    </div>
  );
}
