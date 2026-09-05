import type { StudentNotification } from '@ayman/contracts/notifications';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { PushPayload } from './push.service';

const c = copy.notifications;

/**
 * «كتبي» — where all three book-order pushes land.
 *
 * A LIST, never `/store/orders/:id`, for the same reason `payment_submitted`
 * points at `/admin/payments` rather than at one submission: a student who
 * has two orders in flight opens this to see BOTH, and the card they were
 * notified about is the first one on it anyway.
 */
const BOOK_ORDERS_URL = '/store/orders';

/**
 * Builds what a push notification says, from an ALREADY-RESOLVED feed entry
 * — never a second query. `null` means "not worth waking a phone for", and
 * the cases below are what somebody has decided IS: the three ADMIN kinds,
 * because those are the ones with anyone actually subscribed today, the three
 * الكتاب الورقي kinds, and «مبروك، خلصت الكورس», because a parcel is the one thing on this
 * platform that moves while the student is nowhere near a browser — «وصل ولا
 * لسه؟» is the question they were phoning to ask, and a tray line answers it
 * without them opening anything. Until a student-side UI subscribes a phone
 * those three stay a harmless no-op (see `push.service.ts`'s own header), and
 * they cost nothing while they wait. Adding a seventh is one more `case` here
 * plus whatever subscribes the audience it is for.
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
     * الكتاب الورقي — الطالب. The three below are the first STUDENT kinds on
     * this list, and they are here for a reason none of the admin ones have:
     * an admin is at a desk with the queue open, a student waiting on a book
     * is not at a screen at all. A tray line is the whole answer.
     *
     * `tag` is PER ORDER, not shared like `ayman-inbox` above. «خرج ليك» and
     * «وصلك» are the same parcel one step apart, so the second replacing the
     * first in the tray is exactly right — while two different orders in
     * flight must never collapse into one, because then the student is told
     * about a book and never told about the other.
     *
     * `bookTitle` can be the empty string (an order whose lines were all
     * removed); the copy carries `{book}` at the end of the sentence so it
     * still reads.
     */
    case 'book_order_shipped':
      return {
        title: formatCopy(c.bookOrderShipped, { book: entry.bookTitle }),
        body: c.bookOrderMineQueue,
        url: BOOK_ORDERS_URL,
        tag: `ayman-book-order-${entry.orderId}`,
      };

    case 'book_order_delivered':
      return {
        title: formatCopy(c.bookOrderDelivered, { book: entry.bookTitle }),
        body: c.bookOrderMineQueue,
        url: BOOK_ORDERS_URL,
        tag: `ayman-book-order-${entry.orderId}`,
      };

    case 'book_order_rejected':
      return {
        title: formatCopy(c.bookOrderRejected, { book: entry.bookTitle }),
        // The admin's own words, in the slot the queue name occupies on the
        // other two — same choice `assistant_question_received` makes with
        // `preview`. A rejection whose reason is one tap away is a rejection
        // the student phones about; verbatim in the tray is the point.
        body: entry.reason,
        url: BOOK_ORDERS_URL,
        tag: `ayman-book-order-${entry.orderId}`,
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
