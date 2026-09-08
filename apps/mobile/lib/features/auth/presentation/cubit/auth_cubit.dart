import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

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
  AuthCubit(this._repository) : super(const AuthUnknown());

  final AuthRepository _repository;

  /// Called once at startup, and again after the app returns from a long
  /// background — the session can be revoked from «أجهزتي» on another device
  /// while this one is asleep.
  Future<void> restore() async {
    final result = await _repository.currentSession();
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
  void adopt(SessionUser user) => emit(AuthSignedIn(user));

  /// Re-read the session without going through the splash state.
  ///
  /// For after a profile edit, or after an admin changes the student's own
  /// role. Keeps the current state on failure rather than signing them out: a
  /// refresh that fails is a stale name, not a lost session.
  Future<void> refresh() async {
    final result = await _repository.currentSession();
    result.fold((_) {}, (user) => emit(AuthSignedIn(user)));
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
