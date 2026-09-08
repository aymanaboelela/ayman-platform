import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// The student's own `student_profiles` row.
///
/// Shared rather than owned by one feature: «الكورسات» needs the year and the
/// track to decide which courses are theirs, «حسابي» prints the whole thing,
/// «بياناتك» edits it, and the dashboard's greeting reads the name. One entity
/// so those four cannot disagree about what a null year means.
///
/// ⚠️ Every field below is nullable, INCLUDING [fullName], which is NOT NULL
/// in the database. A profile that stopped mid-onboarding is a real state, and
/// a screen that throws on it is a screen the student cannot use to finish
/// onboarding. The web's `ProfileMeSchema` is `.optional()` on the same fields
/// for the same reason.
@immutable
class StudentProfile extends Equatable {
  const StudentProfile({
    this.fullName,
    this.phone,
    this.schoolName,
    this.governorateCode,
    this.year,
    this.systemId,
    this.trackId,
    this.schoolStream,
    this.gender,
    this.fatherPhone,
  });

  final String? fullName;
  final String? phone;
  final String? schoolName;
  final String? governorateCode;

  /// 1..3, or null for a profile that never picked one.
  final int? year;

  /// ⚠️ A per-environment uuid7, NOT a slug. It cannot drive a client rule —
  /// resolve it through the taxonomy first.
  final String? systemId;
  final String? trackId;

  /// `general` | `languages`, or null. Null is "never asked", not «عام».
  final String? schoolStream;

  /// `male` | `female`, or null.
  ///
  /// ⚠️ Read for the profile FORM and nowhere else. The platform never
  /// addresses a student by gender — the copy is written to work for both —
  /// so nothing on any screen may branch on this.
  final String? gender;

  final String? fatherPhone;

  @override
  List<Object?> get props => [
    fullName,
    phone,
    schoolName,
    governorateCode,
    year,
    systemId,
    trackId,
    schoolStream,
    gender,
    fatherPhone,
  ];
}

/// `GET /api/profile/me`.
@immutable
class ProfileMe extends Equatable {
  const ProfileMe({
    required this.userId,
    required this.onboardingCompleted,
    this.profile,
  });

  final String userId;

  /// ⚠️ NOT the same as "has a year".
  ///
  /// The wizard's year step is optional, so a student can be fully onboarded
  /// and still hold a null year. The two states send them to DIFFERENT
  /// screens: an unfinished wizard goes back to the wizard, a finished one
  /// with no year goes to «بياناتك» — because the wizard's own guard bounces
  /// that student straight back out again.
  final bool onboardingCompleted;

  /// Null when the row does not exist yet.
  final StudentProfile? profile;

  @override
  List<Object?> get props => [userId, onboardingCompleted, profile];
}
