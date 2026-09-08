import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// One governorate, for the address step of onboarding and the profile.
@immutable
class Governorate extends Equatable {
  const Governorate({
    required this.code,
    required this.nameAr,
    required this.slug,
    required this.region,
    required this.sortOrder,
  });

  /// Two characters. The STABLE identifier — the name is display only.
  final String code;
  final String nameAr;
  final String slug;

  /// `urban` | `lower` | `upper` | `frontier`.
  final String region;

  final int sortOrder;

  @override
  List<Object?> get props => [code, nameAr, slug, region, sortOrder];
}

/// A year inside a system, with the name that system gives it.
///
/// ⚠️ The label is PER SYSTEM and the two systems disagree on purpose:
/// البكالوريا's year 2 is «الصف الثاني بكالوريا», الثانوية العامة's is «الصف
/// الثاني الثانوي». Anything that resolves a year to a label without naming a
/// system is picking one of two right answers at random.
@immutable
class AcademicYear extends Equatable {
  const AcademicYear({
    required this.year,
    required this.labelAr,
    required this.badgeAr,
  });

  final int year;
  final String labelAr;

  /// The short form, for a chip: «أولى بكالوريا».
  final String badgeAr;

  @override
  List<Object?> get props => [year, labelAr, badgeAr];
}

/// A track — «هندسة وعلوم حاسب», «علمي», «أدبي».
@immutable
class Track extends Equatable {
  const Track({
    required this.id,
    required this.slug,
    required this.labelAr,
    required this.minYear,
  });

  /// A per-environment uuid7. Never name it in code — match on [slug].
  final String id;
  final String slug;
  final String labelAr;

  /// Tracks are chosen at the START of year 2, so year 1 has none.
  final int minYear;

  @override
  List<Object?> get props => [id, slug, labelAr, minYear];
}

/// An education system: البكالوريا, الثانوية العامة.
@immutable
class EducationSystem extends Equatable {
  const EducationSystem({
    required this.id,
    required this.slug,
    required this.nameAr,
    required this.years,
    required this.tracks,
  });

  final String id;

  /// `bacalorya` | `thanaweya_amma`. The stable name.
  final String slug;
  final String nameAr;
  final List<AcademicYear> years;
  final List<Track> tracks;

  @override
  List<Object?> get props => [id, slug, nameAr, years, tracks];
}

/// The platform's reference data: systems, years, tracks, governorates.
///
/// Read by onboarding, «صفّي ومساري», the library and the admin panel — always
/// through [TaxonomyRepository], never with a bare request, because it is the
/// one endpoint every screen wants and the API throttles it per identity.
@immutable
class Taxonomy extends Equatable {
  const Taxonomy({
    required this.governorates,
    required this.pinnedGovernorateCodes,
    required this.systems,
  });

  final List<Governorate> governorates;

  /// Codes pinned to the top of the picker; the rest follow in code order.
  final List<String> pinnedGovernorateCodes;

  final List<EducationSystem> systems;

  /// The system this platform actually teaches.
  ///
  /// Mirrors the web's `FIXED_SYSTEM_SLUG`. Onboarding writes it onto every
  /// profile, so asking for a label "in the student's system" and asking for a
  /// label "in this one" is the same question for every account created since.
  static const fixedSystemSlug = 'bacalorya';

  /// The Arabic name of a year, preferring [fixedSystemSlug].
  ///
  /// ⚠️ NOT "the first system with that year". `sortOrder` decides which
  /// system comes first, and it is a column an admin can reorder from the
  /// taxonomy screen — with the two systems now labelling years differently,
  /// that would rename a student's year across the whole app as a side effect
  /// of a drag in an unrelated table.
  ///
  /// The scan survives as a fallback for a database missing that system, and
  /// the last resort is a composed string: a year the taxonomy cannot describe
  /// is a data problem, and the heading still has to be readable.
  String yearLabel(int year) {
    final preferred = systems.where((s) => s.slug == fixedSystemSlug);
    for (final system in [...preferred, ...systems]) {
      for (final candidate in system.years) {
        if (candidate.year == year) return candidate.labelAr;
      }
    }
    return 'الصف $year';
  }

  /// The Arabic label of a track id, or null.
  ///
  /// Searches EVERY system rather than the student's own: `systemId` and
  /// `trackId` are independently nullable on a profile and a track id is
  /// globally unique, so scoping the search to a system that happens to be
  /// null would drop a label the student can see on their own profile.
  String? trackLabel(String? trackId) {
    if (trackId == null || trackId.isEmpty) return null;
    for (final system in systems) {
      for (final track in system.tracks) {
        if (track.id == trackId) return track.labelAr;
      }
    }
    return null;
  }

  @override
  List<Object?> get props => [governorates, pinnedGovernorateCodes, systems];
}
