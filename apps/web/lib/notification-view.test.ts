import { describe, expect, it } from 'vitest';
import { copy, type StudentNotification } from '@ayman/contracts';
import { ASSISTANT_OPEN_PARAM } from './assistant-mount';
import { describeNotification, formatNotificationTime } from './notification-view';

const BASE = {
  id: 'n1',
  createdAt: '2026-03-01T10:00:00.000Z',
  readAt: null,
  lessonId: 'lesson-1',
  lessonTitle: 'المتغيرات',
};

describe('describeNotification', () => {
  it('states the score for a graded quiz and links to its review', () => {
    const entry: StudentNotification = {
      ...BASE,
      kind: 'quiz_graded',
      attemptId: 'attempt-1',
      scorePercent: 85,
      passed: true,
    };

    const view = describeNotification(entry);

    expect(view.title).toContain('85');
    expect(view.detail).toBe(copy.notifications.quizGradedPassed);
    expect(view.href).toBe('/quizzes/lesson-1/attempt/attempt-1/review');
  });

  it('renders no verdict when passed is unknown, rather than guessing from the score', () => {
    // The pass mark is per-quiz and this row does not carry it, so an 85%
    // with no verdict must not be labelled "نجحت".
    const view = describeNotification({
      ...BASE,
      kind: 'quiz_graded',
      attemptId: 'attempt-1',
      scorePercent: 85,
      passed: null,
    });

    expect(view.detail).toBeNull();
  });

  it('distinguishes an accepted appeal from a rejected one', () => {
    const accepted = describeNotification({
      ...BASE,
      kind: 'appeal_resolved',
      attemptId: 'attempt-1',
      accepted: true,
    });
    const rejected = describeNotification({
      ...BASE,
      kind: 'appeal_resolved',
      attemptId: 'attempt-1',
      accepted: false,
    });

    expect(accepted.title).toBe(copy.notifications.appealAccepted);
    expect(rejected.title).toBe(copy.notifications.appealRejected);
    // Both go to the review screen — the only place the outcome is visible.
    expect(accepted.href).toBe(rejected.href);
  });

  it('points an extra-attempt grant at the quiz intro, never at a new attempt', () => {
    // Starting a graded exam is never something a link does on a mis-tap.
    const view = describeNotification({ ...BASE, kind: 'extra_attempt_granted' });

    expect(view.href).toBe('/quizzes/lesson-1');
    expect(view.href).not.toContain('attempt');
  });
});
describe('describeNotification — conversation_reply', () => {
  const entry = {
    id: 'n1',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    kind: 'conversation_reply',
    conversationId: 'c1',
  } as const;

  it('names المساعد as the subject, since there is no lesson', () => {
    /*
     * The FIRST kind that is not about a lesson. Both renderers used to read
     * `entry.lessonTitle` straight off the row; `subtitle` exists so the one
     * place that already turns a row into prose answers that question for
     * them, instead of two components each assuming a shape.
     */
    const view = describeNotification(entry);
    expect(view.subtitle).toBe(copy.assistant.title);
    expect(view.title).toBe(copy.notifications.conversationReply);
    expect(view.detail).toBeNull();
  });

  it('links somewhere that actually opens the conversation', () => {
    // The thread lives in the widget and has no page of its own, so the link
    // has to carry the flag that opens it — a bare `/dashboard` would land the
    // student on a screen with no visible answer to the notification they just
    // tapped.
    const view = describeNotification(entry);
    expect(view.href).toContain('/dashboard');
    expect(view.href).toContain(`${ASSISTANT_OPEN_PARAM}=`);
  });
});

describe('formatNotificationTime', () => {
  it('renders an absolute date and time, not a relative one', () => {
    const rendered = formatNotificationTime('2026-03-01T10:00:00.000Z');

    // Relative time ("من ٣ ساعات") was the first attempt and was wrong twice:
    // it needs the clock during render, which the React Compiler rejects as
    // impure, and it goes stale the second it is painted. Absolute matches
    // every other timestamp in the product.
    expect(rendered).toMatch(/\d/);
    expect(rendered).not.toContain('من');
  });

  it('is deterministic, so the server and the client agree', () => {
    const iso = '2026-03-01T09:00:00.000Z';
    expect(formatNotificationTime(iso)).toBe(formatNotificationTime(iso));
  });

  it('uses Western digits, like every other number in the product', () => {
    // Arabic-Indic numerals here and Western everywhere else would be the
    // inconsistency `devices-list.tsx` already records a decision about.
    expect(formatNotificationTime('2026-03-01T10:00:00.000Z')).not.toMatch(/[٠-٩]/);
  });
});
