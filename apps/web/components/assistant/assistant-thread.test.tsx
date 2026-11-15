import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import type { ConversationThread } from '@ayman/contracts/assistant/conversation';
import type { HomeworkFeedbackCard } from '@ayman/contracts/assistant/homework-card';

/* The panel posts through `@/lib/api`; stubbed at the module boundary so these
   tests are about the RENDER and nothing reaches a network. */
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
  apiPostVoid: vi.fn(() => Promise.resolve()),
}));

/* `next/image` wants a loader and a config this harness has no reason to carry. */
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { AssistantThread } = await import('./assistant-thread');

const c = copy.assistant.thread;
const cc = copy.assistant.chat;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  apiPost.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

function message(
  id: string,
  author: 'visitor' | 'admin',
  createdAt: string,
  body: string,
): ConversationThread['messages'][number] {
  return {
    id,
    author,
    body,
    createdAt,
    adminReaction: null,
    attachment: null,
    editedAt: null,
    replyTo: null,
    homeworkCard: null,
  };
}

const THREAD: ConversationThread = {
  id: '0193c6f0-0000-7000-8000-000000000001',
  status: 'answered',
  entryPath: ['root'],
  unreadForVisitor: 0,
  messages: [
    message('0193c6f0-0000-7000-8000-00000000000a', 'visitor', '2026-09-29T08:00:00Z', 'سؤالي عن الكورس'),
    message('0193c6f0-0000-7000-8000-00000000000b', 'admin', '2026-09-29T08:30:00Z', 'أهلًا، الرد هنا'),
    message('0193c6f0-0000-7000-8000-00000000000c', 'admin', '2026-09-29T08:31:00Z', 'وده كمان'),
  ],
};

describe('AssistantThread — the student’s end of the chat', () => {
  it('draws the thread inside the scroller that opens on the newest message', () => {
    render(<AssistantThread thread={THREAD} onUpdated={() => {}} />);
    const region = screen.getByRole('region', { name: cc.regionLabel });
    expect(region).toHaveAttribute('data-chat-scroller');
    // Everything, including the day chip, lives inside it.
    expect(region).toHaveTextContent('سؤالي عن الكورس');
    expect(region).toHaveTextContent('وده كمان');
  });

  it('puts the student’s own words on THEIR side, and his on the other', () => {
    render(<AssistantThread thread={THREAD} onUpdated={() => {}} />);
    expect(screen.getByText('سؤالي عن الكورس').closest('.chat-row')).toHaveClass('chat-row--own');
    expect(screen.getByText('أهلًا، الرد هنا').closest('.chat-row')).toHaveClass('chat-row--other');
  });

  it('runs his two replies together, naming him once and tailing the last', () => {
    const { container } = render(<AssistantThread thread={THREAD} onUpdated={() => {}} />);
    const first = screen.getByText('أهلًا، الرد هنا').closest('.chat-row')!;
    const second = screen.getByText('وده كمان').closest('.chat-row')!;
    expect(first).toHaveClass('chat-row--start');
    expect(first).not.toHaveClass('chat-row--end');
    expect(second).toHaveClass('chat-row--end');
    expect(second).not.toHaveClass('chat-row--start');
    // One byline for the run — gated through `tenantName`, which is his own
    // name verbatim on his stack (no TENANT_KEY in this harness).
    expect(container.querySelectorAll('.chat-byline')).toHaveLength(1);
  });

  it('gives each day its own list, with its chip first — so the chip leaves with its day', () => {
    /*
     * The chip is sticky, and a sticky box is held inside its parent. With
     * every day in one list the parent was the whole thread, so scrolling back
     * over three days piled three chips on the same spot. One list per day is
     * the whole fix; this pins the shape the CSS relies on.
     */
    const twoDays: ConversationThread = {
      ...THREAD,
      messages: [
        message('0193c6f0-0000-7000-8000-000000000001', 'visitor', '2026-09-27T08:00:00Z', 'من يومين'),
        ...THREAD.messages,
      ],
    };
    const { container } = render(<AssistantThread thread={twoDays} onUpdated={() => {}} />);
    const chips = [...container.querySelectorAll('.chat-day')];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.parentElement).toHaveClass('chat-list', 'chat-list--day');
      expect(chip.parentElement?.firstElementChild).toBe(chip);
    }
    expect(chips[0]!.parentElement).toHaveTextContent('من يومين');
    expect(chips[0]!.parentElement).not.toHaveTextContent('سؤالي عن الكورس');
    expect(chips[1]!.parentElement).toHaveTextContent('سؤالي عن الكورس');
    expect(chips[1]!.parentElement).not.toHaveTextContent('من يومين');
  });

  it('never addresses the student by «إنت» — their side needs no byline', () => {
    render(<AssistantThread thread={THREAD} onUpdated={() => {}} />);
    expect(screen.queryByText(c.you)).toBeNull();
  });

  it('shows what was sent at once, and hands the stored thread up when it lands', async () => {
    let resolve!: (value: ConversationThread) => void;
    apiPost.mockReturnValue(new Promise<ConversationThread>((done) => (resolve = done)));
    const onUpdated = vi.fn();
    render(<AssistantThread thread={THREAD} onUpdated={onUpdated} />);

    fireEvent.change(screen.getByRole('textbox', { name: c.replyPlaceholder }), {
      target: { value: 'سؤال تاني' },
    });
    fireEvent.click(screen.getByRole('button', { name: c.send }));

    // The box is empty and the words are already in the conversation.
    expect(screen.getByRole('textbox', { name: c.replyPlaceholder })).toHaveValue('');
    expect(screen.getByText('سؤال تاني').closest('.chat-row')).toHaveClass('chat-row--pending');
    expect(screen.getByRole('img', { name: cc.sending })).toBeInTheDocument();

    const stored: ConversationThread = {
      ...THREAD,
      messages: [
        ...THREAD.messages,
        message('0193c6f0-0000-7000-8000-00000000000d', 'visitor', '2026-09-29T09:00:00Z', 'سؤال تاني'),
      ],
    };
    await act(async () => resolve(stored));
    expect(onUpdated).toHaveBeenCalledWith(stored);
    expect(document.querySelector('.chat-row--pending')).toBeNull();
  });

  describe('«تصحيح الواجب» — a homework review as a card', () => {
    const card: HomeworkFeedbackCard = {
      submissionId: '0193c6f0-0000-7000-8000-0000000000aa',
      lessonId: '0193c6f0-0000-7000-8000-0000000000bb',
      lessonTitle: 'المحاضرة التالتة',
      courseSlug: 'prog-2',
      verdict: 'needs_work',
      grade: null,
      attempt: 1,
    };
    const h = c.homeworkCard;

    function withCard(body: string, overrides: Partial<HomeworkFeedbackCard> = {}): ConversationThread {
      return {
        ...THREAD,
        messages: [
          ...THREAD.messages,
          {
            ...message('0193c6f0-0000-7000-8000-00000000000e', 'admin', '2026-09-29T09:00:00Z', body),
            homeworkCard: { ...card, ...overrides },
          },
        ],
      };
    }

    it('splits the note into strengths and fixes, under the lecture and the verdict', () => {
      render(
        <AssistantThread
          thread={withCard('شغل حلو\n✅ الخطوات مترتبة\n✏️ الوحدات ناقصة')}
          onUpdated={() => {}}
        />,
      );
      const link = screen.getByRole('link', { name: new RegExp(card.lessonTitle) });
      expect(link).toHaveAttribute('href', '/courses/prog-2/lessons/0193c6f0-0000-7000-8000-0000000000bb#homework');
      expect(link).toHaveClass('chat-hw--needs-work');
      expect(link).toHaveTextContent(h.needsWork);
      expect(link).toHaveTextContent(h.action);

      const [good, improve] = within(link).getAllByRole('list');
      expect(good).toHaveTextContent(/^الخطوات مترتبة$/);
      expect(improve).toHaveTextContent(/^الوحدات ناقصة$/);
      expect(screen.getByText(h.good)).toBeInTheDocument();
      expect(screen.getByText(h.improve)).toBeInTheDocument();
      // The marks are the format, not the content — they are not drawn twice.
      expect(link).not.toHaveTextContent('✅');
      // The card IS the bubble's content; the note is not printed a second time.
      expect(screen.getAllByText('شغل حلو')).toHaveLength(1);
    });

    it('shows the mark on an accepted answer, and an unmarked note as written', () => {
      render(<AssistantThread thread={withCard('تمام كده.', { verdict: 'accepted', grade: 85 })} onUpdated={() => {}} />);
      const link = screen.getByRole('link', { name: new RegExp(card.lessonTitle) });
      expect(link).toHaveClass('chat-hw--accepted');
      expect(link).toHaveTextContent(h.accepted);
      expect(link).toHaveTextContent('85 من 100');
      expect(link).toHaveTextContent(h.note);
      expect(link).toHaveTextContent('تمام كده.');
      expect(within(link).queryByRole('list')).toBeNull();
    });

    it('never draws a card on the student’s own message', () => {
      const forged: ConversationThread = {
        ...THREAD,
        messages: [
          { ...message('0193c6f0-0000-7000-8000-00000000000f', 'visitor', '2026-09-29T09:00:00Z', 'رسالتي'), homeworkCard: card },
        ],
      };
      render(<AssistantThread thread={forged} onUpdated={() => {}} />);
      expect(screen.queryByRole('link', { name: new RegExp(card.lessonTitle) })).toBeNull();
      expect(screen.getByText('رسالتي')).toBeInTheDocument();
    });
  });

  it('gives the words back when the send fails', async () => {
    apiPost.mockRejectedValue(new Error('offline'));
    render(<AssistantThread thread={THREAD} onUpdated={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: c.replyPlaceholder }), {
      target: { value: 'مهم' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: c.send }));
    });

    expect(screen.getByRole('textbox', { name: c.replyPlaceholder })).toHaveValue('مهم');
    expect(screen.getByRole('alert')).toHaveTextContent(copy.assistant.escalate.failed);
  });
});
