import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'library_track_group.dart';

/// A whole year under «باقي الصفوف», with its track cells inside it.
@immutable
class LibraryYearGroup extends Equatable {
  const LibraryYearGroup({
    required this.year,
    required this.labelAr,
    required this.courseCount,
    required this.tracks,
  });

  final int year;

  /// From the taxonomy, and per-system on purpose — see [Taxonomy.yearLabel].
  final String labelAr;

  /// Precomputed rather than summed at render, so the heading and the cells
  /// cannot disagree about how many courses are under it.
  final int courseCount;

  final List<LibraryTrackGroup> tracks;

  @override
  List<Object?> get props => [year, labelAr, courseCount, tracks];
}
