import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/router/routes.dart';
import 'notification_entry.dart';

/// A notification, rendered.
@immutable
class NotificationView {
  const NotificationView({
    required this.title,
    required this.icon,
    this.detail,
    this.subtitle,
    this.route,
  });

  final String title;
  final IconData icon;

  /// A second line — a verdict, a grade, a delivery estimate.
  final String? detail;

  /// What the notification is ABOUT: a lesson title, a course name.
  final String? subtitle;

  /// Where tapping goes. Null means the row is not tappable, which is a real
  /// state — an admin-only kind reaching a student's feed has nowhere useful
  /// to send them.
  final String? route;
}

/// Turns a row into words and a destination.
///
/// ## Why the client composes the sentence at all
///
/// The API never sends prose: a row carries a `kind` plus ids and numbers, and
/// there is no `message` column on purpose. Two consequences the client must
/// honour:
///
///  1. **Titles are resolved at READ time.** A lesson renamed after the
///     notification was written reads with its NEW name. So a rendered string
///     must never be cached — re-describe from the entry every build.
///  2. **An unknown kind returns null** and the row is dropped, rather than
///     throwing. The API is on a rolling release and will one day send a kind
///     this build has not heard of.
abstract final class NotificationDescriber {
  /// Null for a kind this build does not know. Callers filter those out.
  static NotificationView? describe(NotificationEntry entry) {
    return switch (entry.kind) {
      'quiz_graded' => NotificationView(
        title: tr(
          CopyKeys.notificationsQuizGraded,
          namedArgs: {'score': '${entry.intOrNull('scorePercent') ?? 0}'},
        ),
        // `passed` is nullable in the column and should not occur. Render NO
        // verdict rather than guessing — telling a student they failed because
        // a boolean was null is the worst possible way to be wrong.
        detail: switch (entry.boolOrNull('passed')) {
          true => tr(CopyKeys.notificationsQuizGradedPassed),
          false => tr(CopyKeys.notificationsQuizGradedFailed),
          null => null,
        },
        subtitle: entry.str('lessonTitle'),
        icon: Icons.fact_check_outlined,
        route: AppRoutes.attemptReviewOf(
          entry.str('lessonId'),
          entry.str('attemptId'),
        ),
      ),

      'extra_attempt_granted' => NotificationView(
        title: tr(CopyKeys.notificationsExtraAttempt),
        subtitle: entry.str('lessonTitle'),
        icon: Icons.verified_outlined,
        // The quiz INTRO, never a fresh attempt: starting a graded exam is
        // never something a link does.
        route: AppRoutes.quizOf(entry.str('lessonId')),
      ),

      'conversation_reply' => NotificationView(
        title: tr(CopyKeys.notificationsConversationReply),
        subtitle: tr(CopyKeys.assistantThreadTitle),
        icon: Icons.forum_outlined,
        route: AppRoutes.chat,
      ),

      'instructor_message' => NotificationView(
        // Four different sentences behind one kind, chosen by `outreachKind`.
        // «شاف نتيجتك» and «فاكرك بالكويز» say different things and a single
        // generic title would waste the one line a notification gets.
        title: switch (entry.str('outreachKind')) {
          'quiz_result' => tr(CopyKeys.notificationsInstructorMessageQuizResult),
          'quiz_nudge' => tr(CopyKeys.notificationsInstructorMessageQuizNudge),
          'lesson_praise' => tr(CopyKeys.notificationsInstructorMessageLessonPraise),
          'whatsapp_invite' =>
            tr(CopyKeys.notificationsInstructorMessageWhatsappInvite),
          _ => tr(CopyKeys.notificationsInstructorMessage),
        },
        subtitle: tr(CopyKeys.assistantThreadTitle),
        icon: Icons.mark_email_unread_outlined,
        route: AppRoutes.chat,
      ),

      'payment_approved' => NotificationView(
        title: tr(
          CopyKeys.notificationsPaymentApproved,
          namedArgs: {'course': entry.str('courseTitle')},
        ),
        icon: Icons.check_circle_outline_rounded,
        route: AppRoutes.courseDetailOf(entry.str('courseSlug')),
      ),

      'payment_rejected' => NotificationView(
        title: tr(
          CopyKeys.notificationsPaymentRejected,
          namedArgs: {'course': entry.str('courseTitle')},
        ),
        icon: Icons.error_outline_rounded,
        route: AppRoutes.courseDetailOf(entry.str('courseSlug')),
      ),

      'subscription_expiring_soon' => NotificationView(
        title: tr(
          CopyKeys.notificationsSubscriptionExpiringSoon,
          namedArgs: {'course': entry.str('courseTitle')},
        ),
        icon: Icons.schedule_rounded,
        route: AppRoutes.courseDetailOf(entry.str('courseSlug')),
      ),

      'subscription_cancelled' => NotificationView(
        title: tr(
          CopyKeys.notificationsSubscriptionCancelled,
          namedArgs: {'course': entry.str('courseTitle')},
        ),
        icon: Icons.cancel_outlined,
        route: AppRoutes.courseDetailOf(entry.str('courseSlug')),
      ),

      'book_order_shipped' => NotificationView(
        title: tr(
          CopyKeys.notificationsBookOrderShipped,
          namedArgs: {'book': entry.str('bookTitle')},
        ),
        detail: tr(
          CopyKeys.notificationsBookOrderShippedDetail,
          namedArgs: {'days': '${entry.intOrNull('deliveryDays') ?? 0}'},
        ),
        subtitle: tr(CopyKeys.notificationsBookOrderMineQueue),
        icon: Icons.local_shipping_outlined,
        route: AppRoutes.storeOrders,
      ),

      'book_order_delivered' => NotificationView(
        title: tr(
          CopyKeys.notificationsBookOrderDelivered,
          namedArgs: {'book': entry.str('bookTitle')},
        ),
        subtitle: tr(CopyKeys.notificationsBookOrderMineQueue),
        icon: Icons.inventory_2_outlined,
        route: AppRoutes.storeOrders,
      ),

      'book_order_rejected' => NotificationView(
        title: tr(
          CopyKeys.notificationsBookOrderRejected,
          namedArgs: {'book': entry.str('bookTitle')},
        ),
        subtitle: tr(CopyKeys.notificationsBookOrderMineQueue),
        icon: Icons.remove_shopping_cart_outlined,
        route: AppRoutes.storeOrders,
      ),

      'course_completed' => NotificationView(
        title: tr(
          CopyKeys.notificationsCourseCompleted,
          namedArgs: {'course': entry.str('courseTitle')},
        ),
        detail: tr(CopyKeys.notificationsCourseCompletedDetail),
        icon: Icons.emoji_events_outlined,
        route: AppRoutes.courseDetailOf(entry.str('courseSlug')),
      ),

      'homework_reviewed' => _homeworkReviewed(entry),

      // ── admin kinds ────────────────────────────────────────────────────
      //
      // Rendered rather than dropped: an admin using the app is a real case
      // and these are exactly the rows they need. A student never receives
      // one — the server addresses them to `conversation:read` holders.
      'payment_submitted' => NotificationView(
        title: tr(
          CopyKeys.notificationsPaymentSubmitted,
          namedArgs: {'name': entry.str('studentName')},
        ),
        icon: Icons.payments_outlined,
        route: AppRoutes.adminPayments,
      ),

      'book_order_placed' => NotificationView(
        title: tr(
          CopyKeys.notificationsBookOrderPlaced,
          namedArgs: {'name': entry.str('studentName')},
        ),
        subtitle: tr(CopyKeys.notificationsBookOrderQueue),
        icon: Icons.shopping_bag_outlined,
        route: AppRoutes.adminBookOrders,
      ),

      'assistant_question_received' => NotificationView(
        title: tr(
          CopyKeys.notificationsAssistantQuestionReceived,
          namedArgs: {'name': entry.str('visitorName')},
        ),
        subtitle: tr(CopyKeys.notificationsAssistantQuestionQueue),
        icon: Icons.question_answer_outlined,
        route: AppRoutes.adminInbox,
      ),

      'homework_submitted' => NotificationView(
        title: tr(
          CopyKeys.notificationsHomeworkSubmitted,
          namedArgs: {'name': entry.str('studentName')},
        ),
        detail: tr(CopyKeys.notificationsHomeworkSubmittedDetail),
        icon: Icons.assignment_outlined,
        route: AppRoutes.adminHomework,
      ),

      // A kind this build has not heard of. Dropped, never thrown.
      _ => null,
    };
  }

  /// Two outcomes behind one kind, and the server drops anything else.
  ///
  /// «اتقبل ✅» carries the grade when there is one; «فيه ملاحظات» never does —
  /// a mark on a rejected submission reads as a punishment rather than as
  /// feedback, and the copy note is explicit that the wording avoids an
  /// imperative because an imperative would address a boy.
  static NotificationView _homeworkReviewed(NotificationEntry entry) {
    final accepted = entry.str('homeworkStatus') == 'accepted';
    final grade = entry.intOrNull('grade');

    return NotificationView(
      title: tr(
        accepted
            ? CopyKeys.notificationsHomeworkAccepted
            : CopyKeys.notificationsHomeworkNeedsWork,
        namedArgs: {'lesson': entry.str('lessonTitle')},
      ),
      detail: accepted && grade != null
          ? tr(CopyKeys.notificationsHomeworkAcceptedGrade, namedArgs: {'grade': '$grade'})
          : tr(
              accepted
                  ? CopyKeys.notificationsHomeworkAcceptedDetail
                  : CopyKeys.notificationsHomeworkNeedsWorkDetail,
            ),
      subtitle: entry.str('lessonTitle'),
      icon: accepted ? Icons.task_alt_rounded : Icons.rate_review_outlined,
      route: AppRoutes.lessonOf(entry.str('courseSlug'), entry.str('lessonId')),
    );
  }
}
