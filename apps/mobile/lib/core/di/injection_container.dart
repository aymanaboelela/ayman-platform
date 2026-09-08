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
import '../data/network/api_client.dart';
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

  // Singletons, both: exactly one session and one theme for the whole app.
  sl.registerSingleton<AuthCubit>(AuthCubit(sl<AuthRepository>()));
  sl.registerSingleton<ThemeCubit>(ThemeCubit(sl<PreferencesStore>()));
}

/// Drops every registration. Tests only.
///
/// `GetIt.reset()` also disposes what it holds, which closes the cubits'
/// streams — necessary between tests, and a bug if it ever ran in the app.
Future<void> resetInjection() => sl.reset();
