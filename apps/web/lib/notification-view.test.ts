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

describe('describeNotification — subscription_expiring_soon', () => {
  const entry = {
    id: 'n1',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    kind: 'subscription_expiring_soon',
    courseId: 'course-1',
    courseTitle: 'كورس البرمجة',
    courseSlug: 'programming',
    validUntil: '2026-03-04T00:00:00.000Z',
  } as const;

  it('names the course and states the exact expiry as the detail', () => {
    const view = describeNotification(entry);
    expect(view.title).toContain('كورس البرمجة');
    expect(view.detail).toBe(formatNotificationTime('2026-03-04T00:00:00.000Z'));
    expect(view.subtitle).toBe('كورس البرمجة');
  });

  it('links to the course, where renewing actually happens', () => {
    const view = describeNotification(entry);
    expect(view.href).toBe('/courses/programming');
  });
});

describe('describeNotification — subscription_cancelled', () => {
  const entry = {
    id: 'n2',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    kind: 'subscription_cancelled',
    courseId: 'course-1',
    courseTitle: 'كورس البرمجة',
    courseSlug: 'programming',
    reason: 'دفع بالغلط',
  } as const;

  it('names the course and shows the admin\'s own reason as the detail', () => {
    const view = describeNotification(entry);
    expect(view.title).toContain('كورس البرمجة');
    expect(view.detail).toBe('دفع بالغلط');
    expect(view.subtitle).toBe('كورس البرمجة');
  });

  it('links to the course', () => {
    const view = describeNotification(entry);
    expect(view.href).toBe('/courses/programming');
  });
});

describe('describeNotification — assistant_question_received', () => {
  const entry = {
    id: 'n1',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    kind: 'assistant_question_received',
    conversationId: 'c1',
    preview: 'الدرس ده هيتشرح إمتى؟',
    studentName: 'محمد',
  } as const;

  it('names the student and shows the question preview as the detail', () => {
    const view = describeNotification(entry);
    expect(view.title).toContain('محمد');
    expect(view.detail).toBe('الدرس ده هيتشرح إمتى؟');
    expect(view.subtitle).toBe(copy.notifications.assistantQuestionQueue);
  });

  it('links straight to the thread in the inbox', () => {
    const view = describeNotification(entry);
    expect(view.href).toBe('/admin/inbox/c1');
  });

  it('renders no detail when the preview is empty, rather than an empty line', () => {
    const view = describeNotification({ ...entry, preview: '' });
    expect(view.detail).toBeNull();
  });
});

/**
 * The three STUDENT book-order kinds — the half of «الطالب يعرف إن الكتاب جاي
 * له» that reaches a student who is not looking at the dashboard.
 *
 * The destination is the assertion that matters. Being told «كتابك خرج ليك» and
 * landing on a page selling books is answering a worried student with an
 * advertisement, and `/books` (the shop) is one segment away from `/books/mine`
 * (their own history) — close enough that a typo would never look wrong.
 */
describe('describeNotification — the student book-order kinds', () => {
  const entry = {
    id: 'n1',
    createdAt: '2026-03-01T10:00:00.000Z',
    readAt: null,
    orderId: '0198c3a2-0000-7000-8000-000000000001',
    bookTitle: 'كتاب البرمجة',
  } as const;

  it('names the book in a shipped notification and points at «كتبي»', () => {
    const view = describeNotification({ ...entry, kind: 'book_order_shipped' });

    expect(view.title).toContain('كتاب البرمجة');
    expect(view.subtitle).toBe(copy.notifications.bookOrderMineQueue);
    expect(view.href).toBe('/books/mine');
    expect(view.detail).toBeNull();
  });

  it('names the book in a delivered notification', () => {
    const view = describeNotification({ ...entry, kind: 'book_order_delivered' });

    expect(view.title).toContain('كتاب البرمجة');
    expect(view.href).toBe('/books/mine');
  });

  it("carries the admin's own reason on a rejection, verbatim", () => {
    // Same slot, and the same rule, as `payment_rejected`: a reason paraphrased
    // by the platform is a reason the student argues with instead of acting on.
    const view = describeNotification({
      ...entry,
      kind: 'book_order_rejected',
      reason: 'العنوان مش مكتمل',
    });

    expect(view.detail).toBe('العنوان مش مكتمل');
    expect(view.title).toContain('كتاب البرمجة');
    expect(view.href).toBe('/books/mine');
  });

  it('never sends a student to the shop instead of their own orders', () => {
    for (const kind of ['book_order_shipped', 'book_order_delivered'] as const) {
      expect(describeNotification({ ...entry, kind }).href).not.toBe('/books');
    }
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
