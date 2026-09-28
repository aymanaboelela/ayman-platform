import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The push repair is its own concern, and it reaches for service workers.
vi.mock('@/lib/push-subscribe', () => ({ ensurePushSubscribed: () => Promise.resolve() }));

import { NotificationStreamProvider } from './notification-stream';
import { isStreamConnected, onStreamOpen, subscribeQueue } from './live-bus';

/** A stand-in `EventSource` the test drives by hand. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

const FRAME = JSON.stringify({
  type: 'notification',
  unread: 3,
  notification: {
    id: 'n1',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    kind: 'quiz_graded',
    attemptId: 'a1',
    lessonId: 'l1',
    lessonTitle: 'المتغيرات',
    scorePercent: 85,
    passed: true,
  },
});

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

async function deliver(source: FakeEventSource) {
  await act(async () => {
    source.onmessage?.({ data: FRAME } as MessageEvent<string>);
    // The handler parses on a dynamic import; let it settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('NotificationStreamProvider', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    toast.mockClear();
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('toasts a live notification in a tab someone is looking at, one id per kind', async () => {
    setVisibility('visible');
    render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    await deliver(FakeEventSource.instances[0]!);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[1]).toMatchObject({ id: 'live-quiz_graded' });
  });

  it('does not toast in a HIDDEN tab — the toasts there never expire and piled up until the tab crashed', async () => {
    setVisibility('hidden');
    render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    await deliver(FakeEventSource.instances[0]!);
    await deliver(FakeEventSource.instances[0]!);
    expect(toast).not.toHaveBeenCalled();
  });

  it('reopens a stream the browser gave up on (a deploy answered its reconnect with 404)', () => {
    vi.useFakeTimers();
    render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    const first = FakeEventSource.instances[0]!;

    // An ordinary drop: the browser is still reconnecting, nothing to do.
    first.readyState = FakeEventSource.CONNECTING;
    first.onerror?.();
    vi.advanceTimersByTime(120_000);
    expect(FakeEventSource.instances).toHaveLength(1);

    // Given up: CLOSED. A new stream opens after the backoff.
    first.readyState = FakeEventSource.CLOSED;
    first.onerror?.();
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(5_000);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('hands a queue frame to the bus — no toast, the review screen redraws instead', async () => {
    setVisibility('visible');
    const heard: number[] = [];
    const off = subscribeQueue('payments', (waiting) => heard.push(waiting));
    render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    const source = FakeEventSource.instances[0]!;

    await act(async () => {
      source.onmessage?.({
        data: JSON.stringify({ type: 'queue', queue: 'payments', waiting: 4 }),
      } as MessageEvent<string>);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    off();
    expect(heard).toEqual([4]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('tells the live screens when it (re)connects and when it drops', () => {
    let opens = 0;
    const off = onStreamOpen(() => {
      opens += 1;
    });
    const view = render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    const source = FakeEventSource.instances[0]!;

    source.readyState = FakeEventSource.OPEN;
    act(() => source.onopen?.());
    expect(isStreamConnected()).toBe(true);
    expect(opens).toBe(1);

    // The browser reconnecting on its own is still "down" until it is back.
    source.readyState = FakeEventSource.CONNECTING;
    act(() => source.onerror?.());
    expect(isStreamConnected()).toBe(false);

    source.readyState = FakeEventSource.OPEN;
    act(() => source.onopen?.());
    expect(opens).toBe(2);

    view.unmount();
    off();
    expect(isStreamConnected()).toBe(false);
  });

  it('reopens a stream that went silent — no heartbeat for over a minute is a dead socket, not a quiet one', () => {
    vi.useFakeTimers();
    render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    const first = FakeEventSource.instances[0]!;
    first.readyState = FakeEventSource.OPEN;
    act(() => first.onopen?.());

    // Heartbeats keep it alive.
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        vi.advanceTimersByTime(25_000);
        first.onmessage?.({ data: JSON.stringify({ type: 'ping' }) } as MessageEvent<string>);
      });
    }
    expect(FakeEventSource.instances).toHaveLength(1);

    // Then nothing at all.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('opens nothing more once unmounted', () => {
    vi.useFakeTimers();
    const view = render(<NotificationStreamProvider>{null}</NotificationStreamProvider>);
    const first = FakeEventSource.instances[0]!;
    first.readyState = FakeEventSource.CLOSED;
    first.onerror?.();
    view.unmount();
    vi.advanceTimersByTime(120_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
