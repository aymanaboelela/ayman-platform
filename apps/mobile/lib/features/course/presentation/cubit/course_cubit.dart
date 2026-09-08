import 'package:easy_localization/easy_localization.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/localization/copy_keys.dart';
import '../../domain/repositories/course_repository.dart';

part 'course_state.dart';

/// Owns one course page.
class CourseCubit extends Cubit<CourseState> {
  CourseCubit(this._repository, this.slug) : super(const CourseLoading());

  final CourseRepository _repository;
  final String slug;

  Future<void> load() async {
    if (state is! CourseReady) emit(const CourseLoading());
    final result = await _repository.load(slug);
    result.fold(
      (failure) => emit(CourseFailed(failure)),
      (view) => emit(CourseReady(view)),
    );
  }

  /// Pull-to-refresh — a failure keeps what is on screen, like every other
  /// list in the app.
  Future<void> refresh() async {
    final current = state;
    final result = await _repository.load(slug);
    result.fold(
      (failure) {
        if (current is! CourseReady) emit(CourseFailed(failure));
      },
      (view) => emit(CourseReady(view)),
    );
  }

  /// «نبدأ الكورس».
  ///
  /// Answers with where to go, or with what went wrong — the page navigates,
  /// this does not. Keeping `context` out of the cubit is what lets the same
  /// call be made from a sheet, a card or a deep link without three copies of
  /// the branch below.
  Future<CourseEnrollOutcome> enroll() async {
    final current = state;
    if (current is! CourseReady || current.enrolling) {
      return const CourseEnrollBusy();
    }

    emit(current.copyWith(enrolling: true));
    final result = await _repository.enroll(current.view.course.id);
    // ALWAYS released, including on the path that navigates away: this page
    // stays alive in the router's stack and a back navigation would otherwise
    // return to a permanently disabled button. The double-tap it re-opens is
    // harmless — enrolment is an upsert and resolves to the same lesson.
    emit(current.copyWith(enrolling: false));

    return result.fold(
      (failure) => switch (failure) {
        // 403 has two meanings and the common one is not an error the student
        // can retry away. A PRICED course refusing enrolment means "pay
        // first"; a free one means the course is «مقفول», and «حاول تاني» is
        // the wrong sentence for a locked door.
        ForbiddenFailure() when current.view.course.isPriced =>
          const CourseEnrollNeedsSubscription(),
        ForbiddenFailure() =>
          CourseEnrollFailed(tr(CopyKeys.courseLockedError)),
        _ => CourseEnrollFailed(failure.message),
      },
      (lessonId) => lessonId == null
          // A published course with no published lessons. Navigating to
          // `/lessons/null` is a 404 that reads like a broken button.
          ? CourseEnrollFailed(tr(CopyKeys.courseNoLessons))
          : CourseEnrollStarted(lessonId),
    );
  }
}

/// What pressing «نبدأ الكورس» resolved to.
sealed class CourseEnrollOutcome {
  const CourseEnrollOutcome();
}

/// Enrolled — open this lesson.
class CourseEnrollStarted extends CourseEnrollOutcome {
  const CourseEnrollStarted(this.lessonId);

  final String lessonId;
}

/// The course is paid and this student has not subscribed yet.
class CourseEnrollNeedsSubscription extends CourseEnrollOutcome {
  const CourseEnrollNeedsSubscription();
}

/// Show this sentence and stay put.
class CourseEnrollFailed extends CourseEnrollOutcome {
  const CourseEnrollFailed(this.message);

  final String message;
}

/// A press that arrived while one was already in flight. Say nothing.
class CourseEnrollBusy extends CourseEnrollOutcome {
  const CourseEnrollBusy();
}
