import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_text_style.dart';
import '../../../theme/cubit/theme_cubit.dart';

/// «تبديل المظهر» — the light/dark switch, in the drawer footer.
///
/// It lives here rather than in the app bar for the same reason the web puts it
/// in its mobile sheet: at 360px the bar already carries the menu, the brand,
/// the bell and the avatar, and a fifth control is what pushed the wordmark on
/// top of the switch on the web.
///
/// Tapping it does NOT close the drawer. The student is comparing two
/// appearances; closing the sheet after each tap makes that impossible.
class DrawerThemeRow extends StatelessWidget {
  const DrawerThemeRow({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return BlocBuilder<ThemeCubit, ThemeState>(
      builder: (context, state) {
        // What is ON SCREEN, which is not the same as what was CHOSEN: on
        // `system` the switch has to reflect the phone, or it shows "off"
        // while the app is visibly dark.
        final isDark = c.isDark;

        return SwitchListTile.adaptive(
          value: isDark,
          onChanged: (_) => context.read<ThemeCubit>().toggle(c.brightness),
          title: Text(
            tr(CopyKeys.themeToggle),
            style: type.bodySm(color: c.fgMuted),
          ),
          secondary: Icon(
            isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
            size: 20,
            color: c.fgMuted,
          ),
          activeThumbColor: c.accentContrast,
          activeTrackColor: c.accent,
        );
      },
    );
  }
}
