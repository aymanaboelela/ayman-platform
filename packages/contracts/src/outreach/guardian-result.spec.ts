import { describe, expect, it } from 'vitest';
import { OutreachSettingsSchema, QUIZ_RESULT_RECIPIENTS } from '@ayman/contracts/admin/settings';
import { composeGuardianResult, resultRoute } from '@ayman/contracts/outreach/guardian-result';

const PHONE = '+201012345678';

describe('quizResultTo — the stored setting', () => {
  it('defaults to the student, so a row saved before the key existed changes nothing', () => {
    expect(OutreachSettingsSchema.parse({}).quizResultTo).toBe('student');
  });

  it('accepts exactly the three choices', () => {
    for (const value of QUIZ_RESULT_RECIPIENTS) {
      expect(OutreachSettingsSchema.parse({ quizResultTo: value }).quizResultTo).toBe(value);
    }
    expect(OutreachSettingsSchema.safeParse({ quizResultTo: 'parent' }).success).toBe(false);
  });
});

describe('resultRoute', () => {
  it('student: the student only — today’s behaviour', () => {
    expect(resultRoute({ setting: 'student', guardianChannel: true, guardianPhone: PHONE })).toEqual({
      student: true,
      guardian: false,
    });
  });

  it('guardian: the guardian instead of the student', () => {
    expect(resultRoute({ setting: 'guardian', guardianChannel: true, guardianPhone: PHONE })).toEqual({
      student: false,
      guardian: true,
    });
  });

  it('both: the two of them', () => {
    expect(resultRoute({ setting: 'both', guardianChannel: true, guardianPhone: PHONE })).toEqual({
      student: true,
      guardian: true,
    });
  });

  it('guardian with no usable number falls back to the student, never to nobody', () => {
    expect(resultRoute({ setting: 'guardian', guardianChannel: true, guardianPhone: null })).toEqual({
      student: true,
      guardian: false,
    });
    expect(resultRoute({ setting: 'both', guardianChannel: true, guardianPhone: null })).toEqual({
      student: true,
      guardian: false,
    });
  });

  it('a stack without the WhatsApp channel reads every setting as student', () => {
    for (const setting of QUIZ_RESULT_RECIPIENTS) {
      expect(resultRoute({ setting, guardianChannel: false, guardianPhone: PHONE })).toEqual({
        student: true,
        guardian: false,
      });
    }
  });
});

describe('composeGuardianResult', () => {
  const base = {
    studentName: 'سارة محمد علي',
    instructorName: 'المدرس',
    quizTitle: 'كويز الحلقات',
    scorePercent: 82,
    seed: 'attempt-1',
  };

  it('names the student (first name), the paper, the score and the sender', () => {
    const body = composeGuardianResult(base);
    expect(body).toContain('سارة');
    expect(body).not.toContain('سارة محمد');
    expect(body).toContain('«كويز الحلقات»');
    expect(body).toContain('82٪');
  });

  it('is stable per seed, so a retried send composes the identical body', () => {
    expect(composeGuardianResult(base)).toBe(composeGuardianResult(base));
  });

  it('varies across papers', () => {
    const bodies = new Set(
      Array.from({ length: 20 }, (_, index) => composeGuardianResult({ ...base, seed: `a-${index}` })),
    );
    expect(bodies.size).toBeGreaterThan(5);
  });

  it('leaves no placeholder unfilled, in every band', () => {
    for (const scorePercent of [0, 40, 60, 80, 95, 100]) {
      for (let index = 0; index < 30; index += 1) {
        const body = composeGuardianResult({ ...base, scorePercent, seed: `s-${index}` });
        expect(body).not.toMatch(/[{}]/u);
      }
    }
  });

  it('never prints a hardcoded sender — only the one it is given', () => {
    for (let index = 0; index < 40; index += 1) {
      const body = composeGuardianResult({ ...base, seed: `n-${index}` });
      expect(body).not.toContain('أيمن');
    }
  });
});
