import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import '../../../../core/data/taxonomy/taxonomy.dart';

/// What the wizard has collected so far.
///
/// ⚠️ Every field is nullable and stays nullable until the student answers it.
/// A default here would be an answer the app invented on their behalf — and
/// `gender` and `schoolStream` are exactly the two fields where that is worst,
/// because a wrong guess changes which courses they are shown.
@immutable
class OnboardingDraft extends Equatable {
  const OnboardingDraft({
    this.fullName = '',
    this.gender,
    this.phone = '',
    this.governorateCode,
    this.schoolName = '',
    this.schoolStream,
    this.year,
    this.fatherPhone = '',
  });

  final String fullName;

  /// `male` | `female`. Asked ONCE, here, and read by nothing else in the app
  /// — no screen addresses a student by it.
  final String? gender;

  final String phone;
  final String? governorateCode;
  final String schoolName;

  /// `general` | `languages`.
  final String? schoolStream;

  final int? year;
  final String fatherPhone;

  OnboardingDraft copyWith({
    String? fullName,
    String? gender,
    String? phone,
    String? governorateCode,
    String? schoolName,
    String? schoolStream,
    int? year,
    String? fatherPhone,
  }) {
    return OnboardingDraft(
      fullName: fullName ?? this.fullName,
      gender: gender ?? this.gender,
      phone: phone ?? this.phone,
      governorateCode: governorateCode ?? this.governorateCode,
      schoolName: schoolName ?? this.schoolName,
      schoolStream: schoolStream ?? this.schoolStream,
      year: year ?? this.year,
      fatherPhone: fatherPhone ?? this.fatherPhone,
    );
  }

  @override
  List<Object?> get props => [
    fullName,
    gender,
    phone,
    governorateCode,
    schoolName,
    schoolStream,
    year,
    fatherPhone,
  ];
}

/// The three answers the platform stopped asking for.
///
/// ## Why they are constants and not questions
///
/// The wizard used to walk a student through النظام → الصف → المسار → المادة,
/// four dependent dropdowns. Every one of them had exactly one right answer:
/// this is a البكالوريا platform, it teaches مسار الهندسة وعلوم الحاسب, and
/// the subject is البرمجة. A dropdown with one correct option is not a
/// question — it is a way to get the answer wrong.
///
/// ⚠️ Resolved from the TAXONOMY by slug, never hardcoded as ids: `Track.id`
/// and the elective's id are per-environment uuid7s.
abstract final class FixedSection {
  static const systemSlug = 'bacalorya';
  static const trackSlug = 'engineering_cs';
  static const electiveSubjectSlug = 'programming_cs';

  /// The highest year on offer — how far the content actually goes.
  ///
  /// Deliberately NOT the schema's `max(3)`, which describes the education
  /// system. البكالوريا has a third year and one day this will too, at which
  /// point this is the one line that changes.
  static const highestOfferedYear = 2;

  /// Tracks are chosen at the start of year 2 — year 1 is common.
  static const firstTrackedYear = 2;

  /// The years a student may pick.
  static List<AcademicYear> offeredYears(Taxonomy taxonomy) {
    for (final system in taxonomy.systems) {
      if (system.slug != systemSlug) continue;
      return system.years
          .where((year) => year.year <= highestOfferedYear)
          .toList();
    }
    return const [];
  }

  /// The fields the wizard fills in on the student's behalf.
  ///
  /// ⚠️ Spread AFTER the form values on submit, so they always win. A taxonomy
  /// missing either id degrades to the base rather than throwing — a student
  /// must not be blocked from finishing because a reference row is absent.
  ///
  /// ⚠️ `electiveSubjectId` is deliberately NOT sent. It is optional in the
  /// schema and the rule that once demanded one for بكالوريا year 2 was
  /// removed; sending it would mean mapping the elective groups purely to
  /// re-derive a value the server does not require. If that rule ever returns,
  /// this is the method that grows — and `TaxonomyMapper` grows with it.
  static Map<String, dynamic> forYear(Taxonomy? taxonomy, int year) {
    final base = <String, dynamic>{'system': systemSlug, 'year': year};
    if (taxonomy == null || year < firstTrackedYear) return base;

    for (final system in taxonomy.systems) {
      if (system.slug != systemSlug) continue;
      for (final track in system.tracks) {
        if (track.slug != trackSlug) continue;
        return {...base, 'trackId': track.id};
      }
    }
    return base;
  }
}
