import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../services/storage_service/preferences_store.dart';

part 'theme_state.dart';

/// Owns the light/dark choice and writes it through to disk.
///
/// Seeded SYNCHRONOUSLY from [PreferencesStore] in the constructor rather than
/// loaded in an async init: the alternative is one frame of the wrong theme on
/// every cold start, which on a dark-mode phone is a white flash. The store is
/// already warm by then — `main()` awaits it before the app is built.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit(this._store)
    : super(ThemeState(choice: ThemeChoice.fromStorage(_store.themeChoice)));

  final PreferencesStore _store;

  Future<void> select(ThemeChoice choice) async {
    if (choice == state.choice) return;
    emit(state.copyWith(choice: choice));
    await _store.setThemeChoice(choice.storageValue);
  }

  /// What the switch in the topbar does: flip to the OPPOSITE of what is
  /// currently on screen.
  ///
  /// Takes the platform brightness rather than reading it from a context so
  /// that a student on `system` at night lands on `light` — the visible
  /// change they asked for — instead of on `dark`, which would look like the
  /// button did nothing.
  Future<void> toggle(Brightness current) async {
    await select(
      current == Brightness.dark ? ThemeChoice.light : ThemeChoice.dark,
    );
  }
}
