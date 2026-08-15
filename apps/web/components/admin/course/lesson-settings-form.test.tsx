import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { LessonSettingsForm } from './lesson-settings-form';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const lesson = {
  id: '00000000-0000-7000-8000-000000000001',
  isFreePreview: false,
  estimatedSeconds: 0,
  completionMode: 'manual' as const,
  completionMinViewSeconds: null,
  completionPassGrade: null,
  forGeneral: true,
  forLanguages: true,
};

/** Push past the autosave debounce and let the resolved promise settle. */
async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

function modeSelect() {
  return screen.getByLabelText(copy.admin.lesson.completionMode) as HTMLSelectElement;
}

function chooseMode(value: string) {
  fireEvent.change(modeSelect(), { target: { value } });
}

/**
 * The completion rule is a COUPLED pair — `LessonUpdateSchema.refine` rejects
 * `on_pass` without `completionPassGrade` and `on_view` without
 * `completionMinViewSeconds`. A write that sent the mode on its own would be a
 * 400 the instructor has no way to act on.
 */
describe('LessonSettingsForm', () => {
  it('sends the pass grade in the same payload as an on_pass mode', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    chooseMode('on_pass');
    await settle();

    expect(onSave.mock.calls[0]![0]).toMatchObject({
      completionMode: 'on_pass',
      // Picking the mode is itself a write, so the dependent value has to be
      // there already — it cannot wait for the instructor to touch the field.
      completionPassGrade: 60,
    });
  });

  it('nulls both dependent values for a mode that needs neither', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(copy.admin.lesson.estimatedSeconds), {
      target: { value: '900' },
    });
    await settle();

    const sent = onSave.mock.calls[0]![0];
    expect(sent.completionMode).toBe('manual');
    // Null, not undefined and not a stale number left over from another mode:
    // a leftover passGrade under `manual` is a rule the admin cannot see.
    expect(sent.completionPassGrade).toBeNull();
    expect(sent.completionMinViewSeconds).toBeNull();
  });

  it('hides the pass grade when the mode does not use it', () => {
    render(<LessonSettingsForm lesson={lesson} onSave={vi.fn()} />);

    expect(screen.queryByLabelText(copy.admin.lesson.passGrade)).toBeNull();
    expect(screen.queryByLabelText(copy.admin.lesson.minViewSeconds)).toBeNull();
  });

  /**
   * The reported bug, as the instructor saw it: pick a rule, and the dropdown
   * goes back to «من غير قاعدة».
   *
   * It was React 19 resetting the `<form>` when its action resolved. A
   * controlled `<select>` has no `selected` attribute to restore, so the reset
   * fell through to the first option in document order — `none`. React state
   * still held `on_pass`, so the reconciler saw no change and never put the DOM
   * back. There is no form here any more; this test is what stops one returning.
   */
  it('keeps the chosen completion rule visible after the save lands', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    chooseMode('on_pass');
    await settle();

    expect(onSave).toHaveBeenCalled();
    expect(modeSelect().value).toBe('on_pass');
    expect(screen.getByText(copy.admin.lesson.completionOnPass)).toBeTruthy();
  });

  /**
   * The damaging half of the same bug. The reset also restored every
   * UNCONTROLLED input to the original lesson's values, so the next write —
   * which an instructor would fire by pressing حفظ again after seeing the rule
   * snap back — carried `estimatedSeconds: 0` over the 900 just stored.
   */
  it('does not resend stale values for fields it is not editing', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(copy.admin.lesson.estimatedSeconds), {
      target: { value: '900' },
    });
    await settle();
    expect(onSave.mock.calls[0]![0]).toMatchObject({ estimatedSeconds: 900 });

    chooseMode('on_view');
    await settle();

    const second = onSave.mock.calls[1]![0];
    expect(second).toMatchObject({
      completionMode: 'on_view',
      completionMinViewSeconds: 0,
    });
    // The number typed a moment ago must ride along, not revert to the prop.
    expect(second.estimatedSeconds).toBe(900);
  });

  it('writes once for a burst of typing rather than once per keystroke', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    const field = screen.getByLabelText(copy.admin.lesson.estimatedSeconds);
    fireEvent.change(field, { target: { value: '9' } });
    fireEvent.change(field, { target: { value: '90' } });
    fireEvent.change(field, { target: { value: '900' } });
    await settle();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ estimatedSeconds: 900 });
  });

  it('has no save button — the panel saves itself', () => {
    render(<LessonSettingsForm lesson={lesson} onSave={vi.fn()} />);

    expect(screen.queryByRole('button', { name: copy.admin.common.save })).toBeNull();
  });
});
