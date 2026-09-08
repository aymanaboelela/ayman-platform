import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/localization/copy_keys.dart';
import '../../../../core/presentation/widgets/layout/app_section_header.dart';
import '../../domain/entities/library_year_group.dart';
import 'library_track_cell.dart';

/// A whole year under «باقي الصفوف», with its track cells inside it.
///
/// ⚠️ A SLIVER — see [LibraryTrackCell] for why the whole screen is built out
/// of them rather than a column.
class LibraryYearSection extends StatelessWidget {
  const LibraryYearSection({required this.group, super.key});

  final LibraryYearGroup group;

  @override
  Widget build(BuildContext context) {
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: AppSectionHeader(
            title: group.labelAr,
            count: tr(
              CopyKeys.libraryCourseCount,
              namedArgs: {'n': '${group.courseCount}'},
            ),
          ),
        ),
        for (final track in group.tracks)
          LibraryTrackCell(group: track, alone: group.tracks.length == 1),
      ],
    );
  }
}
