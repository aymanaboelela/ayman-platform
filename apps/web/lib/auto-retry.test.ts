import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';
import {
  AUTO_RETRY_MEMORY_MS,
  PROBE_INTERVAL_MS,
  autoRetryPlanFor,
  pendingAutoRetry,
  resetAutoRetryMemory,
  scheduleAutoRetry,
  waitingFor,
} from './auto-retry';
import { UPSTREAM_BUSY_DIGEST } from './upstream-digest';

/**
 * The error screen that brings the page back by itself. What is pinned here is
 * the part that would hurt if it were wrong: WHICH failures get an automatic
 * retry, that none fires before the origin answers (a refresh into a deploy
 * window lands the student on Traefik's bare 404), and that the attempts are
 * bounded.
 */

const networkDrop = () => new TypeError('network error');
const serverFault = (digest = '1389995574') =>
  Object.assign(new Error('An error occurred in the Server Components render.'), { digest });

beforeEach(() => {
  vi.useFakeTimers();
  resetAutoRetryMemory();
  window.history.replaceState(null, '', '/results');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('autoRetryPlanFor', () => {
  it('waits out a dropped connection patiently', () => {
    expect(autoRetryPlanFor(networkDrop())?.kind).toBe('network');
  });

  it('waits longest on a throttle, less on an API that did not answer, once on anything else', () => {
    const busy = autoRetryPlanFor(serverFault(UPSTREAM_BUSY_DIGEST));
    const unanswered = autoRetryPlanFor(serverFault(UPSTREAM_TIMEOUT_DIGEST));
    const other = autoRetryPlanFor(serverFault());

    expect(busy?.kind).toBe('soon');
    expect(unanswered?.kind).toBe('soon');
    expect(other?.delays).toHaveLength(1);
    expect(busy!.delays[0]!).toBeGreaterThan(unanswered!.delays[0]!);
  });

  it('never retries a client-side throw — the same bundle would throw again', () => {
    expect(autoRetryPlanFor(new TypeError("Cannot read properties of null (reading 'replace')"))).toBeNull();
    const chunk = new Error('Failed to load chunk /_next/static/chunks/x.js');
    chunk.name = 'ChunkLoadError';
    expect(autoRetryPlanFor(chunk)).toBeNull();
  });
});

describe('scheduleAutoRetry', () => {
  it('retries a server fault once the origin answers', async () => {
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);
    scheduleAutoRetry(serverFault(), { retry, probe });

    await vi.advanceTimersByTimeAsync(3_999);
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('does not retry into a deploy window, and keeps asking without spending the attempt', async () => {
    // The origin answers nothing for a while — Traefik's 404 while containers
    // swap. A refresh then would be a document load onto that 404.
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    scheduleAutoRetry(serverFault(), { retry, probe });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(probe).toHaveBeenCalledTimes(3);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('waits for the browser to come back online before doing anything', async () => {
    vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);
    scheduleAutoRetry(networkDrop(), { retry, probe });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(probe).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('stops after its plan is spent, so a deterministic fault is not retried forever', async () => {
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);

    const first = scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(retry).toHaveBeenCalledTimes(1);

    // The retry failed the same way: the boundary tears the old effect down
    // and arms for a fresh error object that is the same failure.
    first();
    scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(retry).toHaveBeenCalledTimes(1);
    // …and the screen stops promising a retry that is not coming.
    expect(pendingAutoRetry()).toBeNull();
  });

  it('gives a page that recovered and failed again later the whole plan back', async () => {
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);

    scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(retry).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AUTO_RETRY_MEMORY_MS + 1);
    scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(4_000);

    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('counts each page separately', async () => {
    const retry = vi.fn();
    const probe = vi.fn().mockResolvedValue(true);

    scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(4_000);

    window.history.replaceState(null, '', '/rank');
    scheduleAutoRetry(serverFault(), { retry, probe });
    await vi.advanceTimersByTimeAsync(4_000);

    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('cancels cleanly — a student who moved on never gets a retry landing on top', async () => {
    const retry = vi.fn();
    const teardown = scheduleAutoRetry(serverFault(), { retry, probe: vi.fn().mockResolvedValue(true) });

    await vi.advanceTimersByTimeAsync(1_000);
    teardown();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(retry).not.toHaveBeenCalled();
  });

  it('says it is waiting, for exactly the failure it is waiting on', async () => {
    const error = networkDrop();
    const teardown = scheduleAutoRetry(error, { retry: vi.fn(), probe: vi.fn().mockResolvedValue(false) });

    expect(waitingFor(pendingAutoRetry(), error)).toBe('network');
    // The same failure as a fresh object — what a re-render hands the hook.
    expect(waitingFor(pendingAutoRetry(), networkDrop())).toBe('network');
    expect(waitingFor(pendingAutoRetry(), serverFault())).toBeNull();

    teardown();
    await Promise.resolve();
    expect(pendingAutoRetry()).toBeNull();
  });

  it('does not flicker when a teardown is followed by the same failure re-arming', async () => {
    // A re-render or StrictMode's double effect: cleanup, then the same arm.
    const listener = vi.fn();
    const { subscribePendingAutoRetry } = await import('./auto-retry');
    const stop = subscribePendingAutoRetry(listener);

    const first = scheduleAutoRetry(networkDrop(), { retry: vi.fn(), probe: vi.fn().mockResolvedValue(false) });
    expect(listener).toHaveBeenCalledTimes(1);
    first();
    scheduleAutoRetry(networkDrop(), { retry: vi.fn(), probe: vi.fn().mockResolvedValue(false) });
    await Promise.resolve();

    // Nothing changed for the screen, so nothing was announced.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(pendingAutoRetry()).not.toBeNull();
    stop();
  });
});
