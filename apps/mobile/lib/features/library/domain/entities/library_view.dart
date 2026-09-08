import 'package:equatable/equatable.dart';
import 'package:meta/meta.dart';

import 'library_identity.dart';
import 'library_track_group.dart';
import 'library_year_group.dart';

/// «الكورسات», assembled: the public catalogue joined to what THIS student has
/// done with it, then cut into the groups the screen renders.
///
/// See [LibraryBuilder] for the rule and for why the join happens on the
/// client rather than behind a fifth endpoint.
@immutable
class LibraryView extends Equatable {
  const LibraryView({
    required this.identity,
    required this.yours,
    required this.rest,
    required this.totalCourses,
    required this.onboardingCompleted,
  });

  /// Null until onboarding has set a year, or when the taxonomy could not be
  /// read. The identity strip prompts instead of showing a cut it cannot name.
  final LibraryIdentity? identity;

  /// Null when there is no identity to filter by — which is a DIFFERENT state
  /// from an empty list. Null hides the «كورساتك» section entirely; empty
  /// shows it with «لسه مفيش كورسات منشورة لصفّك», which is only true once we
  /// know what their year is.
  final List<LibraryTrackGroup>? yours;

  /// The remaining years, ascending. A student browsing outside their own year
  /// is looking for what comes before or after it, and ascending is the only
  /// order in which "before" and "after" mean anything.
  final List<LibraryYearGroup> rest;

  final int totalCourses;

  /// ⚠️ NOT derivable from [identity] being null, and the difference decides
  /// where the prompt's button goes.
  ///
  /// The wizard's year step is optional, so a student can be fully onboarded
  /// and still have no year — and the wizard's own guard bounces that student
  /// straight back out. They need the profile editor; someone who never
  /// finished the wizard needs the wizard.
  final bool onboardingCompleted;

  /// Courses under «كورساتك». Summed here rather than carried, because the
  /// grouping is by track and the heading counts courses.
  int get yoursCount =>
      yours?.fold<int>(0, (sum, track) => sum + track.courses.length) ?? 0;

  @override
  List<Object?> get props => [
    identity,
    yours,
    rest,
    totalCourses,
    onboardingCompleted,
  ];
}
