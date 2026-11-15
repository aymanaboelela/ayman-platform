import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Every public page renders `<SiteAccountSlot>`, which awaits `getSession()`.
 * An anonymous visitor must cost the API nothing: no cookie, no fetch.
 */
const headerStore = new Headers();
vi.mock('next/headers', () => ({ headers: async () => headerStore }));
const apiFetch = vi.fn();
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiRequestError: class extends Error {},
}));

const { cookieHeaderHasSession, getSession } = await import('./session');

afterEach(() => {
  apiFetch.mockReset();
  headerStore.delete('cookie');
});

describe('cookieHeaderHasSession', () => {
  it('finds either spelling anywhere in the header', () => {
    expect(cookieHeaderHasSession('__Host-session_token=a')).toBe(true);
    expect(cookieHeaderHasSession('__Host-csrf=x; session_token=a')).toBe(true);
  });

  it('is false for no header, other cookies, or a look-alike name', () => {
    expect(cookieHeaderHasSession(null)).toBe(false);
    expect(cookieHeaderHasSession('__Host-csrf=x; theme=dark')).toBe(false);
    expect(cookieHeaderHasSession('my_session_token=a')).toBe(false);
  });
});

describe('getSession — anonymous', () => {
  it('answers null without asking the API when there is no session cookie', async () => {
    headerStore.set('cookie', '__Host-csrf=x');
    await expect(getSession()).resolves.toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('still asks the API when a session cookie is present', async () => {
    headerStore.set('cookie', '__Host-session_token=a');
    apiFetch.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(getSession()).resolves.toBeNull();
    expect(apiFetch).toHaveBeenCalledOnce();
  });
});
