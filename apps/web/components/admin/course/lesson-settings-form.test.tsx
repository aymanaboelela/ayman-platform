import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import { LessonSettingsForm } from './lesson-settings-form';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * React 19 form actions fire on the FORM's submit event. Dispatching submit at
 * the button does nothing — the button is not the form — which is what made
 * the first version of these tests fail against a working component.
 */
function submitForm() {
  const button = screen.getByRole('button', { name: copy.admin.common.save });
  fireEvent.submit(button.closest('form')!);
}

const lesson = {
  id: '00000000-0000-7000-8000-000000000001',
  isFreePreview: false,
  estimatedSeconds: 0,
  completionMode: 'manual' as const,
  completionMinViewSeconds: null,
  completionPassGrade: null,
};

/**
 * The completion rule is a COUPLED pair — `LessonUpdateSchema.refine` rejects
 * `on_pass` without `completionPassGrade` and `on_view` without
 * `completionMinViewSeconds`. A form that sent the mode on its own would
 * produce a 400 the instructor has no way to act on, so these two tests are
 * about the payload's shape rather than about the markup.
 */
describe('LessonSettingsForm', () => {
  it('sends the pass grade in the same payload as an on_pass mode', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(copy.admin.lesson.completionMode), {
      target: { value: 'on_pass' },
    });
    // The dependent field appears only for the modes that need it.
    fireEvent.change(screen.getByLabelText(copy.admin.lesson.passGrade), {
      target: { value: '60' },
    });
    submitForm();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      completionMode: 'on_pass',
      completionPassGrade: 60,
    });
  });

  it('nulls both dependent values for a mode that needs neither', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonSettingsForm lesson={lesson} onSave={onSave} />);

    submitForm();

    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
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
});
