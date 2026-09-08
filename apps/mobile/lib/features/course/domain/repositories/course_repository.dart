import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../entities/course_detail.dart';
import '../entities/course_outline.dart';

/// A course and the student's own copy of it, joined.
class CourseView {
  const CourseView({
    required this.course,
    required this.outline,
    this.whatsappGroupUrl,
  });

  final CourseDetail course;
  final CourseOutline outline;

  /// «جروب الدفعة».
  ///
  /// ⚠️ Read off `/api/me/path`, which is the only payload here behind an
  /// enrolment. [course] is the shared catalogue detail served to anybody, and
  /// putting a cohort's invite on it would publish the link on the marketing
  /// page.
  final String? whatsappGroupUrl;
}

abstract interface class CourseRepository {
  Future<Either<Failure, CourseView>> load(String slug);

  /// Enrols and returns the lesson to open, or null when the course has no
  /// published lessons.
  Future<Either<Failure, String?>> enroll(String courseId);
}
