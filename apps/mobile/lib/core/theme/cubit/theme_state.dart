part of 'theme_cubit.dart';

/// What the student picked, which is not the same thing as what is on screen.
///
/// [system] is a real third choice, not "no choice": a student who has never
/// touched the switch follows the phone, and one who explicitly picked light
/// stays light even at night. The web stores exactly these three values under
/// `data-theme` (absent = system), so the two apps agree.
enum ThemeChoice {
  system,
  light,
  dark;

  static ThemeChoice fromStorage(String? raw) => switch (raw) {
    'light' => ThemeChoice.light,
    'dark' => ThemeChoice.dark,
    _ => ThemeChoice.system,
  };

  String get storageValue => name;

  ThemeMode get mode => switch (this) {
    ThemeChoice.system => ThemeMode.system,
    ThemeChoice.light => ThemeMode.light,
    ThemeChoice.dark => ThemeMode.dark,
  };
}

@immutable
class ThemeState extends Equatable {
  const ThemeState({this.choice = ThemeChoice.system});

  final ThemeChoice choice;

  ThemeMode get mode => choice.mode;

  ThemeState copyWith({ThemeChoice? choice}) =>
      ThemeState(choice: choice ?? this.choice);

  @override
  List<Object?> get props => [choice];
}
