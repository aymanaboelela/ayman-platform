/// Shared JSON helpers for the hand-written mappers.
///
/// Hand-written, not generated: the contracts are zod schemas in
/// `packages/contracts` and there is no codegen bridge to Dart, so a mapper is
/// the one place a wire shape is stated. These helpers exist so the SAME
/// tolerance rule is spelled once rather than re-decided per mapper.
library;

/// Maps a JSON array, tolerating a null or a missing key.
///
/// ⚠️ An ABSENT array is empty; a MALFORMED element still throws.
///
/// That split is the whole point. A missing optional section should render
/// nothing — the API legitimately omits it. An element whose `totalLessons`
/// arrived as a string is the API having changed underneath us, and swallowing
/// it ships a screen that is quietly missing rows, which is far harder to
/// notice than an error.
List<T> jsonList<T>(dynamic raw, T Function(Map<String, dynamic>) map) {
  if (raw is! List) return const [];
  return raw.cast<Map<String, dynamic>>().map(map).toList(growable: false);
}

/// A list of plain strings, tolerating a null or a missing key.
List<String> jsonStrings(dynamic raw) {
  if (raw is! List) return const [];
  return raw.cast<String>().toList(growable: false);
}
