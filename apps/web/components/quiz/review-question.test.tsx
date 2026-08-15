import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { ReviewQuestion, type ReviewQuestionData } from './review-question';

afterEach(() => {
  cleanup();
});

const BASE: ReviewQuestionData = {
  slotPosition: 0,
  attemptQuestionId: 'aq-1',
  type: 'mcq_single',
  stemHtml: '<p>عاصمة مصر إيه؟</p>',
  options: [
    { id: 'opt-a', bodyHtml: '<p>القاهرة</p>' },
    { id: 'opt-b', bodyHtml: '<p>الإسكندرية</p>' },
  ],
  response: { kind: 'choice', optionIds: ['opt-b'] },
  correctness: 'incorrect',
  mark: 0,
  maxMark: 1,
  rightAnswerText: 'القاهرة',
  rightAnswerOptionIds: ['opt-a'],
};

describe('ReviewQuestion — I8 (non-colour correctness indicator)', () => {
  it('labels the correct option with a visible text marker, not colour alone', () => {
    render(<ReviewQuestion question={BASE} />);
    // The correct option ("القاهرة") carries the visible "rightAnswer" label...
    const correctOption = screen.getByText('القاهرة').closest('li')!;
    expect(within(correctOption).getByText(copy.quiz.rightAnswer)).toBeInTheDocument();
  });

  it('labels the chosen-but-wrong option with a distinct visible text marker', () => {
    render(<ReviewQuestion question={BASE} />);
    const wrongChosen = screen.getByText('الإسكندرية').closest('li')!;
    expect(within(wrongChosen).getByText(copy.quiz.yourAnswer)).toBeInTheDocument();
  });

  it('the non-colour marker survives when colour itself is stripped away (colour-blind simulation)', () => {
    // Simulating "colour vision unavailable": strip every class name from
    // every element and confirm the correct option is STILL identifiable
    // from its text content alone.
    const { container } = render(<ReviewQuestion question={BASE} />);
    for (const el of container.querySelectorAll('[class]')) {
      el.removeAttribute('class');
    }
    const items = container.querySelectorAll('li');
    const correctItem = Array.from(items).find((li) => li.textContent?.includes('القاهرة'));
    expect(correctItem?.textContent).toContain(copy.quiz.rightAnswer);
  });
});

describe('ReviewQuestion — I9 (structured option ids, not re-split text)', () => {
  it('highlights the correct option by id even when a distractor’s text contains the Arabic list separator fragment', () => {
    // The audit's exact reproduction: option A ("القاهرة، الإسكندرية") is
    // correct and itself contains the separator; option B ("القاهرة") is a
    // wrong distractor whose full text equals the FIRST half of A's body
    // once split on that separator. A text-based re-split match would
    // highlight B; the id-based fix must highlight A.
    const question: ReviewQuestionData = {
      ...BASE,
      response: { kind: 'choice', optionIds: ['opt-b'] },
      options: [
        { id: 'opt-a', bodyHtml: '<p>القاهرة، الإسكندرية</p>' },
        { id: 'opt-b', bodyHtml: '<p>القاهرة</p>' },
      ],
      rightAnswerText: 'القاهرة، الإسكندرية',
      rightAnswerOptionIds: ['opt-a'],
    };
    render(<ReviewQuestion question={question} />);

    const correctOption = screen.getByText('القاهرة، الإسكندرية').closest('li')!;
    const distractorOption = screen.getByText('القاهرة', { selector: 'p' }).closest('li')!;

    expect(within(correctOption).getByText(copy.quiz.rightAnswer)).toBeInTheDocument();
    expect(within(distractorOption).queryByText(copy.quiz.rightAnswer)).not.toBeInTheDocument();
  });

  it('renders no highlight at all when rightAnswerOptionIds is absent (flag off)', () => {
    const question: ReviewQuestionData = { ...BASE, rightAnswerOptionIds: undefined };
    render(<ReviewQuestion question={question} />);
    expect(screen.queryByText(copy.quiz.rightAnswer)).not.toBeInTheDocument();
  });

  describe('ordering', () => {
    const ORDERING: ReviewQuestionData = {
      slotPosition: 0,
      attemptQuestionId: 'aq-2',
      type: 'ordering',
      stemHtml: '<p>رتّب من الأسرع للأبطأ</p>',
      // Served (shuffled) order — used here only as an id → body lookup.
      options: [
        { id: 'ram', bodyHtml: '<p>RAM</p>' },
        { id: 'cpu', bodyHtml: '<p>CPU</p>' },
        { id: 'storage', bodyHtml: '<p>Storage</p>' },
      ],
      response: { kind: 'choice', optionIds: ['ram', 'cpu', 'storage'] },
      correctness: 'incorrect',
      mark: 0,
      maxMark: 1,
      rightAnswerOptionIds: ['cpu', 'ram', 'storage'],
    };

    it('shows the student order beside the correct one, both as sequences', () => {
      render(<ReviewQuestion question={ORDERING} />);
      expect(screen.getByText(copy.quiz.yourOrder)).toBeInTheDocument();
      expect(screen.getByText(copy.quiz.rightOrder)).toBeInTheDocument();
    });

    it('marks the rows that landed in the right PLACE, not the ones that are merely present', () => {
      // Every id is in both lists by definition, so a membership check would
      // mark a completely wrong order entirely correct. Only `storage` is at
      // the same index in both.
      const { container } = render(<ReviewQuestion question={ORDERING} />);
      const yourList = container.querySelectorAll('ol')[0]!;
      const rows = Array.from(yourList.querySelectorAll('li'));
      expect(rows[0]!.className).toContain('border-err');
      expect(rows[1]!.className).toContain('border-err');
      expect(rows[2]!.className).toContain('border-ok');
    });

    it('renders no per-option choice highlight — an ordering answer is not a pick', () => {
      render(<ReviewQuestion question={ORDERING} />);
      expect(screen.queryByText(copy.quiz.rightAnswer)).not.toBeInTheDocument();
    });
  });
});
