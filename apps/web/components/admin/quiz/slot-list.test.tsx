import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import { SlotList, type QuizSlotRow } from './slot-list';

const apiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPatch: vi.fn().mockResolvedValue({ ok: true }),
  apiPost: vi.fn().mockResolvedValue({ ok: true }),
  apiDelete: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * `SortableList` drags through dnd-kit, which needs a real pointer and a
 * layout jsdom does not provide. These tests are about the ROW — what it
 * fetches and when — so the list renders its items plainly.
 */
vi.mock('../sortable-list', () => ({
  SortableList: ({
    items,
    renderItem,
  }: {
    items: QuizSlotRow[];
    renderItem: (item: QuizSlotRow, handle: unknown) => React.ReactNode;
  }) => <div>{items.map((item) => <div key={item.id}>{renderItem(item, { attributes: {}, listeners: {} })}</div>)}</div>,
}));

const CATEGORIES = [{ id: 'cat-1', name: 'فئة' }];

function questionSlot(overrides: Partial<QuizSlotRow> = {}): QuizSlotRow {
  return {
    id: 'slot-1',
    paper: 'original',
    position: 0,
    maxMark: 2,
    kind: 'question',
    bankEntryId: 'entry-1',
    type: 'mcq_single',
    stemHtml: '<p>أي مجموعة من دي كلها مجالات علوم الحاسب؟</p>',
    poolName: null,
    poolPickCount: null,
    ...overrides,
  };
}

function renderList(slots: QuizSlotRow[]) {
  return render(
    <SlotList
      quizId="quiz-1"
      slots={slots}
      paper="original"
      onRemove={vi.fn()}
      categories={CATEGORIES}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SlotList rows', () => {
  it('fetches NOTHING until a row is opened — a fifteen-question exam must render in one request', () => {
    renderList([questionSlot(), questionSlot({ id: 'slot-2', bankEntryId: 'entry-2', position: 1 })]);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('fetches the question once on open, and not again on reopen', async () => {
    apiGet.mockResolvedValue({
      bankEntryId: 'entry-1',
      versionId: 'ver-1',
      version: 1,
      status: 'draft',
      usedInQuizzes: 1,
      input: {
        type: 'mcq_single',
        categoryId: 'cat-1',
        stemHtml: '<p>س</p>',
        defaultMark: 2,
        settings: { shuffleOptions: true, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 1 },
          { bodyHtml: '<p>ب</p>', fraction: 0 },
        ],
      },
    });

    renderList([questionSlot()]);

    const toggle = screen.getByRole('button', { name: /مجالات علوم الحاسب/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith('/api/admin/questions/entry-1', expect.anything());
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The mark the panel edits is the SLOT's, and it says so — the bank's
    // `defaultMark` is deliberately not on screen here.
    expect(await screen.findByLabelText(copy.quizAdmin.slotMark)).toHaveValue(2);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText(copy.quizAdmin.slotMark)).not.toBeVisible();

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByLabelText(copy.quizAdmin.slotMark)).toBeVisible());
    // Two opens, one request: collapsing hides the panel, it does not throw
    // away the question it fetched — nor a half-typed edit.
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it('a pool slot has no toggle and issues no request — it points at no one question', async () => {
    renderList([
      questionSlot({
        id: 'pool-slot',
        kind: 'pool',
        bankEntryId: null,
        type: null,
        stemHtml: null,
        poolName: 'مجموعة الفصل الأول',
        poolPickCount: 3,
      }),
    ]);

    expect(screen.getByText(/مجموعة الفصل الأول/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /مجموعة الفصل الأول/ })).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('offers a retry rather than an empty panel when the question cannot be fetched', async () => {
    apiGet.mockRejectedValue(new Error('boom'));
    renderList([questionSlot()]);

    fireEvent.click(screen.getByRole('button', { name: /مجالات علوم الحاسب/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(copy.quizAdmin.slotLoadFailed);
    expect(screen.getByRole('button', { name: copy.quizAdmin.slotRetry })).toBeInTheDocument();
  });
});
