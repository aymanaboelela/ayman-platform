part of 'course_cubit.dart';

sealed class CourseState extends Equatable {
  const CourseState();

  @override
  List<Object?> get props => [];
}

final class CourseLoading extends CourseState {
  const CourseLoading();
}

final class CourseFailed extends CourseState {
  const CourseFailed(this.failure);

  final Failure failure;

  @override
  List<Object?> get props => [failure];
}

final class CourseReady extends CourseState {
  const CourseReady(this.view, {this.enrolling = false});

  final CourseView view;

  /// An enrolment request is in flight — the button reads «ثانية واحدة…».
  final bool enrolling;

  CourseReady copyWith({CourseView? view, bool? enrolling}) =>
      CourseReady(view ?? this.view, enrolling: enrolling ?? this.enrolling);

  @override
  List<Object?> get props => [view, enrolling];
}
