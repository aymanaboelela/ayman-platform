import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import type { MyHomeworkSubmission, StudentHomework } from '@ayman/contracts/homework';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const submitText = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/app/(app)/courses/[slug]/lessons/[lessonId]/homework-actions', () => ({
  submitHomeworkAction: vi.fn(async () => ({ ok: true })),
  submitHomeworkTextAction: (...args: unknown[]) => submitText(...(args as [])),
}));

let model: string | null = null;
vi.mock('@/lib/device-model', () => ({ detectDeviceModel: async () => model }));

import { LessonHomework } from './lesson-homework';

const c = copy.homework;
const LESSON = '01a1ea21-0000-7000-8000-000000000001';

function homework(overrides: Partial<StudentHomework> = {}): StudentHomework {
  return { body: '١- عرّف البروتوكول', maxImages: 4, typedAnswer: true, submission: null, ...overrides };
}

afterEach(cleanup);
beforeEach(() => {
  model = null;
  submitText.mockClear();
  refresh.mockClear();
});

/**
 * «اكتب الحل» — offered on the ministry tablet only. Everywhere else the card
 * is the photo upload it always was.
 */
describe('LessonHomework on the ministry tablet', () => {
  it('offers typing on a Galaxy Tab, and sends the text with the model', async () => {
    model = 'SM-X205';
    render(<LessonHomework lessonId={LESSON} homework={homework()} />);

    const box = await screen.findByLabelText(c.typeTitle);
    expect(screen.getByRole('tab', { name: c.modePhoto })).toBeTruthy();

    fireEvent.change(box, { target: { value: '١- طريقة تواصل بين جهازين' } });
    fireEvent.click(screen.getByRole('button', { name: c.submit }));

    await waitFor(() => expect(submitText).toHaveBeenCalledWith(LESSON, '١- طريقة تواصل بين جهازين', 'SM-X205'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('switches back to the photo upload from the tab', async () => {
    model = 'SM-T295';
    render(<LessonHomework lessonId={LESSON} homework={homework()} />);

    fireEvent.click(await screen.findByRole('tab', { name: c.modePhoto }));
    expect(screen.getByRole('button', { name: c.pick })).toBeTruthy();
    expect(screen.queryByLabelText(c.typeTitle)).toBeNull();
  });

  it('stays the photo upload on a phone', async () => {
    model = 'SM-S918B';
    render(<LessonHomework lessonId={LESSON} homework={homework()} />);

    await waitFor(() => expect(screen.getByRole('button', { name: c.pick })).toBeTruthy());
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('stays the photo upload on a tablet when the stack has the option off', async () => {
    model = 'SM-X205';
    render(<LessonHomework lessonId={LESSON} homework={homework({ typedAnswer: false })} />);

    await waitFor(() => expect(screen.getByRole('button', { name: c.pick })).toBeTruthy());
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('shows a typed answer back once it is handed in', () => {
    const submission: MyHomeworkSubmission = {
      id: '01a1ea21-0000-7000-8000-000000000002',
      status: 'submitted',
      attempt: 1,
      imageCount: 0,
      imageIds: [],
      imagesPurged: false,
      answerText: '١- طريقة تواصل',
      grade: null,
      reviewNote: null,
      submittedAt: '2026-11-18T10:00:00.000Z',
      reviewedAt: null,
    };
    render(<LessonHomework lessonId={LESSON} homework={homework({ submission })} />);

    expect(screen.getByText(c.submittedTyped)).toBeTruthy();
    expect(screen.getByText('١- طريقة تواصل')).toBeTruthy();
  });
});
