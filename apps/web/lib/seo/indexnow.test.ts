import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INDEXNOW_KEY } from '@/app/f13415013728ef05e09cc079e83b86b8.txt/route';
import { submitToIndexNow } from './indexnow';
import { SITE_URL } from './jsonld';

/**
 * ⚠️ The guard the runbook says nothing checks.
 *
 * In IndexNow the FILE NAME is the key. `scripts/indexnow.mjs` reads it off the
 * directory, the app reads the exported constant, and the two are separate
 * strings that must be identical — a rename that moves one and not the other
 * leaves every submission silently rejected, with a key file that still serves
 * 200 and a script that still exits 0.
 */
describe('the IndexNow key', () => {
  it('is the name of the route that serves it', () => {
    const appDir = path.join(import.meta.dirname, '../../app');
    const keyFiles = readdirSync(appDir).filter((name) => /^[0-9a-f]{8,128}\.txt$/.test(name));

    expect(keyFiles).toEqual([`${INDEXNOW_KEY}.txt`]);
  });
});

describe('submitToIndexNow', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /**
   * The suite runs against the default `http://localhost:3200`, which is
   * exactly the origin that must be skipped: an engine accepts a submission
   * only from a host it can fetch the key from, so a dev save would spend a
   * network timeout to be told no.
   */
  it('submits nothing from a local or plain-http origin', async () => {
    expect(SITE_URL.startsWith('https://')).toBe(false);

    await expect(submitToIndexNow(['/news/whatever'])).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits nothing for an empty path list', async () => {
    await expect(submitToIndexNow([])).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The submitting half, with a production-shaped origin. `SITE_URL` is read at
 * module load, so the module is re-imported under a stubbed environment rather
 * than mutated — the same reason `jsonld.ts` computes it once.
 */
describe('submitToIndexNow on a public https origin', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://aymanaboelela.com');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('posts absolute urls, the host and the key location', async () => {
    const { submitToIndexNow: submit } = await import('./indexnow');

    await expect(submit(['/news/مقال', '/news'])).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.indexnow.org/IndexNow');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      host: 'aymanaboelela.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://aymanaboelela.com/${INDEXNOW_KEY}.txt`,
      urlList: ['https://aymanaboelela.com/news/مقال', 'https://aymanaboelela.com/news'],
    });
  });

  it('sends each url once however many times it is passed', async () => {
    const { submitToIndexNow: submit } = await import('./indexnow');

    await submit(['/news', '/news', '/news/a']);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.urlList).toEqual([
      'https://aymanaboelela.com/news',
      'https://aymanaboelela.com/news/a',
    ]);
  });

  /**
   * ⚠️ The rule the whole module is shaped around. Publishing is the user's
   * work; a search engine being unreachable is not their problem and must never
   * surface as a save that appears to have failed.
   */
  it('swallows a network failure rather than failing the publish', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND api.indexnow.org'));
    const { submitToIndexNow: submit } = await import('./indexnow');

    await expect(submit(['/news/a'])).resolves.toBe(false);
  });
});
