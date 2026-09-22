import type { StudentNotification } from '@ayman/contracts/notifications';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { IS_AYMAN } from '../../common/tenant';
import type { PushPayload } from './push.service';

const c = copy.notifications;

/**
 * What a message from the instructor is called on a stack that is not his.
 *
 * ## Why `IS_AYMAN` here and `tenantName()` everywhere else
 *
 * `tenantName(fallback)` swaps a NAME, and it cannot reach inside a sentence.
 * Every string this file had to gate has the name welded into the middle of
 * one — «مهندس أيمن بعتلك رسالة», «مهندس أيمن راجع الحل وكتب لك رد.» — so
 * there is nothing for it to swap. Substitution would not be grammatical even
 * if it could: a stack that set no `TENANT_DISPLAY_NAME` gets «المنصة», and
 * «المنصة بعتلك رسالة» inflects the verb for a masculine person.
 * `lib/seo/metadata.ts` hit this same wall on `copy.seo.defaultTitle` and
 * answered it the same way — his stack returns the literal byte for byte, and
 * any other stack gets a different string entirely.
 *
 * ## Why this is an existing copy entry and not a sentence written here
 *
 * Global Constraint 4 keeps Arabic prose out of modules so the voice has one
 * place to be edited, and «رسالة جديدة» already exists for exactly this
 * feature: it is the eyebrow on the dashboard card that announces the very
 * same message. It says less than his line does — that is the honest cost of a
 * platform not knowing whose name to sign with, and it is the cost `manifest
 * .ts` already pays by shipping no icons rather than the wrong face.
 *
 * ## Why a push is the worst place to have leaked it
 *
 * Every other leak in this product is on a page somebody opens, and a page is
 * proof-read by whoever opens it. This one is on a LOCK SCREEN: a student who
 * never unlocks the phone has still been told, by name, who wrote to them.
 */
const NEW_MESSAGE = copy.dashboard.instructorMessage.eyebrow;

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
        /* The date, not «كتبي». A push notification is read on a lock screen
           and usually not opened — so the one fact the student wants is in the
           body rather than behind a tap, and the destination is already the
           whole point of the tap. */
        body: formatCopy(c.bookOrderShippedDetail, { days: entry.deliveryDays }),
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

    /*
      الواجب — one each way, and both earn a tray line for the same reason the
      book-order kinds do: neither person is looking at a screen when it
      happens. He is not at his desk when homework is handed in at eleven at
      night, and a student who has been asked to redo an exercise is not going
      to find that out by refreshing the player.

      `tag` is PER SUBMISSION on the student's, so two lectures' verdicts never
      collapse into one; SHARED on his, so twenty answers in an evening are one
      line saying the newest — same choice `ayman-inbox` makes above.
    */
    case 'homework_submitted':
      return {
        title: formatCopy(c.homeworkSubmitted, { name: entry.studentName }),
        body: entry.lessonTitle,
        url: `/admin/homework/${entry.submissionId}`,
        tag: 'ayman-homework',
      };

    case 'homework_reviewed': {
      const accepted = entry.homeworkStatus === 'accepted';
      return {
        title: formatCopy(accepted ? c.homeworkAccepted : c.homeworkNeedsWork, {
          lesson: entry.lessonTitle,
        }),
        // The mark when there is one, and the reason to open the message when
        // there is not. Never both — a two-line tray entry that repeats itself
        // reads as a bug, same note `course_completed` carries.
        /*
         * ⚠️ Both detail lines name the instructor, and on a stack that is not
         * his the push goes out with the title alone.
         *
         * Nothing generic can replace them without lying about who marked the
         * work — «مهندس أيمن راجع الحل وكتب لك رد.» has exactly one fact in it
         * beyond what the title already says, and that fact is WHO. The mark,
         * which is the half a student actually wants, is unaffected: it comes
         * from `homeworkAcceptedGrade` above and carries no name.
         *
         * What is lost on a tenant stack is «والواجب مفتوح تاني» on the
         * needs-work branch. The title «واجب {lesson} فيه ملاحظات» still says
         * there are notes, and tapping the push lands on the lesson page where
         * the upload box is open and `copy.homework.reopened` says so in
         * place. Saying less in the tray is the price; saying a stranger's
         * name is not a price this platform pays.
         */
        body:
          accepted && entry.grade !== null
            ? formatCopy(c.homeworkAcceptedGrade, { grade: entry.grade })
            : !IS_AYMAN
              ? ''
              : accepted
                ? c.homeworkAcceptedDetail
                : c.homeworkNeedsWorkDetail,
        url: `/courses/${entry.courseSlug}/lessons/${entry.lessonId}`,
        tag: `ayman-homework-${entry.submissionId}`,
      };
    }

    /*
      «مهندس أيمن بعتلك رسالة» — and the reason it is on this list is the whole
      point of the channel.
     
      The in-app broadcast exists BECAUSE WhatsApp cannot be promised: a
      campaign ran in 2026-09 in which every message was accepted by WhatsApp
      and delivered to nobody, and the platform reported it as a flawless run.
      This kind is what replaces it. But an announcement that only arrives on
      the student's next tab open is not a replacement for a message that used
      to buzz a phone — so the one kind that has to reach a locked screen is
      this one.
     
      Body from the copy table, not the message text: the message is read in
      the conversation where it can be answered, and a tray line carrying a
      second copy of it is free to disagree with the first — the same reason
      `InstructorMessageNotificationSchema` stores no body either.
     
      SHARED tag: two announcements in one evening collapse to the newest,
      like `ayman-inbox`. A student told twice about a lecture reminder learns
      nothing the second time.
    */
    case 'instructor_message':
      return {
        // ⚠️ The ONE kind on this list whose title is a person's name, and the
        // one that reaches a locked phone by design — see `NEW_MESSAGE`.
        // `instructorMessagePushDetail` below («افتح المنصة تقراها وترد عليه»)
        // names nobody and is shipped unchanged on every stack.
        title: IS_AYMAN ? c.instructorMessage : NEW_MESSAGE,
        body: c.instructorMessagePushDetail,
        // The thread lives in the assistant widget — a `/conversations/:id`
        // route would give the student two inboxes for one conversation, the
        // same note `notification-view.ts` carries for the in-app row.
        url: '/dashboard?assistant=1',
        tag: 'ayman-instructor-message',
      };

    /*
      لوحة الشرف — «اسمك عليها».

      على الليستة دي لأقوى سبب فيها كلها: الطالب مالوش أي طريقة تانية يعرف.
      اللوحة صفحة عامة مالوش سبب يفتحها، ومفيش حاجة على شاشاته بتتغيّر لما
      اسمه يتحط عليها — فالـpush مش «تنبيه إضافي»، ده الخبر نفسه.

      مفيش اسم مدرّس هنا، فالسطرين بيتشحنوا زي ما هما على أي ستاك — مش زي
      `homework_reviewed` فوق.

      `tag` لكل تكريم لوحده: اتنين في شهر حاجتين حصلوا، ودمجهم في سطر واحد
      بيمسح واحد فيهم.
    */
    case 'honor_board_listed':
      return {
        title: c.honorBoardListed,
        body: formatCopy(c.honorBoardListedDetail, {
          rank: rankWord(entry.rank),
          reason: entry.reason,
        }),
        // دور اللوحة بتاعه، مش أول الصفحة — صفحة الأرشيف بتفتح على الدور
        // اللي في `?round=`.
        url: `/honor-board?round=${entry.day}`,
        tag: `ayman-honor-${entry.pinId}`,
      };

    default:
      return null;
  }
}

/**
 * «المركز الأول» — الكلمة، مش الرقم.
 *
 * رقم لاتيني جوّه سطر عربي على شاشة قفل بيتقلب (`unicode-bidi` مش موجود في
 * التراي)، والكلمة بتتقري صح في كل مكان. مركز أكبر من الليستة بيرجّع نص
 * فاضي، و`formatCopy` بتسيب الشرطة — أحسن من «المركز undefined».
 */
function rankWord(rank: number): string {
  return copy.landing.honorBoard.placeRanks[rank - 1] ?? '';
}
