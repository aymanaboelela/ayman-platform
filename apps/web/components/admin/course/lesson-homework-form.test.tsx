import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { AutosaveProvider } from './autosave';
import { LessonHomeworkForm } from './lesson-homework-form';
import { SaveIndicator } from './save-indicator';

/*
 * The Server Actions module is `'use server'` and reaches the API client —
 * nothing a DOM test can load. Only the two calls the form makes are needed.
 */
const setLessonHomeworkAction = vi.fn();
const removeLessonHomeworkAction = vi.fn();
vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  setLessonHomeworkAction: (...args: unknown[]) => setLessonHomeworkAction(...args),
  removeLessonHomeworkAction: (...args: unknown[]) => removeLessonHomeworkAction(...args),
}));

const COURSE = '00000000-0000-7000-8000-00000000000c';
const LESSON = '00000000-0000-7000-8000-000000000001';
const DRAFT_SLOT = `ayman:draft:/:homework-body-${LESSON}`;

// What Next 16 throws for an action id the server does not have — the exact
// text the teacher saw in red above this form.
const STALE = Object.assign(
  new Error(
    'Server Action "70fa68aada035bb6cabeb0deeb8cb3ffe4681e9346" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
  ),
  { name: 'UnrecognizedActionError' },
);

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderForm(body = '') {
  return render(
    <AutosaveProvider>
      <SaveIndicator />
      <LessonHomeworkForm
        courseId={COURSE}
        lessonId={LESSON}
        homework={{ body, maxImages: 3, isPublished: false }}
        pendingCount={0}
      />
    </AutosaveProvider>,
  );
}

function bodyField(): HTMLTextAreaElement {
  return screen.getByLabelText(copy.admin.homework.body) as HTMLTextAreaElement;
}

/** Past the autosave debounce, and let the save's promise settle. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

describe('LessonHomeworkForm — a save that outlived its deploy', () => {
  it('shows the Arabic message and a reload, never Next’s English sentence', async () => {
    setLessonHomeworkAction.mockRejectedValue(STALE);
    renderForm();

    fireEvent.change(bodyField(), { target: { value: 'حل تمارين الدرس التالت' } });
    await settle();

    expect(setLessonHomeworkAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.common.staleBuildAction)).toBeInTheDocument();
    expect(screen.queryByText(/was not found on the server/)).toBeNull();
    expect(screen.queryByText(/Server Action/)).toBeNull();

    // «نجرّب تاني» would re-send the same dead id; the button is the reload.
    expect(screen.getByRole('button', { name: copy.common.staleBuildReload })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.admin.autosave.retry })).toBeNull();
  });

  it('keeps the unsaved text in this tab, so the reload does not cost it', async () => {
    setLessonHomeworkAction.mockRejectedValue(STALE);
    renderForm();

    fireEvent.change(bodyField(), { target: { value: 'حل تمارين الدرس التالت' } });
    await settle();

    expect(window.sessionStorage.getItem(DRAFT_SLOT)).toBe('حل تمارين الدرس التالت');
  });
});

describe('LessonHomeworkForm — the kept draft', () => {
  it('comes back after a reload and is saved with the new build', async () => {
    window.sessionStorage.setItem(DRAFT_SLOT, 'النص اللي اتكتب قبل التحديث');
    setLessonHomeworkAction.mockResolvedValue({ ok: true });

    renderForm('النسخة القديمة من السيرفر');
    expect(bodyField().value).toBe('النص اللي اتكتب قبل التحديث');

    await settle();
    expect(setLessonHomeworkAction).toHaveBeenCalledWith(
      COURSE,
      LESSON,
      expect.objectContaining({ body: 'النص اللي اتكتب قبل التحديث' }),
    );
    // Landed, so there is nothing left to keep.
    expect(window.sessionStorage.getItem(DRAFT_SLOT)).toBeNull();
  });

  it('is cleared by a save that landed, and left alone when there is none', async () => {
    setLessonHomeworkAction.mockResolvedValue({ ok: true });
    renderForm('واجب محفوظ');
    expect(bodyField().value).toBe('واجب محفوظ');
    expect(setLessonHomeworkAction).not.toHaveBeenCalled();

    fireEvent.change(bodyField(), { target: { value: 'واجب محفوظ ومعدّل' } });
    expect(window.sessionStorage.getItem(DRAFT_SLOT)).toBe('واجب محفوظ ومعدّل');
    await settle();
    expect(window.sessionStorage.getItem(DRAFT_SLOT)).toBeNull();
  });

  it('survives a save that the API refused', async () => {
    setLessonHomeworkAction.mockResolvedValue({ ok: false, message: 'مااتحفظش' });
    renderForm();

    fireEvent.change(bodyField(), { target: { value: 'نص مرفوض' } });
    await settle();
    expect(window.sessionStorage.getItem(DRAFT_SLOT)).toBe('نص مرفوض');
  });
});
