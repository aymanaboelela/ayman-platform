import 'dart:async';

import '../network/api_client.dart';
import 'public_settings.dart';
import 'settings_mapper.dart';

/// The one place `/api/settings/public` is read.
///
/// Cached like the taxonomy and for the same reason: it is reference data an
/// admin edits occasionally, and every surface that wants a WhatsApp link or
/// the InstaPay number would otherwise fetch it again.
///
/// ⚠️ NEVER cached as a FAILURE. `PublicSettings.empty` is what a caller gets
/// when the read did not work, and it is indistinguishable from "the admin has
/// configured nothing" — which is exactly the right degradation for a link,
/// and exactly the wrong thing to remember for six hours. So a failed read
/// leaves the cache empty and the next caller tries again.
class SettingsRepository {
  SettingsRepository(this._client);

  final ApiClient _client;

  PublicSettings? _cached;
  DateTime? _fetchedAt;
  Future<PublicSettings>? _pending;

  static const _ttl = Duration(hours: 6);

  bool get _isFresh {
    final at = _fetchedAt;
    return _cached != null && at != null && DateTime.now().difference(at) < _ttl;
  }

  Future<PublicSettings> load() {
    if (_isFresh) return Future.value(_cached);
    return _pending ??= _fetch();
  }

  Future<PublicSettings> _fetch() async {
    try {
      final result = await _client.get<PublicSettings>(
        '/settings/public',
        parse: (data) => SettingsMapper.fromJson(data as Map<String, dynamic>),
      );

      if (!result.isOk) return _cached ?? PublicSettings.empty;

      _cached = result.value;
      _fetchedAt = DateTime.now();
      return _cached!;
    } finally {
      _pending = null;
    }
  }

  /// For the admin settings screen, the one place that can make this cache
  /// wrong in the same session it is read.
  void invalidate() {
    _cached = null;
    _fetchedAt = null;
  }
}
