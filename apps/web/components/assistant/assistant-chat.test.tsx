import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantTranscriptTurn } from '@ayman/contracts/assistant/conversation';

/*
 * `useAssistantAsk` reaches `fetch` and an `AbortController`, neither of
 * which this test needs — it is only asserting the SHAPE of the transcript's
 * own scroller, not anything the hook streams into it. Stubbed at the module
 * boundary the same way `assistant-thread.test.tsx` stubs `@/lib/api`.
 */
vi.mock('./use-assistant-ask', () => ({
  useAssistantAsk: () => ({
    messages: [],
    busy: false,
    waiting: false,
    ask: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  }),
}));

const { AssistantChat } = await import('./assistant-chat');

afterEach(() => {
  cleanup();
});

describe('AssistantChat — the transcript scroller must not leak into the page', () => {
  it('carries `overscroll-contain` beside `overflow-y-auto`, so a reader who scrolls past the top or bottom of المساعد’s own transcript does not drag the page behind the panel with them', () => {
    /*
     * «لما أقف عليها وأسكرول للي فوق تسكرول لأن مش بتسكرول بالفقرة» — this box
     * is a SECOND scroller, separate from `AssistantThread`'s `.chat-scroller`
     * (which already has this in `chat.css`), and it never got the same
     * treatment. Asserted by class rather than by simulating a physical
     * scroll: jsdom implements no scrolling, so the class is the whole of
     * what is testable here — the browser is responsible for the rest.
     */
    const transcriptRef = { current: [] as AssistantTranscriptTurn[] };
    const { container } = render(
      <AssistantChat
        transcriptRef={transcriptRef}
        handoff="idle"
        onEscalate={() => {}}
        onNewQuestion={() => {}}
        onOpenHandoffForm={() => {}}
        onOpenThread={() => {}}
      />,
    );

    const scroller = container.querySelector('.overflow-y-auto');
    expect(scroller).not.toBeNull();
    expect(scroller).toHaveClass('overscroll-contain');
  });
});
