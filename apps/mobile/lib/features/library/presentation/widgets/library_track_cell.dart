import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_sliver_gap.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../domain/entities/library_track_group.dart';
import 'library_course_card.dart';
import 'library_track_head.dart';

/// One track cell — «لغات», «علمي», «عام» — as a labelled run of cards.
///
/// ⚠️ This builds a SLIVER and belongs in a `slivers:` list. Dropped into a
/// [Column] it throws.
///
/// ## Why a sliver and not a Column of cards
///
/// The untracked cell on the dev database holds **550 courses**, and it is one
/// cell — a catalogue that keeps growing is the normal case, not a fixture
/// artefact. A `Column` inside a `ListView(children:)` builds every child
/// eagerly, so that cell would construct 550 cards, each with its own
/// [CustomPainter] generating artwork, before the first frame. `SliverList`
/// builds the handful on screen.
///
/// [SliverMainAxisGroup] is what lets the heading and the lazy run stay ONE
/// widget: a widget can only return one sliver, and the alternative — the page
/// flattening every group into a list of untyped rows — puts the grouping rule
/// back in the page it was extracted from.
class LibraryTrackCell extends StatelessWidget {
  const LibraryTrackCell({
    required this.group,
    required this.alone,
    super.key,
  });

  final LibraryTrackGroup group;

  /// Whether this is the only cell in its section. Drops the heading for the
  /// UNTRACKED cell only — «عام» above a single run, with nothing to contrast
  /// it against, is a line of chrome and no information. A named track keeps
  /// its heading even alone, because «لغات» says something «عام» does not.
  final bool alone;

  @override
  Widget build(BuildContext context) {
    return SliverMainAxisGroup(
      slivers: [
        if (!group.isBare(alone: alone))
          SliverToBoxAdapter(
            child: LibraryTrackHead(
              label: group.labelAr,
              count: tr(
                CopyKeys.libraryCourseCount,
                namedArgs: {'n': '${group.courses.length}'},
              ),
            ),
          ),

        // One column, not a grid. The web goes 2-up from 640px and no phone
        // this ships to is that wide in portrait; a 2-up grid at 360px gives
        // each card 164px, which is narrower than the button inside it.
        SliverList.separated(
          itemCount: group.courses.length,
          itemBuilder: (context, index) =>
              LibraryCourseCard(course: group.courses[index]),
          separatorBuilder: (context, index) =>
              const SizedBox(height: AppSpacing.stackGap),
        ),
        const AppSliverGap.stack(),
      ],
    );
  }
}
