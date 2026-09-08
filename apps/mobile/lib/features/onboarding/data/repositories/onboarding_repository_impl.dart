import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/profile/profile_me.dart';
import '../../../../core/data/taxonomy/taxonomy.dart';
import '../../../../core/data/taxonomy/taxonomy_repository.dart';
import '../../../../core/functions/egyptian_phone.dart';
import '../../domain/entities/onboarding_draft.dart';
import '../../domain/repositories/onboarding_repository.dart';
import '../datasources/onboarding_remote_data_source.dart';

class OnboardingRepositoryImpl implements OnboardingRepository {
  const OnboardingRepositoryImpl({
    required OnboardingRemoteDataSource remote,
    required TaxonomyRepository taxonomy,
  })  : _remote = remote,
        _taxonomy = taxonomy;

  final OnboardingRemoteDataSource _remote;
  final TaxonomyRepository _taxonomy;

  @override
  Future<Taxonomy?> taxonomy() => _taxonomy.load();

  @override
  Future<Either<Failure, StudentProfile>> submit({
    required OnboardingDraft draft,
    required Taxonomy? taxonomy,
  }) async {
    final year = draft.year;
    if (year == null) {
      return Left(const ValidationFailure('لازم نحدد الصف الدراسي'));
    }

    final body = <String, dynamic>{
      'fullName': draft.fullName.trim(),
      'gender': draft.gender,
      // E.164 on the wire. The server re-validates, but sending the local form
      // means every student sees a generic validation error instead of the
      // field they typed being accepted.
      'phone': EgyptianPhone.normalize(draft.phone) ?? draft.phone,
      'governorateCode': draft.governorateCode,
      'schoolName': draft.schoolName.trim(),
      'schoolStream': draft.schoolStream,
      'fatherPhone':
          EgyptianPhone.normalize(draft.fatherPhone) ?? draft.fatherPhone,
      // ⚠️ LAST, so the fixed answers win over anything the form holds.
      ...FixedSection.forYear(taxonomy, year),
    };

    final result = await _remote.submit(body);
    return result.isOk ? Right(result.value) : Left(result.failure!);
  }
}
