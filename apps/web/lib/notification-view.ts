import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { StudentNotification } from '@ayman/contracts/notifications';
import { ASSISTANT_OPEN_PARAM } from './assistant-mount';
import { MY_BOOK_ORDERS_HREF } from './book-order-view';
import { reviewHref } from './quiz-links';

/**
 * Turning a notification row into a sentence and a destination.
 *
 * Pure functions in their own module so both the panel and the full page
 * render the same words and link to the same place — and so the mapping is
 * testable without a render. The API deliberately sends no prose (see
 * `packages/contracts/src/notifications.ts`); this is where it becomes prose.
 */

export interface NotificationView {
  title: string;
  /** A short qualifier under the title. `null` when the title says it all. */
  detail: string | null;
  /**
   * The line under the title naming WHAT this is about.
   *
   * It used to be read straight off the row as `entry.lessonTitle` by both
   * renderers, which quietly assumed every notification is about a lesson.
   * `conversation_reply` is not, and that assumption became a type error the
   * moment it landed — in two components rather than here, where the mapping
   * from row to prose already lives.
   */
  subtitle: string;
  href: string;
}

const c = copy.notifications;

export function describeNotification(entry: StudentNotification): NotificationView {
  switch (entry.kind) {
    case 'quiz_graded':
      return {
        title: formatCopy(c.quizGraded, { score: entry.scorePercent }),
        // `passed` is nullable on the wire; a missing verdict renders no
        // qualifier rather than guessing one from the score, because the pass
        // mark is per-quiz and this row does not carry it.
        detail:
          entry.passed === null ? null : entry.passed ? c.quizGradedPassed : c.quizGradedFailed,
        subtitle: entry.lessonTitle,
        href: reviewHref(entry.lessonId, entry.attemptId),
      };

    case 'extra_attempt_granted':
      return {
        title: c.extraAttempt,
        detail: null,
        subtitle: entry.lessonTitle,
        // The quiz's intro page, not a new attempt: starting a graded exam is
        // never something a link does. That page owns the button.
        href: `/quizzes/${entry.lessonId}`,
      };

    case 'conversation_reply':
      return {
        title: c.conversationReply,
        detail: null,
        subtitle: copy.assistant.title,
        /*
         * The thread lives in the widget, not on a page of its own — so this
         * links to the dashboard carrying the flag that opens it there. A
         * `/conversations/:id` route would be a second place to read the same
         * messages, and the student would have two inboxes.
         */
        href: `/dashboard?${ASSISTANT_OPEN_PARAM}=1`,
      };

    case 'instructor_message':
      return {
        // The lead-in is chosen by WHY he wrote, so a student can tell at a
        // glance whether this is their result or a reminder about the group.
        // An unknown kind — a row written by a newer deployment mid-release —
        // falls back to the generic line rather than being dropped: a message
        // from the instructor is the last thing this feed should swallow.
        title: INSTRUCTOR_LEAD_INS[entry.outreachKind] ?? c.instructorMessage,
        detail: null,
        subtitle: copy.assistant.thread.title,
        // Same destination as a reply, and for the same reason: the thread
        // lives in the widget, and a `/conversations/:id` route would give the
        // student two inboxes showing one conversation.
        href: `/dashboard?${ASSISTANT_OPEN_PARAM}=1`,
      };

    case 'payment_approved':
      return {
        title: formatCopy(c.paymentApproved, { course: entry.courseTitle }),
        detail: null,
        subtitle: entry.courseTitle,
        href: `/courses/${entry.courseSlug}`,
      };

    case 'payment_rejected':
      return {
        title: formatCopy(c.paymentRejected, { course: entry.courseTitle }),
        // The admin's own explanation, shown as the qualifier under the
        // title — same idea as `quizGradedPassed`/`quizGradedFailed`, but the
        // text is not from a fixed vocabulary this time.
        detail: entry.reason,
        subtitle: entry.courseTitle,
        href: `/courses/${entry.courseSlug}`,
      };

    case 'subscription_expiring_soon':
      return {
        title: formatCopy(c.subscriptionExpiringSoon, { course: entry.courseTitle }),
        // The exact date, formatted the same way the dashboard card's own
        // absolute-date branch does — the title already said "soon"; this is
        // where "soon" becomes a real number.
        detail: formatNotificationTime(entry.validUntil),
        subtitle: entry.courseTitle,
        // Straight to the course — same destination `payment_approved` uses,
        // and for the same reason: renewing IS opening the subscribe panel
        // from inside the course page.
        href: `/courses/${entry.courseSlug}`,
      };

    case 'subscription_cancelled':
      return {
        title: formatCopy(c.subscriptionCancelled, { course: entry.courseTitle }),
        // The admin's own explanation — same treatment as `payment_rejected`'s
        // `reason` above, and for the same underlying fact: this is free
        // text an admin chose to write, an admin chose to show, not a fixed
        // vocabulary this feed picks from.
        detail: entry.reason,
        subtitle: entry.courseTitle,
        href: `/courses/${entry.courseSlug}`,
      };

    /*
      The two ADMIN kinds, rendered by the same function as every student one.

      They land in the same feed and the same bell on purpose — an instructor
      who has to check a second place for «فيه حاجة مستنياني» checks neither.
      The hrefs point at the QUEUE rather than at the individual row: the
      decision is made in a list, beside the others waiting, and deep-linking
      to one submission hides the fact that four more arrived with it.
    */
    case 'payment_submitted':
      return {
        title: formatCopy(c.paymentSubmitted, { name: entry.studentName }),
        detail: null,
        subtitle: entry.courseTitle,
        href: '/admin/payments',
      };

    case 'book_order_placed':
      return {
        title: formatCopy(c.bookOrderPlaced, { name: entry.studentName }),
        detail: null,
        // A book order is not attached to a course — the shop sells from its
        // own catalogue — so the only thing left to name is the queue itself.
        // From `copy.notifications`, NOT the admin table: this module is
        // imported by the student's bell, and reaching into `copy/admin` here
        // would pull the whole admin copy set onto every signed-in page.
        subtitle: c.bookOrderQueue,
        href: '/admin/books',
      };

    /*
      The three STUDENT book-order kinds — `book_order_placed` above is the
      admin's alert about the same object, seen from the other side.

      All three land on `/store/orders` rather than on the shop, and that is the
      whole point of them: a student who is told «كتابك خرج ليك» and lands on a
      page selling books has been answered with an advertisement. `{book}` is
      resolved at read time off the order's first line, so a title renamed after
      shipping reads as its current name — and an order whose lines were all
      removed simply has an empty slot rather than a row that fails to parse.
    */
    case 'book_order_shipped':
      return {
        title: formatCopy(c.bookOrderShipped, { book: entry.bookTitle }),
        detail: null,
        // `copy.notifications`, NOT `copy.books.mine.title` — the two say the
        // same word today and this module is imported by the student's bell, so
        // the subtitle is kept in the same table as every other row's.
        subtitle: c.bookOrderMineQueue,
        href: MY_BOOK_ORDERS_HREF,
      };

    case 'book_order_delivered':
      return {
        title: formatCopy(c.bookOrderDelivered, { book: entry.bookTitle }),
        detail: null,
        subtitle: c.bookOrderMineQueue,
        href: MY_BOOK_ORDERS_HREF,
      };

    case 'book_order_rejected':
      return {
        title: formatCopy(c.bookOrderRejected, { book: entry.bookTitle }),
        // The admin's own words, verbatim, in the same slot `payment_rejected`
        // puts its `reason` — and for the same reason: a reason paraphrased by
        // the platform is a reason the student argues with instead of acting
        // on. The card on `/store/orders` prints it a second time under «السبب:»,
        // which is deliberate: the feed is where it is seen, that page is where
        // it stays.
        detail: entry.reason,
        subtitle: c.bookOrderMineQueue,
        href: MY_BOOK_ORDERS_HREF,
      };

    // A third ADMIN kind, same discipline as the two above.
    case 'assistant_question_received':
      return {
        title: formatCopy(c.assistantQuestionReceived, { name: entry.studentName }),
        // The snapshot of what was asked, not a fixed qualifier — same slot
        // `payment_rejected`'s `reason` occupies for the same reason: this is
        // free text, not a fixed vocabulary this feed picks from.
        detail: entry.preview || null,
        subtitle: c.assistantQuestionQueue,
        href: `/admin/inbox/${entry.conversationId}`,
      };
  }
}

/**
 * Keyed by `OUTREACH_KINDS`, but typed as an open record on purpose.
 *
 * The wire field is a bare `string` (see `notifications.ts`) because the
 * payload is jsonb and a row can outlive the build that wrote it. Typing this
 * as `Record<OutreachKind, string>` would force a cast at the lookup and buy
 * nothing — the fallback above is the real handling.
 */
const INSTRUCTOR_LEAD_INS: Record<string, string> = {
  quiz_result: c.instructorMessageQuizResult,
  quiz_nudge: c.instructorMessageQuizNudge,
  lesson_praise: c.instructorMessageLessonPraise,
  whatsapp_invite: c.instructorMessageWhatsappInvite,
};

/**
 * An ABSOLUTE timestamp, not "من ٣ ساعات".
 *
 * Relative time was the first attempt here and it was wrong twice over. It
 * needs the current clock, and reading the clock during render is impure —
 * the React Compiler rejects it outright, and rightly: a Server Component
 * rendering "من دقيقتين" and the client hydrating a moment later disagree,
 * and React discards the tree on that mismatch. Threading a `now` prop down
 * from the server works around the compiler but not the underlying problem,
 * that the string goes stale the second it is painted.
 *
 * An absolute date is also what every other timestamp in the product shows —
 * `activity-feed.tsx`, `devices-list.tsx` — with the same formatter and the
 * same Western digits (`-u-nu-latn`). One convention, and nothing to keep in
 * sync with a ticking clock.
 */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatNotificationTime(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
