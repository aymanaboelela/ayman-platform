import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «المتابعة بحساب جوجل» must not be on a login page whose deployment has no
 * Google app.
 *
 * `auth.config.ts` registers the provider conditionally — no client id, no
 * provider — but this button used to render unconditionally. So a stack
 * without credentials showed the button, and pressing it asked Better Auth for
 * a provider that was never registered. The API is behaving correctly
 * throughout, which is exactly what makes a dead button like this survive.
 *
 * Invisible on Ayman's platform, because his stack has the credentials. Real
 * the moment a second instructor's does not — and phone-only sign-up is the
 * decision for the new instructors.
 *
 * The flag is read at MODULE LOAD, so each case resets the registry and
 * re-imports rather than just reassigning `process.env`.
 */
vi.mock('@/lib/auth-client', () => ({ signInWithSocial: vi.fn() }));

async function renderWith(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ENABLED;
  else process.env.NEXT_PUBLIC_GOOGLE_ENABLED = value;

  vi.resetModules();
  const { AuthProviders } = await import('./auth-providers');
  return render(<AuthProviders next={null} />);
}

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.NEXT_PUBLIC_GOOGLE_ENABLED;
});

afterEach(() => {
  cleanup();
  if (saved === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ENABLED;
  else process.env.NEXT_PUBLIC_GOOGLE_ENABLED = saved;
  vi.resetModules();
});

describe('AuthProviders', () => {
  it('renders the Google button when the deployment has a Google app', async () => {
    const { container } = await renderWith('1');

    expect(screen.getByRole('button')).toBeTruthy();
    expect(container.textContent).toContain('جوجل');
  });

  it('renders NOTHING when the deployment has no Google app', async () => {
    const { container } = await renderWith(undefined);

    expect(container.innerHTML).toBe('');
  });

  it('treats an empty string as "no Google app"', async () => {
    // This is the value that actually arrives: `docker-compose.yml` derives the
    // flag with `${GOOGLE_CLIENT_ID:+1}`, which substitutes an EMPTY STRING —
    // not an absent key — when the credential is unset.
    const { container } = await renderWith('');

    expect(container.innerHTML).toBe('');
  });

  it('takes the divider with it, not just the button', async () => {
    // A separator hanging above empty space reads as something that failed to
    // load, which is worse than the dead button it replaced.
    const { container } = await renderWith('');

    expect(container.querySelector('[role="separator"]')).toBeNull();
  });
});
