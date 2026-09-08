import 'package:dartz/dartz.dart';

import '../../../../core/data/exception/failure.dart';
import '../../../../core/data/profile/profile_me.dart';
import '../../../../core/data/taxonomy/taxonomy.dart';
import '../entities/onboarding_draft.dart';

abstract interface class OnboardingRepository {
  /// The governorates and the years. ⚠️ NULL when it could not be read — the
  /// wizard then shows «مش قادرين نجيب قايمة المحافظات» with a retry, because
  /// without it there is nothing to choose from.
  Future<Taxonomy?> taxonomy();

  Future<Either<Failure, StudentProfile>> submit({
    required OnboardingDraft draft,
    required Taxonomy? taxonomy,
  });
}
