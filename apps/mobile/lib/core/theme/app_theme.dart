import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_colors.dart';
import 'app_motion.dart';
import 'app_radius.dart';
import 'app_spacing.dart';
import 'app_text_style.dart';

/// Builds the two [ThemeData]s the app runs on.
///
/// Almost nothing in this file is read directly by a screen: the product's own
/// widgets take their colours from [AppColors] and their type from
/// [AppTextStyle]. What is configured here is the FLOOR — the Material
/// defaults that leak through anyway (a `TextField`'s cursor, a `Scrollbar`,
/// the ripple on a `ListTile`, the text selection handles) — so that a widget
/// nobody styled still lands inside the design instead of showing Material's
/// purple.
abstract final class AppTheme {
  static ThemeData light() => _build(AppColors.light);

  static ThemeData dark() => _build(AppColors.dark);

  /// What the OS status/navigation bars should look like over a page whose
  /// background is `surface1`.
  ///
  /// `statusBarIconBrightness` (Android) and `statusBarBrightness` (iOS) are
  /// INVERTED with respect to each other — Android names the icons, iOS names
  /// the background behind them. Setting only one leaves invisible icons on
  /// the other platform, which is the usual way this gets shipped broken.
  static SystemUiOverlayStyle overlayFor(AppColors c) {
    return SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: c.isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: c.isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: c.surface1,
      systemNavigationBarIconBrightness: c.isDark
          ? Brightness.light
          : Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    );
  }

  static ThemeData _build(AppColors c) {
    final type = AppTextStyle.arabic;
    final isDark = c.isDark;

    final scheme = ColorScheme(
      brightness: c.brightness,
      primary: c.accent,
      onPrimary: c.accentContrast,
      primaryContainer: c.studyTint,
      onPrimaryContainer: c.study,
      secondary: c.stage,
      onSecondary: AppColors.light.surface1,
      secondaryContainer: c.studyTint,
      onSecondaryContainer: c.study,
      error: c.err,
      onError: isDark ? c.surface1 : const Color(0xFFFFFFFF),
      errorContainer: c.err.withValues(alpha: 0.12),
      onErrorContainer: c.err,
      surface: c.surface1,
      onSurface: c.fg,
      surfaceContainerLowest: c.surface1,
      surfaceContainerLow: c.surface2,
      surfaceContainer: c.surface2,
      surfaceContainerHigh: c.surface3,
      surfaceContainerHighest: c.surface4,
      onSurfaceVariant: c.fgMuted,
      outline: c.lineStrong,
      outlineVariant: c.line,
      inverseSurface: c.fg,
      onInverseSurface: c.surface1,
      inversePrimary: c.accentHover,
      scrim: const Color(0x99000000),
      shadow: const Color(0x1F000000),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: c.brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.surface1,
      canvasColor: c.surface1,
      splashFactory: InkSparkle.splashFactory,
      // The web's focus ring is a 2px outline offset by 2px. Material's
      // default focus colour is a translucent fill, which on a warm neutral
      // surface reads as a stain rather than a ring.
      focusColor: c.accent.withValues(alpha: 0.16),
      highlightColor: c.surface4,
      splashColor: c.accent.withValues(alpha: 0.10),
      hoverColor: c.surface3,
      dividerColor: c.line,
      extensions: <ThemeExtension<dynamic>>[c],

      fontFamily: AppTextStyle.sans,
      textTheme: _textTheme(type, c),

      // ── page chrome ────────────────────────────────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: c.surface1,
        surfaceTintColor: Colors.transparent,
        foregroundColor: c.fg,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: type.title4Style(color: c.fg),
        systemOverlayStyle: overlayFor(c),
      ),

      dividerTheme: DividerThemeData(
        color: c.line,
        // The web's `--hairline` is 0.5px on 2dppx displays and every phone
        // this ships to is at least that, so a 1px rule would be twice as
        // heavy as the same rule on the web.
        thickness: 0.5,
        space: 0,
      ),

      // ── surfaces ───────────────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: c.surface2,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.lgAll,
          side: BorderSide(color: c.line, width: 0.5),
        ),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surface2,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: c.surface2,
        elevation: 0,
        modalElevation: 0,
        showDragHandle: true,
        dragHandleColor: c.lineStrong,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: c.surface2,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.lgAll,
          side: BorderSide(color: c.line, width: 0.5),
        ),
        titleTextStyle: type.title3Style(color: c.fg),
        contentTextStyle: type.body(color: c.fgMuted),
      ),

      popupMenuTheme: PopupMenuThemeData(
        color: c.surface2,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.mdAll,
          side: BorderSide(color: c.line, width: 0.5),
        ),
        textStyle: type.bodySm(color: c.fg),
      ),

      // ── inputs ─────────────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.surface2,
        hintStyle: type.body(color: c.fgFaint),
        labelStyle: type.bodySm(color: c.fgMuted),
        floatingLabelStyle: type.bodySm(color: c.accentText),
        errorStyle: type.bodyXs(color: c.err),
        // 12/14 rather than Material's default 12/16: the vertical value has
        // to keep the field on the 44pt tap floor with a 15px body inside it.
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.x12,
          vertical: AppSpacing.x12,
        ),
        border: _fieldBorder(c.line),
        enabledBorder: _fieldBorder(c.line),
        focusedBorder: _fieldBorder(c.accent, width: 2),
        errorBorder: _fieldBorder(c.err),
        focusedErrorBorder: _fieldBorder(c.err, width: 2),
        disabledBorder: _fieldBorder(c.lineSubtle),
      ),

      textSelectionTheme: TextSelectionThemeData(
        cursorColor: c.accentText,
        selectionColor: c.accent.withValues(alpha: 0.28),
        selectionHandleColor: c.accent,
      ),

      // ── controls ───────────────────────────────────────────────────────
      // Buttons are styled per-variant by the app's own widgets; these
      // defaults exist for the Material widgets that slip through (a
      // `SnackBarAction`, a date picker's confirm).
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: c.accent,
          foregroundColor: c.accentContrast,
          disabledBackgroundColor: c.surface4,
          disabledForegroundColor: c.fgFaint,
          minimumSize: const Size(0, AppSpacing.minTap),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x16),
          textStyle: type.body(weight: AppTextStyle.semibold),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.smAll),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.fg,
          side: BorderSide(color: c.lineStrong),
          minimumSize: const Size(0, AppSpacing.minTap),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.x16),
          textStyle: type.body(weight: AppTextStyle.medium),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.smAll),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: c.accentText,
          minimumSize: const Size(0, AppSpacing.minTap),
          textStyle: type.body(weight: AppTextStyle.medium),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.smAll),
        ),
      ),

      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: c.fgMuted,
          minimumSize: const Size(AppSpacing.minTap, AppSpacing.minTap),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
        ),
      ),

      iconTheme: IconThemeData(color: c.fgMuted, size: 20),
      primaryIconTheme: IconThemeData(color: c.accentContrast, size: 20),

      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accent : Colors.transparent,
        ),
        checkColor: WidgetStatePropertyAll(c.accentContrast),
        side: BorderSide(color: c.lineStrong, width: 1.5),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.xsAll),
      ),

      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accent : c.lineStrong,
        ),
      ),

      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accentContrast : c.surface1,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accent : c.surface4,
        ),
        trackOutlineColor: WidgetStatePropertyAll(c.line),
      ),

      sliderTheme: SliderThemeData(
        activeTrackColor: c.accent,
        inactiveTrackColor: c.surface4,
        thumbColor: c.accent,
        overlayColor: c.accent.withValues(alpha: 0.14),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.accent,
        linearTrackColor: c.surface4,
        circularTrackColor: c.surface4,
        linearMinHeight: 6,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: c.surface3,
        selectedColor: c.accent,
        disabledColor: c.surface3,
        labelStyle: type.bodyXs(color: c.fg),
        secondaryLabelStyle: type.bodyXs(color: c.accentContrast),
        side: BorderSide(color: c.line, width: 0.5),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.fullAll),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.x8,
          vertical: AppSpacing.x4,
        ),
      ),

      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: c.fg,
          borderRadius: AppRadius.smAll,
        ),
        textStyle: type.bodyXs(color: c.surface1),
        waitDuration: AppMotion.popover,
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.fg,
        contentTextStyle: type.bodySm(color: c.surface1),
        actionTextColor: c.accent,
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: c.surface1,
        surfaceTintColor: Colors.transparent,
        indicatorColor: c.accent.withValues(alpha: 0.16),
        elevation: 0,
        height: 64,
        labelTextStyle: WidgetStatePropertyAll(
          type.label(color: c.fgMuted, weight: AppTextStyle.medium),
        ),
      ),

      tabBarTheme: TabBarThemeData(
        labelColor: c.fg,
        unselectedLabelColor: c.fgMuted,
        labelStyle: type.bodySm(weight: AppTextStyle.semibold),
        unselectedLabelStyle: type.bodySm(),
        indicatorColor: c.accent,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: c.line,
        dividerHeight: 0.5,
      ),

      listTileTheme: ListTileThemeData(
        iconColor: c.fgMuted,
        textColor: c.fg,
        titleTextStyle: type.body(color: c.fg),
        subtitleTextStyle: type.bodySm(color: c.fgMuted),
        minVerticalPadding: AppSpacing.x12,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
      ),

      scrollbarTheme: ScrollbarThemeData(
        thumbColor: WidgetStatePropertyAll(c.lineStrong),
        thickness: const WidgetStatePropertyAll(4),
        radius: const Radius.circular(AppRadius.full),
      ),

      // The default Android forward/back is a vertical slide that fights the
      // RTL reading direction. `CupertinoPageTransitionsBuilder` mirrors
      // itself under RTL, so a push travels the same way the language does.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }

  static OutlineInputBorder _fieldBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: AppRadius.smAll,
      borderSide: BorderSide(color: color, width: width),
    );
  }

  static TextTheme _textTheme(AppTypeScale t, AppColors c) {
    return TextTheme(
      displayLarge: t.display1Style(color: c.fg),
      displayMedium: t.display2Style(color: c.fg),
      displaySmall: t.title1Style(color: c.fg),
      headlineLarge: t.title1Style(color: c.fg),
      headlineMedium: t.title2Style(color: c.fg),
      headlineSmall: t.title3Style(color: c.fg),
      titleLarge: t.title3Style(color: c.fg),
      titleMedium: t.title4Style(color: c.fg),
      titleSmall: t.body(color: c.fg, weight: AppTextStyle.semibold),
      bodyLarge: t.bodyLg(color: c.fg),
      bodyMedium: t.body(color: c.fg),
      bodySmall: t.bodySm(color: c.fgMuted),
      labelLarge: t.body(color: c.fg, weight: AppTextStyle.medium),
      labelMedium: t.bodySm(color: c.fgMuted),
      labelSmall: t.label(color: c.fgMuted),
    );
  }
}
