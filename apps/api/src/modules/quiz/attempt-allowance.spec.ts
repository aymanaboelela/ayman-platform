import { countingAttemptId, decideNextSitting, type AllowanceAttempt } from './attempt-allowance';

function attempt(overrides: Partial<AllowanceAttempt> & { attemptNo: number }): AllowanceAttempt {
  return {
    paper: 'original',
    state: 'submitted',
    extraAttempts: 0,
    scaledScore: null,
    ...overrides,
  };
}

describe('decideNextSitting — an ordinary quiz', () => {
  it('lets a student who has sat nothing start the original paper', () => {
    expect(decideNextSitting(false, [])).toEqual({ allowed: true, paper: 'original' });
  });

  it('blocks the second sitting', () => {
    const result = decideNextSitting(false, [attempt({ attemptNo: 1 })]);
    expect(result).toEqual({ allowed: false, reason: 'no_attempts_left' });
  });

  /*
   * The loophole this closes: `abandoned` is what autoabandon writes when the
   * clock runs out, so counting it as "didn't happen" would let a student walk
   * away from a paper they disliked and be handed a fresh one.
   */
  it('counts an abandoned sitting against the allowance', () => {
    const result = decideNextSitting(false, [attempt({ attemptNo: 1, state: 'abandoned' })]);
    expect(result).toEqual({ allowed: false, reason: 'no_attempts_left' });
  });

  it('counts an in-progress sitting against the allowance', () => {
    const result = decideNextSitting(false, [attempt({ attemptNo: 1, state: 'in_progress' })]);
    expect(result).toEqual({ allowed: false, reason: 'no_attempts_left' });
  });
});

describe('decideNextSitting — an exam offering improvement', () => {
  it('starts on the original paper', () => {
    expect(decideNextSitting(true, [])).toEqual({ allowed: true, paper: 'original' });
  });

  it('offers the improvement paper once the original is finished', () => {
    const result = decideNextSitting(true, [attempt({ attemptNo: 1, paper: 'original' })]);
    expect(result).toEqual({ allowed: true, paper: 'improvement' });
  });

  it('offers it after a pending_review original too — an essay still counts as sat', () => {
    const result = decideNextSitting(true, [
      attempt({ attemptNo: 1, paper: 'original', state: 'pending_review' }),
    ]);
    expect(result).toEqual({ allowed: true, paper: 'improvement' });
  });

  it('blocks a third sitting', () => {
    const result = decideNextSitting(true, [
      attempt({ attemptNo: 1, paper: 'original' }),
      attempt({ attemptNo: 2, paper: 'improvement' }),
    ]);
    expect(result).toEqual({ allowed: false, reason: 'no_attempts_left' });
  });

  /*
   * The case that makes the paper choice depend on FINISHING rather than on
   * counting rows: a first sitting that died is not a sat original, so the
   * granted replacement must redraw the original — not silently promote the
   * student onto a paper they were never meant to see first. It is also what
   * keeps this agreeing with the `quiz_attempts_improvement_is_not_first`
   * database CHECK.
   */
  it('redraws the ORIGINAL when an admin replaces a sitting that never finished', () => {
    const result = decideNextSitting(true, [
      attempt({ attemptNo: 1, paper: 'original', state: 'abandoned', extraAttempts: 1 }),
    ]);
    expect(result).toEqual({ allowed: true, paper: 'original' });
  });

  it('never hands out the improvement paper on a quiz that does not offer one', () => {
    const result = decideNextSitting(false, [
      attempt({ attemptNo: 1, paper: 'original', extraAttempts: 1 }),
    ]);
    expect(result).toEqual({ allowed: true, paper: 'original' });
  });
});

describe('decideNextSitting — admin grants', () => {
  it('widens the allowance additively', () => {
    const attempts = [attempt({ attemptNo: 1, extraAttempts: 2 })];
    expect(decideNextSitting(false, attempts)).toEqual({ allowed: true, paper: 'original' });
  });

  it('still runs out once the grants are used', () => {
    const attempts = [
      attempt({ attemptNo: 1, extraAttempts: 1 }),
      attempt({ attemptNo: 2 }),
    ];
    expect(decideNextSitting(false, attempts)).toEqual({
      allowed: false,
      reason: 'no_attempts_left',
    });
  });
});

describe('countingAttemptId', () => {
  it('is null when nothing has been scored yet', () => {
    expect(countingAttemptId([{ ...attempt({ attemptNo: 1 }), id: 'a' }])).toBeNull();
  });

  it('is the higher of two sittings', () => {
    const rows = [
      { ...attempt({ attemptNo: 1, scaledScore: 60 }), id: 'first' },
      { ...attempt({ attemptNo: 2, paper: 'improvement', scaledScore: 85 }), id: 'second' },
    ];
    expect(countingAttemptId(rows)).toBe('second');
  });

  it('keeps the original when the improvement scored LOWER', () => {
    const rows = [
      { ...attempt({ attemptNo: 1, scaledScore: 90 }), id: 'first' },
      { ...attempt({ attemptNo: 2, paper: 'improvement', scaledScore: 40 }), id: 'second' },
    ];
    expect(countingAttemptId(rows)).toBe('first');
  });

  it('breaks a tie toward the earlier sitting', () => {
    const rows = [
      { ...attempt({ attemptNo: 1, scaledScore: 70 }), id: 'first' },
      { ...attempt({ attemptNo: 2, paper: 'improvement', scaledScore: 70 }), id: 'second' },
    ];
    expect(countingAttemptId(rows)).toBe('first');
  });

  /* The overview query orders by attemptNo DESC, which would invert the
   * tie-break if the sort inside were removed. */
  it('breaks the tie the same way regardless of the order it is handed', () => {
    const rows = [
      { ...attempt({ attemptNo: 2, paper: 'improvement', scaledScore: 70 }), id: 'second' },
      { ...attempt({ attemptNo: 1, scaledScore: 70 }), id: 'first' },
    ];
    expect(countingAttemptId(rows)).toBe('first');
  });

  it('ignores a sitting still awaiting marking', () => {
    const rows = [
      { ...attempt({ attemptNo: 1, scaledScore: 55 }), id: 'first' },
      {
        ...attempt({ attemptNo: 2, paper: 'improvement', state: 'pending_review' }),
        id: 'second',
      },
    ];
    expect(countingAttemptId(rows)).toBe('first');
  });
});
