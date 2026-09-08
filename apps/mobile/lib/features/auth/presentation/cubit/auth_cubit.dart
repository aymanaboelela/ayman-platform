import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/data/profile/profile_repository.dart';
import '../../domain/entities/session_user.dart';
import '../../domain/repositories/auth_repository.dart';

part 'auth_state.dart';

/// The session, app-wide. Exactly one instance, provided above the router.
///
/// Everything that needs to know who is signed in reads THIS — the router's
/// redirect, the drawer's admin link, the chat's "is this me" check. There is
/// no second source of truth and no per-screen session fetch, because two
/// components disagreeing about whether a student is signed in is how a screen
/// ends up rendering an avatar next to a 401.
class AuthCubit extends Cubit<AuthState> {
  AuthCubit(this._repository, this._profile) : super(const AuthUnknown());

  final AuthRepository _repository;
  final ProfileRepository _profile;

  /// Whether the student has finished the wizard.
  ///
  /// ⚠️ NOT on `/api/session` — better-auth knows nothing about a
  /// `student_profiles` row — so it is read once from `/profile/me` alongside
  /// the session and cached here. The router's redirect needs it
  /// SYNCHRONOUSLY: GoRouter's redirect cannot await, and fetching inside it
  /// would make every navigation asynchronous.
  ///
  /// Defaults to TRUE so a failed profile read does not trap a student in the
  /// wizard. The wizard itself refuses to be skipped — the API rejects every
  /// protected call without a profile — so the honest failure is the one the
  /// student can act on, not a redirect loop.
  bool onboardingCompleted = true;

  /// Called once at startup, and again after the app returns from a long
  /// background — the session can be revoked from «أجهزتي» on another device
  /// while this one is asleep.
  Future<void> restore() async {
    final result = await _repository.currentSession();
    // The profile read rides along: the redirect needs the answer before the
    // first frame after a restore, and a second round trip later would show
    // the dashboard and then yank it away.
    if (result.isRight()) await _readOnboarding();
    result.fold(
      // Any failure means "cannot prove a session", and the honest answer is
      // signed out. That includes a NETWORK failure, which is uncomfortable —
      // a student in a tunnel gets a login screen — but the alternative is
      // pretending to be signed in and then failing every request on a screen
      // that shows their name.
      //
      // What makes it acceptable is that the TOKEN is not cleared here: the
      // interceptor only drops it on a real 401. So the next successful
      // `restore()` signs them straight back in with no typing.
      (failure) => emit(AuthSignedOut(reason: failure.code)),
      (user) => emit(AuthSignedIn(user)),
    );
  }

  /// Adopt a session the sign-in or sign-up flow just established.
  ///
  /// ⚠️ Reads the profile FIRST. Emitting the session before the answer is in
  /// lands the student on the dashboard for a frame and then bounces them to
  /// the wizard — and a brand-new account has no profile by definition.
  Future<void> adopt(SessionUser user) async {
    await _readOnboarding();
    emit(AuthSignedIn(user));
  }

  /// Re-reads whether the wizard is finished. Called after it is submitted.
  Future<void> _readOnboarding() async {
    final profile = await _profile.me();
    // A failed read leaves it TRUE — see the field's own note.
    onboardingCompleted = profile?.onboardingCompleted ?? true;
  }

  /// Re-read the session without going through the splash state.
  ///
  /// For after a profile edit, or after an admin changes the student's own
  /// role. Keeps the current state on failure rather than signing them out: a
  /// refresh that fails is a stale name, not a lost session.
  Future<void> refresh() async {
    await _readOnboarding();
    final result = await _repository.currentSession();
    result.fold(
      (_) {
        // Still re-emit: the profile may have changed even when the session
        // read failed, and the router reads `onboardingCompleted` off this
        // cubit rather than off the state object.
        final current = state;
        if (current is AuthSignedIn) emit(AuthSignedIn(current.user));
      },
      (user) => emit(AuthSignedIn(user)),
    );
  }

  Future<void> signOut() async {
    // The push token goes FIRST, while the session that authorises the call
    // still exists. After `signOut()` the bearer token is gone and
    // `/me/push/unsubscribe` would 401 — leaving this device registered
    // against an account it is no longer signed into, so the next person to
    // pick up the phone gets that student's notifications.
    await onBeforeSignOut?.call();
    await _repository.signOut();
    emit(const AuthSignedOut(reason: 'signed_out'));
  }

  /// Run while the session is still valid, just before it is destroyed.
  ///
  /// Wired in the DI container rather than taken as a constructor argument:
  /// `PushService` depends on `ApiClient`, which reports 401s back to THIS
  /// cubit, and a constructor dependency either way round is a cycle.
  Future<void> Function()? onBeforeSignOut;

  /// The interceptor saw a 401 and already cleared the token.
  ///
  /// Called from the DI wiring's `onUnauthorized` hook, which is why it is a
  /// separate entry point from [signOut] — there is no server call to make and
  /// nothing local left to clear.
  void onSessionRevoked() {
    if (state is AuthSignedOut) return;
    emit(const AuthSignedOut(reason: 'session_expired'));
  }

  /// The signed-in student, or null. A convenience for the many widgets that
  /// need the name or the avatar and do not care about the state machine.
  SessionUser? get user => switch (state) {
    AuthSignedIn(:final user) => user,
    _ => null,
  };
}
