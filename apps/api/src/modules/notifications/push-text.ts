import type { StudentNotification } from '@ayman/contracts/notifications';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { PushPayload } from './push.service';

const c = copy.notifications;

/**
 * Builds what a push notification says, from an ALREADY-RESOLVED feed entry
 * — never a second query. `null` means "not worth waking a phone for", which
 * is every kind not listed below: the three ADMIN kinds are covered because
 * those are the ones with anyone actually subscribed (see `push.service.ts`'s
 * own header on why a STUDENT kind is a harmless no-op regardless), and adding
 * one more is one `case` here plus whatever subscribes the audience it is for.
 *
 * `course_completed` is the FIRST student kind with a case, and it is a
 * deliberate no-op today — no student-side UI subscribes a browser yet, so
 * `notifyUser` returns without sending. It is written now because it is the
 * one student event whose whole point is reaching somebody who is NOT looking
 * at the screen; the day a student can subscribe, the warmest message on the
 * platform should not be the one still waiting on a `case` to be added.
 *
 * This is a SERVER-SIDE, Arabic-only twin of `apps/web/lib/notification-view.ts`
 * — not a shared module, because a push payload and an in-app row answer
 * different questions. The in-app view can point `href` at a fragment
 * (`/dashboard?assistant=1`) a Service Worker's `notificationclick` has no use
 * for opening fresh, and it never needs a body sentence at all (the title and
 * the resolved subtitle sit on two separate lines already). Two call sites
 * reading the same `copy` table stay in sync on WORDING without needing to
 * share layout logic that would only diverge the moment one of them does.
 */
export function pushPayloadFor(entry: StudentNotification): PushPayload | null {
  switch (entry.kind) {
    case 'payment_submitted':
      return {
        title: formatCopy(c.paymentSubmitted, { name: entry.studentName }),
        body: entry.courseTitle,
        url: '/admin/payments',
        tag: 'ayman-payments',
      };

    case 'book_order_placed':
      return {
        title: formatCopy(c.bookOrderPlaced, { name: entry.studentName }),
        body: c.bookOrderQueue,
        url: '/admin/books',
        tag: 'ayman-book-orders',
      };

    case 'assistant_question_received':
      return {
        title: formatCopy(c.assistantQuestionReceived, { name: entry.studentName }),
        body: entry.preview,
        url: `/admin/inbox/${entry.conversationId}`,
        // Shared tag, deliberately: three questions in quick succession
        // collapse to the most recent one in the tray, same as the toast's
        // own `tag` already does for the live stream — a tray full of «سؤال
        // جديد» repeated three times says less than the newest one alone.
        tag: 'ayman-inbox',
      };

    /*
      The one STUDENT kind here. Body from the copy table rather than the
      course title, because the title is already in `title` — a push whose two
      lines say the same words twice reads as a bug, and the second line is
      the encouragement, which is the entire reason this notification exists.

      Its own `tag`, keyed by the course: finishing happens once per course, so
      there is nothing to collapse against, and sharing a tag with another kind
      would let an unrelated alert replace the congratulation in the tray.
    */
    case 'course_completed':
      return {
        title: formatCopy(c.courseCompleted, { course: entry.courseTitle }),
        body: c.courseCompletedDetail,
        url: `/courses/${entry.courseSlug}`,
        tag: `ayman-course-completed-${entry.courseId}`,
      };

    default:
      return null;
  }
}
