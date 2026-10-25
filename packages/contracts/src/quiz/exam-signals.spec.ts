import { describe, expect, it } from 'vitest';
import { ExamSignalsBodySchema, summariseExamSignals, type AdminExamSignal } from './exam-signals';

const at = '2026-10-25T17:00:00.000Z';
const row = (overrides: Partial<AdminExamSignal>): AdminExamSignal => ({
  type: 'paste',
  at,
  questionNumber: 1,
  chars: null,
  text: null,
  awayMs: null,
  ...overrides,
});

describe('summariseExamSignals', () => {
  it('counts each way of leaving once, and adds only the measured returns', () => {
    const summary = summariseExamSignals([
      row({ type: 'opened', questionNumber: null }),
      row({ type: 'paste', chars: 320 }),
      row({ type: 'copy', chars: 80 }),
      row({ type: 'hidden' }),
      row({ type: 'visible', awayMs: 45_000 }),
      row({ type: 'blur' }),
      row({ type: 'focus', awayMs: 5_000 }),
      // Never came back: a leave with no duration to add.
      row({ type: 'pagehide' }),
    ]);
    expect(summary).toMatchObject({ pastes: 1, copies: 1, leaves: 3, awayMs: 50_000, opens: 1 });
    expect(summary.events).toHaveLength(8);
  });
});

describe('ExamSignalsBodySchema', () => {
  it('refuses an unknown field rather than storing it', () => {
    expect(
      ExamSignalsBodySchema.safeParse({ signals: [{ type: 'paste', at, mark: 10 }] }).success,
    ).toBe(false);
  });

  it('caps the pasted text it will carry', () => {
    expect(
      ExamSignalsBodySchema.safeParse({ signals: [{ type: 'paste', at, text: 'x'.repeat(501) }] }).success,
    ).toBe(false);
  });
});
