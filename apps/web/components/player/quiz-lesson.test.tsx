import { cleanup, render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import type { LessonProgressDto } from '@ayman/contracts/progress';
import { afterEach, describe, expect, it } from 'vitest';
import { QuizLesson } from './quiz-lesson';

afterEach(() => {
  cleanup();
});

const c = copy.player;
const LESSON = '0198c3a2-0000-7000-8000-000000000001';

function progress(over: Partial<LessonProgressDto> = {}): LessonProgressDto {
  return {
    lessonId: LESSON,
    state: 'not_started',
    completion: 0,
    watchedSeconds: 0,
    maxPositionSeconds: 0,
    openCount: 0,
    completedAt: null,
    completedVia: null,
    ...over,
  } as LessonProgressDto;
}

/**
 * The lesson a student reaches from the course outline, for a quiz.
 *
 * Two things are being pinned. The first is that it SHOWS THE MARK at all: the
 * student's score was on the dashboard, on `/results` and on the quiz's own
 * page, and not on the lesson the score belongs to — the one screen the outline
 * links to. The second is that it never states a verdict the grader has not
 * reached.
 */
describe('QuizLesson', () => {
  it('shows the intro, not a score, before the exam has been sat', () => {
    render(<QuizLesson lessonId={LESSON} progress={progress()} />);

    expect(screen.getByText(c.quizIntro)).toBeInTheDocument();
    expect(screen.queryByText(c.quizYourScore)).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent(c.quizCta);
  });

  it('shows the mark once the attempt has been graded', () => {
    // `completion` is the stored 0..1 fraction and is the MAX across attempts,
    // so this is the best score — the same number every other screen prints.
    render(
      <QuizLesson lessonId={LESSON} progress={progress({ state: 'failed', completion: 0.27 })} />,
    );

    expect(screen.getByText(c.quizYourScore)).toBeInTheDocument();
    expect(screen.getByText('27%')).toBeInTheDocument();
    // The CTA changes with the state: a student who has sat it is not being
    // invited to start it for the first time.
    expect(screen.getByRole('link')).toHaveTextContent(c.quizOpenCta);
  });

  it('never labels a failing student in red', () => {
    // «محتاج تحاول تاني» in `--err` was removed from here and from the
    // dashboard for the same reason: the percentage above already says it, the
    // sentence below says what to DO about it, and the badge only added a
    // verdict. See the colour note in `study.css`.
    const { container } = render(
      <QuizLesson lessonId={LESSON} progress={progress({ state: 'failed', completion: 0.27 })} />,
    );

    expect(container.querySelector('.verdict--fail')).toBeNull();
    expect(screen.queryByText(copy.quiz.failed)).not.toBeInTheDocument();
    // The actionable sentence is what replaces it.
    expect(screen.getByText(c.quizFailedNote)).toBeInTheDocument();
  });

  it('does celebrate a pass, and says the lesson closed itself', () => {
    const { container } = render(
      <QuizLesson
        lessonId={LESSON}
        progress={progress({ state: 'passed', completion: 0.9, completedVia: 'auto' })}
      />,
    );

    expect(container.querySelector('.verdict--pass')).not.toBeNull();
    expect(screen.getByText(copy.quiz.passed)).toBeInTheDocument();
    expect(screen.getByText(c.quizPassedNote)).toBeInTheDocument();
  });

  it('treats an opened-but-unsubmitted attempt as not yet sat', () => {
    // `in_progress` is written by `open()`, not by the grader. Printing a 0%
    // for a student who has opened the exam and not finished it would be a mark
    // nobody has awarded.
    render(
      <QuizLesson lessonId={LESSON} progress={progress({ state: 'in_progress', completion: 0 })} />,
    );

    expect(screen.queryByText(c.quizYourScore)).not.toBeInTheDocument();
    expect(screen.getByText(c.quizIntro)).toBeInTheDocument();
  });

  it('rounds the stored fraction for display only', () => {
    render(
      <QuizLesson lessonId={LESSON} progress={progress({ state: 'failed', completion: 0.666 })} />,
    );
    expect(screen.getByText('67%')).toBeInTheDocument();
  });
});
