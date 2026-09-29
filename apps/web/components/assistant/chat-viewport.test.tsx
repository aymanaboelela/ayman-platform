import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { ChatViewport } from './chat-viewport';
import type { ChatLatest } from './use-chat-scroll';

const cc = copy.assistant.chat;

afterEach(() => {
  cleanup();
});

/*
 * jsdom lays nothing out and implements no element scrolling, so the
 * scroller's position is set by hand and `scrollTo` is a spy. What is under
 * test is the DECISION — follow, count, or leave alone — not the browser's
 * arithmetic, which the CSS below is responsible for.
 */
let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: scrollTo,
  });
});

function scroller(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-chat-scroller]')!;
}

/** Puts the reader `px` above the newest message and tells the viewport. */
function scrollUp(px: number) {
  const element = scroller();
  // `column-reverse`: the origin is the bottom and scrollTop runs negative.
  element.scrollTop = -px;
  fireEvent.scroll(element);
}

function latest(key: string, at: string, fromSelf = false): ChatLatest {
  return { key, at, fromSelf };
}

function view(value: ChatLatest | null) {
  return (
    <ChatViewport latest={value} label={cc.regionLabel}>
      <ol>
        <li>…</li>
      </ol>
    </ChatViewport>
  );
}

/*
 * By class, not by role and name: while the reader is at the bottom the button
 * is `aria-hidden` (it is not there for them), and a hidden element has no
 * accessible name to query by. Its label is asserted as an attribute instead.
 */
const jump = () => document.querySelector<HTMLButtonElement>('.chat-jump')!;

describe('ChatViewport', () => {
  it('opens on the newest message — the scroller is column-reverse, so its origin IS the bottom', () => {
    /*
     * «بيجيلي الشات من فوق مش من آخر حاجة مبعوتة». The fix is structural and
     * lives in CSS: a `column-reverse` scroller starts at its END, in the
     * server's HTML, with no script and no jump. This pins both halves — the
     * markup that has exactly one stream inside the scroller, and the rule
     * that reverses it — so neither can be "tidied" away on its own.
     */
    render(view(latest('m1', '2026-09-29T10:00:00Z')));
    const element = scroller();
    expect(element.children).toHaveLength(1);
    expect(element.firstElementChild).toHaveClass('chat-stream');

    const css = readFileSync(join(import.meta.dirname, 'chat.css'), 'utf8');
    const rule = /\.chat-scroller\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/flex-direction:\s*column-reverse/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
  });

  it('offers no jump button while the reader is at the bottom', () => {
    render(view(latest('m1', '2026-09-29T10:00:00Z')));
    expect(jump()).toHaveAttribute('data-visible', 'false');
    expect(jump()).toHaveAttribute('tabindex', '-1');
  });

  it('offers it once the reader has scrolled up, and it takes them back down', () => {
    render(view(latest('m1', '2026-09-29T10:00:00Z')));
    act(() => scrollUp(600));
    expect(jump()).toHaveAttribute('data-visible', 'true');

    fireEvent.click(jump());
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('counts a message from the other side that lands while the reader is up the thread — and does not move them', () => {
    const { rerender } = render(view(latest('m1', '2026-09-29T10:00:00Z')));
    act(() => scrollUp(600));
    rerender(view(latest('m2', '2026-09-29T10:05:00Z')));

    expect(scrollTo).not.toHaveBeenCalled();
    expect(jump()).toHaveAttribute('aria-label', cc.jumpUnseen.replace('{n}', '1'));
    // Visible, so it IS named for assistive tech.
    expect(screen.getByRole('button', { name: cc.jumpUnseen.replace('{n}', '1') })).toBe(jump());
    expect(jump()).toHaveTextContent('1');
  });

  it('follows the reader’s OWN message down, however far up they were', () => {
    const { rerender } = render(view(latest('m1', '2026-09-29T10:00:00Z')));
    act(() => scrollUp(600));
    rerender(view(latest('pending', '2026-09-29T10:05:00Z', true)));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('carries a reader who is NEAR the bottom along with a new message', () => {
    const { rerender } = render(view(latest('m1', '2026-09-29T10:00:00Z')));
    act(() => scrollUp(40));
    rerender(view(latest('m2', '2026-09-29T10:05:00Z')));

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(jump()).toHaveAttribute('aria-label', cc.jumpLabel);
  });

  it('does not count a DELETE of the last message as a new one', () => {
    const { rerender } = render(view(latest('m2', '2026-09-29T10:05:00Z')));
    act(() => scrollUp(600));
    // «مسح» on m2: the last message is now the older m1.
    rerender(view(latest('m1', '2026-09-29T10:00:00Z')));

    expect(jump()).toHaveAttribute('aria-label', cc.jumpLabel);
  });

  it('clears the count when the reader gets back to the bottom', () => {
    const { rerender } = render(view(latest('m1', '2026-09-29T10:00:00Z')));
    act(() => scrollUp(600));
    rerender(view(latest('m2', '2026-09-29T10:05:00Z')));
    expect(jump()).toHaveTextContent('1');

    act(() => scrollUp(0));
    expect(jump()).toHaveAttribute('data-visible', 'false');
    expect(jump()).toHaveAttribute('aria-label', cc.jumpLabel);
  });
});
