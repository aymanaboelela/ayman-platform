import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import type { HeartbeatResponse } from '@ayman/contracts/progress';
import { LessonNav } from './lesson-nav';

const deleteComplete = vi.fn();
const postComplete = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

vi.mock('@/lib/progress-undo-client', () => ({
  deleteComplete: (...args: unknown[]) => deleteComplete(...args),
}));
vi.mock('@/lib/progress-client', () => ({
  postComplete: (...args: unknown[]) => postComplete(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

afterEach(() => {
  cleanup();
  deleteComplete.mockReset();
  postComplete.mockReset();
  refresh.mockReset();
  push.mockReset();
});

const p = copy.player;
const LESSON_ID = '0198c3a2-0000-7000-8000-000000000001';

const UNDONE: HeartbeatResponse = {
  progress: {
    lessonId: LESSON_ID,
    state: 'in_progress',
    completion: 0.05,
    watchedSeconds: 30,
    maxPositionSeconds: 45,
    openCount: 1,
    completedAt: null,
    completedVia: null,
  },
  justCompleted: false,
  courseProgressPercent: 50,
};

function renderNav({ undoable, onProgress = vi.fn() }: { undoable: boolean; onProgress?: (r: HeartbeatResponse) => void }) {
  render(
    <LessonNav
      lessonId={LESSON_ID}
      courseSlug="programming-year-2"
      previous={null}
      next={{ id: 'next-lesson', title: 'الدرس اللي بعده', kind: 'video' }}
      isComplete
      undoable={undoable}
      onProgress={onProgress}
    />,
  );
  return onProgress;
}

/**
 * «في ناس بتضغط بالغلط — عاوز لما أضغط على "تم" تاني يطلعلي بوب أب إن ممكن
 * أتراجع». Nothing is undone by the first press; only the yes in the dialog
 * does it — and only a completion the button made gets a dialog at all.
 */
describe('LessonNav — taking back «تم»', () => {
  it('opens the question on «تم», and undoes nothing on that press', () => {
    renderNav({ undoable: true });

    fireEvent.click(screen.getByRole('button', { name: p.completed }));

    expect(screen.getByRole('dialog', { name: p.undoTitle })).toBeTruthy();
    expect(screen.getByText(p.undoBody)).toBeTruthy();
    expect(deleteComplete).not.toHaveBeenCalled();
  });

  it('the yes undoes the completion, hands the answer up, and refreshes the route', async () => {
    deleteComplete.mockResolvedValue(UNDONE);
    const onProgress = renderNav({ undoable: true });
    fireEvent.click(screen.getByRole('button', { name: p.completed }));

    fireEvent.click(screen.getByRole('button', { name: p.undoConfirm }));

    await waitFor(() => expect(deleteComplete).toHaveBeenCalledWith(LESSON_ID));
    await waitFor(() => expect(onProgress).toHaveBeenCalledWith(UNDONE));
    expect(refresh).toHaveBeenCalled();
    // Stays on the lesson — the undo is not «التالي».
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('«لأ، يفضل زي ما هو» closes the question and undoes nothing', () => {
    const onProgress = renderNav({ undoable: true });
    fireEvent.click(screen.getByRole('button', { name: p.completed }));

    fireEvent.click(screen.getByRole('button', { name: p.undoCancel }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteComplete).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says so when the undo fails', async () => {
    deleteComplete.mockRejectedValue(new Error('offline'));
    const onProgress = renderNav({ undoable: true });
    fireEvent.click(screen.getByRole('button', { name: p.completed }));

    fireEvent.click(screen.getByRole('button', { name: p.undoConfirm }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', p.undoFailed);
    expect(screen.getByRole('dialog', { name: p.undoTitle })).toBeTruthy();
    expect(onProgress).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('leaves an EARNED «تم» a dead badge — no dialog, no request', () => {
    renderNav({ undoable: false });

    const badge = screen.getByRole('button', { name: p.completed });
    expect(badge).toHaveProperty('disabled', true);
    fireEvent.click(badge);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(p.undoHint)).toBeNull();
    expect(deleteComplete).not.toHaveBeenCalled();
    expect(postComplete).not.toHaveBeenCalled();
  });
});
