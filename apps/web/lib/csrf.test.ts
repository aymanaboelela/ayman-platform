import { afterEach, describe, expect, it } from 'vitest';
import { CSRF_COOKIE, readCsrfToken } from './csrf';

afterEach(() => {
  document.cookie = `${CSRF_COOKIE}=; Path=/; Secure; Max-Age=0`;
});

describe('readCsrfToken', () => {
  it('returns the cookie the proxy minted', () => {
    document.cookie = `${CSRF_COOKIE}=from-proxy; Path=/; Secure`;
    expect(readCsrfToken()).toBe('from-proxy');
  });

  it('never returns empty: a page served from the edge cache arrives without the cookie', () => {
    document.cookie = `${CSRF_COOKIE}=; Path=/; Secure; Max-Age=0`;
    const token = readCsrfToken();
    expect(token).not.toBe('');
    // Written back, so every later request on the page sends the same value.
    expect(readCsrfToken()).toBe(token);
  });
});
