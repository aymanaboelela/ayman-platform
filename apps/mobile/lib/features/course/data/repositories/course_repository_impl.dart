import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/path/path_repository.dart';
import '../../domain/course_outline_builder.dart';
import '../../domain/repositories/course_repository.dart';
import '../datasources/course_remote_data_source.dart';

class CourseRepositoryImpl implements CourseRepository {
  const CourseRepositoryImpl({
    required CourseRemoteDataSource remote,
    required PathRepository path,
  })  : _remote = remote,
        _path = path;

  final CourseRemoteDataSource _remote;
  final PathRepository _path;

  @override
  Future<Either<Failure, CourseView>> load(String slug) async {
    // Parallel: the catalogue half is cached and shared with the marketing
    // site, the path half is authed and per-request. Neither waits on the
    // other.
    final (detail, path) = await (_remote.detail(slug), _path.load()).wait;

    // The catalogue is the only one that can take the page down — without it
    // there is no course to show.
    if (!detail.isOk) return Left(detail.failure!);

    // A failed path read renders the course as NOT ENROLLED, which is wrong
    // for an enrolled student and recoverable with a pull-to-refresh. The
    // alternative is an error screen over an outline we successfully fetched.
    final enrolment =
        path.isOk ? path.value.courseById(detail.value.id) : null;

    return Right(
      CourseView(
        course: detail.value,
        outline: CourseOutlineBuilder.build(
          course: detail.value,
          path: enrolment,
        ),
        whatsappGroupUrl: enrolment?.whatsappGroupUrl,
      ),
    );
  }

  @override
  Future<Either<Failure, String?>> enroll(String courseId) async {
    final result = await _remote.enroll(courseId);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }
}
