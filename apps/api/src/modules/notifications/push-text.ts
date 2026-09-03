import type { StudentNotification } from '@ayman/contracts/notifications';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { PushPayload } from './push.service';

const c = copy.notifications;

/**
 * Builds what a push notification says, from an ALREADY-RESOLVED feed entry
 * — never a second query. `null` means "not worth waking a phone for", which
 * today is every kind here has not decided is: the three ADMIN kinds are
 * covered because those are the ones with anyone actually subscribed (see
 * `push.service.ts`'s own header on why a STUDENT kind is a harmless no-op
 * regardless), and adding a fourth is one more `case` here plus whatever
 * subscribes the audience it is for.
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

    default:
      return null;
  }
}
