import {
  BadgeCheck,
  CircleAlert,
  ClipboardCheck,
  Hourglass,
  MessageCircleQuestion,
  MessagesSquare,
  PackageCheck,
  PackageOpen,
  PackageX,
  Send,
  Trophy,
  Truck,
  Wallet,
  NotebookPen,
} from 'lucide-react';
import type { StudentNotification } from '@ayman/contracts/notifications';

/**
 * One glyph per kind, shared by the bell's panel and the full page — a row a
 * student taps in the panel must look like the row they land on. Moved out of
 * `notification-list.tsx` when the panel started drawing icons too; each case
 * keeps the reasoning it was written with.
 */
export function iconFor(entry: StudentNotification) {
  switch (entry.kind) {
    case 'quiz_graded':
      return ClipboardCheck;
    case 'extra_attempt_granted':
      return BadgeCheck;
    case 'conversation_reply':
      return MessagesSquare;
    // Not `MessagesSquare` again: a message HE started is a different event
    // from a reply to something the student asked, and the two sit next to
    // each other in the same feed.
    case 'instructor_message':
      return Send;
    case 'payment_approved':
      return Wallet;
    case 'payment_rejected':
      return CircleAlert;
    // A clock running down, not the same `CircleAlert` a rejection uses —
    // this is a heads-up on time left, not a decision that needs looking at.
    case 'subscription_expiring_soon':
      return Hourglass;
    // Same icon as a rejection — both are an admin decision the student
    // did not make, cutting something off rather than warning about a
    // countdown already in motion.
    case 'subscription_cancelled':
      return CircleAlert;
    // The SAME `Trophy` the dashboard's 100% card draws
    // (`next-up-block.tsx`). Deliberately not a new symbol: this row and that
    // card are one event seen from two places, and a student who taps the
    // trophy in their bell should recognise what it is before reading a word.
    case 'course_completed':
      return Trophy;
    // The two ADMIN kinds. `Wallet` again for a submission — it is the same
    // subject as an approval, seen from the other side of the decision — and
    // the shipping queue's own icon for a parcel, so the row matches the
    // sidebar entry it links to.
    case 'payment_submitted':
      return Wallet;
    case 'book_order_placed':
      return PackageOpen;
    /*
      The three STUDENT book-order kinds, and they get three DIFFERENT parcels
      rather than one repeated icon.

      A feed is scanned before it is read, and these three are the rows a
      student is scanning FOR: «خرج» / «وصل» / «اترفض» is the whole content of
      the notification, and the glyph is what carries it at a glance. `PackageX`
      rather than the `CircleAlert` a rejected payment wears — the subject is
      the parcel, not the decision, and the two sit in the same list.
    */
    case 'book_order_shipped':
      return Truck;
    case 'book_order_delivered':
      return PackageCheck;
    case 'book_order_rejected':
      return PackageX;
    // A third ADMIN kind — a question mark rather than either message icon
    // above, since this is not المساعد answering (`MessagesSquare`) or him
    // writing first (`Send`): it is a student's own words waiting on him.
    case 'assistant_question_received':
      return MessageCircleQuestion;
    /*
      الواجب, one each way — and the SAME `NotebookPen` the sidebar entry and
      the student's own homework card use, deliberately. Three surfaces, one
      object: a row a student taps in their bell should look like the block it
      lands on.

      The verdict is carried by the WORDS, not by a second glyph: «اتقبل» and
      «فيه ملاحظات» are the title, and giving the returned one a warning icon
      would make an ordinary «حلوة، بس فيه حتة» read as something going wrong.
    */
    case 'homework_submitted':
    case 'homework_reviewed':
      return NotebookPen;

    /* لوحة الشرف — نفس الكأس اللي في عنوان القسم على الصفحة الرئيسية
       (`honor-board-section.tsx`). صف بيودّي على اللوحة لازم يبقى شكله
       اللوحة. */
    case 'honor_board_listed':
      return Trophy;
  }
}

/**
 * The colour family a kind is drawn in — five families, not one per kind, so
 * the panel reads as a few kinds of news rather than a paint box:
 * something to ANSWER (a question, homework handed in), something MARKED
 * (a paper, homework back), MONEY, a WIN, and a PROBLEM. Parcels and messages
 * get their own two because they are what a student scans the list for.
 */
export type NotificationTone = 'answer' | 'marked' | 'money' | 'win' | 'problem' | 'parcel' | 'message';

export function toneFor(entry: StudentNotification): NotificationTone {
  switch (entry.kind) {
    case 'assistant_question_received':
    case 'homework_submitted':
      return 'answer';
    case 'quiz_graded':
    case 'homework_reviewed':
    case 'extra_attempt_granted':
      return 'marked';
    case 'payment_approved':
    case 'payment_submitted':
      return 'money';
    case 'course_completed':
    case 'honor_board_listed':
      return 'win';
    case 'payment_rejected':
    case 'subscription_cancelled':
    case 'subscription_expiring_soon':
    case 'book_order_rejected':
      return 'problem';
    case 'book_order_placed':
    case 'book_order_shipped':
    case 'book_order_delivered':
      return 'parcel';
    case 'conversation_reply':
    case 'instructor_message':
      return 'message';
  }
}
