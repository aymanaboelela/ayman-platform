import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'library_course.dart';

/// One track cell — «لغات», «علمي», «عام» — inside a year.
///
/// [key] is the raw track label, or the empty string for the untracked cell.
/// ⚠️ Untracked is NOT "no group": it means the course serves EVERY track in
/// its year, which is how year 1 works and how a shared year-2 course works.
/// Those render under «عام».
@immutable
class LibraryTrackGroup extends Equatable {
  const LibraryTrackGroup({
    required this.key,
    required this.labelAr,
    required this.courses,
  });

  /// Stable across rebuilds: the track label, or `''`.
  final String key;

  /// What the cell is titled — [key], or «عام» for the untracked one.
  final String labelAr;

  final List<LibraryCourse> courses;

  /// Whether the heading is worth drawing.
  ///
  /// «عام» over a single grid, with nothing to contrast it against, is a line
  /// of chrome and no information. A NAMED track always keeps its heading, even
  /// alone — «لغات» tells the student something «عام» does not.
  bool isBare({required bool alone}) => alone && key.isEmpty;

  @override
  List<Object?> get props => [key, labelAr, courses];
}
