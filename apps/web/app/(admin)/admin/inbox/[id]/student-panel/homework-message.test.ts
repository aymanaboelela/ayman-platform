import { describe, expect, it } from 'vitest';
import { defaultHomeworkMessage } from './homework-message';

describe('defaultHomeworkMessage', () => {
  it('speaks the mark on an accepted submission', () => {
    expect(defaultHomeworkMessage({ lesson: 'المتغيرات', decision: 'accepted', grade: 85 })).toBe(
      'درجة واجب «المتغيرات»: 85 من 100.',
    );
  });

  it('says accepted without a number when there is no mark', () => {
    expect(defaultHomeworkMessage({ lesson: 'المتغيرات', decision: 'accepted', grade: null })).toBe(
      'واجب «المتغيرات» اتقبل.',
    );
  });

  it('never speaks a mark on work that is coming back', () => {
    const line = defaultHomeworkMessage({ lesson: 'المتغيرات', decision: 'needs_work', grade: 90 });
    expect(line).not.toContain('90');
    expect(line).toContain('يتبعت تاني');
  });
});
