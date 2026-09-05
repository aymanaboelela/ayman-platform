import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAssistantAsk } from './use-assistant-ask';

// The token is read from a cookie that jsdom has no reason to carry, and this
// test is about what comes BACK.
vi.mock('@/lib/csrf', () => ({ CSRF_HEADER: 'x-csrf', readCsrfToken: () => 'token' }));

/**
 * The buttons under an answer, as they actually arrive: over a socket, on the
 * `done` frame, at the end of a stream.
 *
 * `ask.spec.ts` proves the contract drops an href this app does not serve.
 * This proves the drop is on the path a real answer takes — that a `/support`
 * on the wire ends up in NO message state, and therefore in no anchor, rather
 * than being filtered somewhere a future refactor could route around.
 */

/** A `text/event-stream` response, framed the way the API writes one. */
function sseResponse(events: readonly unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function answerWith(events: readonly unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(events));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAssistantAsk — the buttons under an answer', () => {
  it('keeps a destination the app serves', async () => {
    answerWith([
      { t: 'delta', text: 'الأسعار كلها في صفحة الكتب.' },
      { t: 'done', escalate: false, actions: [{ label: 'الكتب وأسعارها', href: '/books' }] },
    ]);

    const { result } = renderHook(() => useAssistantAsk());
    act(() => result.current.ask('الكتب بكام؟'));

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages.at(-1)?.actions).toEqual([
      { label: 'الكتب وأسعارها', href: '/books' },
    ]);
  });

  it('DROPS a path the app does not serve, and keeps the answer', async () => {
    /*
     * The failure mode this whole slice is defending against: an answer that
     * ends in a button to nowhere. The text is still the answer; only the
     * anchor is thrown away, and there is nothing left for the panel to
     * render.
     */
    answerWith([
      { t: 'delta', text: 'ده محتاج أيمن.' },
      { t: 'done', escalate: true, actions: [{ label: 'الدعم', href: '/support' }] },
    ]);

    const { result } = renderHook(() => useAssistantAsk());
    act(() => result.current.ask('مش لاقي حد يرد'));

    await waitFor(() => expect(result.current.busy).toBe(false));
    const answer = result.current.messages.at(-1);
    expect(answer?.text).toBe('ده محتاج أيمن.');
    expect(answer?.escalate).toBe(true);
    expect(answer?.actions).toEqual([]);
  });

  it('reads a done frame that carries no buttons at all', async () => {
    // Every answer before this feature existed, and every answer after it that
    // simply had nowhere to point.
    answerWith([{ t: 'delta', text: 'أهلاً.' }, { t: 'done', escalate: false }]);

    const { result } = renderHook(() => useAssistantAsk());
    act(() => result.current.ask('إزيك'));

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages.at(-1)?.actions).toEqual([]);
  });

  it('leaves the question bubble with no buttons on it', async () => {
    // They belong to the ANSWER. A destination under what the student typed
    // would read as المساعد having put words in their mouth.
    answerWith([
      { t: 'delta', text: 'أهو.' },
      { t: 'done', escalate: false, actions: [{ label: 'نتائجي', href: '/results' }] },
    ]);

    const { result } = renderHook(() => useAssistantAsk());
    act(() => result.current.ask('نتيجتي فين؟'));

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.messages[0]?.actions).toEqual([]);
  });
});
