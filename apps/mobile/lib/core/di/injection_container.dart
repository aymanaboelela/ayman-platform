import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/auth/data/datasources/auth_remote_data_source.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/chat/data/datasources/chat_remote_data_source.dart';
import '../../features/chat/data/repositories/chat_repository_impl.dart';
import '../../features/chat/domain/repositories/chat_repository.dart';
import '../../features/dashboard/data/datasources/dashboard_remote_data_source.dart';
import '../../features/dashboard/data/repositories/dashboard_repository_impl.dart';
import '../../features/dashboard/domain/repositories/dashboard_repository.dart';
import '../../features/course/data/datasources/course_remote_data_source.dart';
import '../../features/course/data/repositories/course_repository_impl.dart';
import '../../features/course/domain/repositories/course_repository.dart';
import '../../features/library/data/datasources/library_remote_data_source.dart';
import '../../features/payments/data/datasources/payments_remote_data_source.dart';
import '../../features/player/data/datasources/player_remote_data_source.dart';
import '../../features/quiz/data/datasources/quiz_remote_data_source.dart';
import '../../features/quiz/data/repositories/quiz_repository_impl.dart';
import '../../features/quiz/domain/repositories/quiz_repository.dart';
import '../../features/player/data/repositories/player_repository_impl.dart';
import '../../features/player/domain/repositories/player_repository.dart';
import '../../features/payments/data/repositories/payments_repository_impl.dart';
import '../../features/payments/domain/repositories/payments_repository.dart';
import '../../features/library/data/repositories/library_repository_impl.dart';
import '../../features/library/domain/repositories/library_repository.dart';
import '../../features/notifications/data/datasources/notifications_remote_data_source.dart';
import '../../features/notifications/data/repositories/notifications_repository_impl.dart';
import '../../features/notifications/domain/repositories/notifications_repository.dart';
import '../../features/notifications/presentation/cubit/unread_badge_cubit.dart';
import '../data/network/api_client.dart';
import '../data/path/path_repository.dart';
import '../data/settings/settings_repository.dart';
import '../data/taxonomy/taxonomy_repository.dart';
import '../services/media/gated_file_service.dart';
import '../services/notification_service/push_service.dart';
import '../services/social_auth/social_auth_service.dart';
import '../services/storage_service/preferences_store.dart';
import '../services/storage_service/secure_store.dart';
import '../theme/cubit/theme_cubit.dart';

final sl = GetIt.instance;

/// Wires the app together, once, before the first frame.
///
/// Registration order is dependency order, not alphabetical, and the comments
/// say which registrations are SINGLETONS on purpose — the distinction is not
/// cosmetic here. [ApiClient] holds the interceptor chain and [AuthCubit] holds
/// the session; a second instance of either means two components disagreeing
/// about who is signed in.
Future<void> initInjection() async {
  // ── storage ────────────────────────────────────────────────────────────
  //
  // Awaited rather than registered lazily. `PreferencesStore` has to be warm
  // before `ThemeCubit` reads it in its constructor, and that has to happen
  // before the first frame — otherwise a dark-mode phone shows one white frame
  // on every cold start.
  final preferences = await PreferencesStore.load();
  sl.registerSingleton<SharedPreferences>(await SharedPreferences.getInstance());
  sl.registerSingleton<PreferencesStore>(preferences);
  sl.registerSingleton<SecureStore>(SecureStore.create());

  // ── services ───────────────────────────────────────────────────────────
  sl.registerLazySingleton<SocialAuthService>(SocialAuthService.new);

  // ── the session cubit, registered BEFORE the client that reports to it ──
  //
  // Circular by nature: the HTTP client must tell the session cubit when a 401
  // arrives, and the session cubit makes HTTP calls. It is broken with a
  // CALLBACK rather than a reference — `onUnauthorized` resolves `AuthCubit`
  // out of the locator at call time, by which point both exist. Passing the
  // cubit in directly would need it constructed before the repository it
  // depends on.
  sl.registerLazySingleton<ApiClient>(
    () => ApiClient.create(
      store: sl<SecureStore>(),
      onUnauthorized: () async {
        // The interceptor has already cleared the token. All that is left is
        // to tell the app, so the router can move.
        if (sl.isRegistered<AuthCubit>()) {
          sl<AuthCubit>().onSessionRevoked();
        }
      },
    ),
  );

  // ── auth ───────────────────────────────────────────────────────────────
  sl.registerLazySingleton<AuthRemoteDataSource>(
    () => AuthRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<AuthRepository>(
    () => AuthRepositoryImpl(
      remote: sl<AuthRemoteDataSource>(),
      secureStore: sl<SecureStore>(),
      preferences: sl<PreferencesStore>(),
      socialAuth: sl<SocialAuthService>(),
    ),
  );

  // ── dashboard ──────────────────────────────────────────────────────────
  sl.registerLazySingleton<DashboardRemoteDataSource>(
    () => DashboardRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<DashboardRepository>(
    () => DashboardRepositoryImpl(sl<DashboardRemoteDataSource>()),
  );

  // ── the learning path ──────────────────────────────────────────────────
  //
  // Deliberately NOT cached — see the class note. Shared so «الكورسات», the
  // course page and «رحلتي» parse it once and agree on what it means.
  sl.registerLazySingleton<PathRepository>(
    () => PathRepository(sl<ApiClient>()),
  );

  // ── taxonomy ───────────────────────────────────────────────────────────
  //
  // A LAZY SINGLETON, and that is the whole point: it holds the cached
  // reference data, so four screens asking for it on a cold start make one
  // request. Registering it per-feature would give each a private cache and
  // undo the caching entirely.
  sl.registerLazySingleton<TaxonomyRepository>(
    () => TaxonomyRepository(sl<ApiClient>()),
  );

  // ── public settings ────────────────────────────────────────────────────
  //
  // Cached like the taxonomy: the InstaPay number and the social links are
  // reference data an admin edits occasionally, and every surface that wants
  // one would otherwise fetch the payload again.
  sl.registerLazySingleton<SettingsRepository>(
    () => SettingsRepository(sl<ApiClient>()),
  );

  // ── payments ───────────────────────────────────────────────────────────
  sl.registerLazySingleton<PaymentsRemoteDataSource>(
    () => PaymentsRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<PaymentsRepository>(
    () => PaymentsRepositoryImpl(sl<PaymentsRemoteDataSource>()),
  );

  // ── library ────────────────────────────────────────────────────────────
  sl.registerLazySingleton<LibraryRemoteDataSource>(
    () => LibraryRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<LibraryRepository>(
    () => LibraryRepositoryImpl(
      remote: sl<LibraryRemoteDataSource>(),
      path: sl<PathRepository>(),
      taxonomy: sl<TaxonomyRepository>(),
    ),
  );

  // ── one course ─────────────────────────────────────────────────────────
  sl.registerLazySingleton<CourseRemoteDataSource>(
    () => CourseRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<CourseRepository>(
    () => CourseRepositoryImpl(
      remote: sl<CourseRemoteDataSource>(),
      path: sl<PathRepository>(),
    ),
  );

  // ── the lesson player ──────────────────────────────────────────────────
  sl.registerLazySingleton<PlayerRemoteDataSource>(
    () => PlayerRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<PlayerRepository>(
    () => PlayerRepositoryImpl(sl<PlayerRemoteDataSource>()),
  );

  // Downloads a lesson's slides WITH the session — see the class note for why
  // a plain link to the same path 401s.
  sl.registerLazySingleton<GatedFileService>(
    () => GatedFileService(sl<ApiClient>()),
  );

  // ── quizzes and exams ──────────────────────────────────────────────────
  sl.registerLazySingleton<QuizRemoteDataSource>(
    () => QuizRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<QuizRepository>(
    () => QuizRepositoryImpl(sl<QuizRemoteDataSource>()),
  );

  // ── chat ───────────────────────────────────────────────────────────────
  //
  // ⚠️ The RECORDER and the PICKER are deliberately NOT registered here.
  // Both hold platform resources — a microphone session, a picker channel —
  // and one instance shared across the app keeps the microphone indicator lit
  // after the chat screen is gone. `ChatPage` builds its own and disposes them
  // with the route.
  sl.registerLazySingleton<ChatRemoteDataSource>(
    () => ChatRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<ChatRepository>(
    () => ChatRepositoryImpl(sl<ChatRemoteDataSource>()),
  );

  // ── push ───────────────────────────────────────────────────────────────
  sl.registerLazySingleton<PushService>(
    () => PushService(
      client: sl<ApiClient>(),
      secureStore: sl<SecureStore>(),
      preferences: sl<PreferencesStore>(),
    ),
  );

  // ── notifications ──────────────────────────────────────────────────────
  sl.registerLazySingleton<NotificationsRemoteDataSource>(
    () => NotificationsRemoteDataSource(sl<ApiClient>()),
  );
  sl.registerLazySingleton<NotificationsRepository>(
    () => NotificationsRepositoryImpl(sl<NotificationsRemoteDataSource>()),
  );

  // Singletons, all three: exactly one session, one theme and one unread
  // count for the whole app. The badge is a singleton specifically because
  // the bell renders on every screen — a per-screen instance would restart
  // its timer on every navigation.
  sl.registerSingleton<AuthCubit>(
    AuthCubit(sl<AuthRepository>())
      // Closes the cycle described on the field itself: the cubit cannot take
      // `PushService` in its constructor, because that service talks through
      // the client that reports 401s back to the cubit.
      ..onBeforeSignOut = () => sl<PushService>().unregister(),
  );
  sl.registerSingleton<ThemeCubit>(ThemeCubit(sl<PreferencesStore>()));
  sl.registerSingleton<UnreadBadgeCubit>(
    UnreadBadgeCubit(sl<NotificationsRepository>()),
  );
}

/// Drops every registration. Tests only.
///
/// `GetIt.reset()` also disposes what it holds, which closes the cubits'
/// streams — necessary between tests, and a bug if it ever ran in the app.
Future<void> resetInjection() => sl.reset();
