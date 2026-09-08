// ⚠️ `hide TextDirection`. easy_localization re-exports `intl`, whose
// `TextDirection` is a CLASS with `LTR`/`RTL` constants — a completely
// different type from `dart:ui`'s enum that `Directionality` takes. Without
// the hide, `TextDirection.rtl` fails to resolve and the error names the
// getter rather than the import, which sends you looking in the wrong file.
import 'package:easy_localization/easy_localization.dart' hide TextDirection;
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../../features/notifications/presentation/cubit/unread_badge_cubit.dart';
import '../../di/injection_container.dart';
import '../../services/notification_service/push_service.dart';
import '../../theme/app_colors.dart';
import '../../router/app_router.dart';
import '../../theme/app_theme.dart';
import '../../theme/cubit/theme_cubit.dart';

/// The root widget.
///
/// Everything global is provided HERE and nowhere else: the session, the theme,
/// the router. A feature that needs one reads it from the tree; a feature that
/// creates its own has created a second source of truth.
class AymanApp extends StatefulWidget {
  const AymanApp({super.key});

  @override
  State<AymanApp> createState() => _AymanAppState();
}

class _AymanAppState extends State<AymanApp> {
  late final AppRouter _router;
  late final StreamSubscription<AuthState> _authSub;

  @override
  void initState() {
    super.initState();
    // Built once and kept. A GoRouter rebuilt inside `build` loses the whole
    // navigation stack on every theme change — the classic way a Flutter app
    // throws the student back to the dashboard when they toggle dark mode.
    _router = AppRouter(sl<AuthCubit>());
    // Deliberately NOT awaited and NOT in the build: the splash route holds
    // `AuthUnknown` until this answers, and the router moves when it does.
    sl<AuthCubit>().restore();

    // The badge starts polling only once there is a session to poll for.
    // Starting it here unconditionally would fire a 401 every sixty seconds
    // at a signed-out student sitting on the login screen.
    _authSub = sl<AuthCubit>().stream.listen((state) {
      if (state is AuthSignedIn) {
        sl<UnreadBadgeCubit>().start();
        // ⚠️ AFTER sign-in, never on first launch.
        //
        // iOS lets an app ask for notification permission exactly ONCE — a
        // second request after a refusal returns instantly with no prompt —
        // and a prompt fired at a student who has not yet seen a single
        // lesson is refused far more often than one fired at a student with
        // an account. Signing in is the earliest honest moment.
        unawaited(sl<PushService>().registerIfPermitted());
      } else {
        sl<UnreadBadgeCubit>().stop();
      }
    });
  }

  @override
  void dispose() {
    _authSub.cancel();
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: sl<AuthCubit>()),
        BlocProvider<ThemeCubit>.value(value: sl<ThemeCubit>()),
        BlocProvider<UnreadBadgeCubit>.value(value: sl<UnreadBadgeCubit>()),
      ],
      child: BlocBuilder<ThemeCubit, ThemeState>(
        builder: (context, themeState) {
          return ScreenUtilInit(
            // A 390×844 reference — an iPhone 14 / a mid-range Android. Used
            // ONLY for the handful of things that genuinely scale with the
            // viewport (a hero's height, the player's aspect box). Padding,
            // type and radii are fixed logical pixels on purpose: scaling them
            // makes a 320dp phone and a 430dp phone render two different
            // designs, and the web does not do that.
            designSize: const Size(390, 844),
            minTextAdapt: false,
            splitScreenMode: true,
            builder: (context, _) => MaterialApp.router(
              debugShowCheckedModeBanner: false,
              routerConfig: _router.config,

              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: themeState.mode,

              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,

              // The whole app is RTL, and it is forced rather than derived.
              //
              // `Directionality` normally follows the locale, which would be
              // correct — except that the app deliberately never leaves Arabic
              // (see AppLocales.enabled), and a widget test that pumps a
              // screen without EasyLocalization above it would otherwise get
              // LTR and pass while the real app renders mirrored.
              builder: (context, child) {
                final media = MediaQuery.of(context);
                return Directionality(
                  textDirection: TextDirection.rtl,
                  child: MediaQuery(
                    // The OS font-size slider is honoured, but CLAMPED.
                    //
                    // Android's accessibility settings go to 2.0×, and at that
                    // scale the quiz runner's countdown, question and answer
                    // grid stop fitting on any phone — the timer ends up off
                    // screen during a timed exam, which is the worst possible
                    // place to discover it. 1.3 is enough for the students who
                    // need it and still fits every layout.
                    data: media.copyWith(
                      textScaler: media.textScaler.clamp(
                        minScaleFactor: 0.9,
                        maxScaleFactor: 1.3,
                      ),
                    ),
                    child: AnnotatedRegion<SystemUiOverlayStyle>(
                      value: AppTheme.overlayFor(
                        Theme.of(context).extension<AppColors>() ?? AppColors.light,
                      ),
                      child: child ?? const SizedBox.shrink(),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
