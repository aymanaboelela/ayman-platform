import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

/// Who the student is, in LABELS rather than in ids.
///
/// This is the cut the library applies, made visible. Without it the filtering
/// is invisible: a student looking at four courses under «كورساتك» cannot tell
/// whether that is everything published or everything published FOR THEM.
///
/// Built by [LibraryBuilder.identityOf] from the profile plus the taxonomy,
/// and null when either the year or the taxonomy is missing — see that method
/// for why a missing taxonomy lands on the same branch as a missing year.
@immutable
class LibraryIdentity extends Equatable {
  const LibraryIdentity({
    required this.year,
    required this.yearLabelAr,
    required this.trackLabelAr,
    required this.schoolStream,
    required this.schoolStreamLabelAr,
  });

  final int year;
  final String yearLabelAr;

  /// Null for year 1, which has no track at all — tracks are chosen at the
  /// start of year 2.
  final String? trackLabelAr;

  /// `general` | `languages`, or null for a profile onboarded before the
  /// question existed.
  ///
  /// ⚠️ Null means "do not filter by stream", never «عام». A student who was
  /// never asked must not silently lose the لغات courses they have been
  /// looking at for weeks, on the strength of a question nobody put to them.
  ///
  /// The RAW value drives the filter and the label draws the strip; both are
  /// carried so no rule is ever expressed as a comparison between two Arabic
  /// strings.
  final String? schoolStream;
  final String? schoolStreamLabelAr;

  @override
  List<Object?> get props => [
    year,
    yearLabelAr,
    trackLabelAr,
    schoolStream,
    schoolStreamLabelAr,
  ];
}
