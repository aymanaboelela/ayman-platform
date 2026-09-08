import 'dart:async';

import '../network/api_client.dart';
import 'taxonomy.dart';
import 'taxonomy_mapper.dart';

/// The one place `/api/taxonomy` is read.
///
/// ## Why a repository and not a data source per feature
///
/// Four screens want this payload — onboarding, «صفّي ومساري», «الكورسات» and
/// the admin taxonomy editor — and it describes reference data that changes
/// when an admin edits a table, which is roughly never. Four independent
/// fetches would be four requests on a cold start for one unchanged answer, on
/// an endpoint the API deliberately throttles.
///
/// So it is fetched once and held. The web reached the same conclusion from
/// the other direction: `lib/taxonomy.ts` exists because reading the endpoint
/// live on every view collapsed the whole fleet into ONE server-side throttle
/// bucket and started 429-ing the library.
///
/// ## Failure is a NULL, not an exception
///
/// Nothing this returns is load-bearing: it turns ids and numbers into Arabic
/// labels. A caller that cannot get it prints the fallback label and renders
/// the rest of the screen. Making the taxonomy able to take a page down would
/// be trading a wrong heading for a blank screen.
class TaxonomyRepository {
  TaxonomyRepository(this._client);

  final ApiClient _client;

  Taxonomy? _cached;
  DateTime? _fetchedAt;

  /// In flight, so N screens opening at once make ONE request.
  ///
  /// Without this the library and the drawer both asking on the same frame is
  /// two identical calls, and on a cold start that is exactly what happens.
  Future<Taxonomy?>? _pending;

  /// Long, because the underlying tables change when an admin edits them and
  /// the app is restarted far more often than that. Short enough that an
  /// admin who renames a year does not have to tell students to reinstall.
  static const _ttl = Duration(hours: 6);

  bool get _isFresh {
    final at = _fetchedAt;
    return _cached != null && at != null && DateTime.now().difference(at) < _ttl;
  }

  /// The taxonomy, or null when it could not be read.
  ///
  /// ⚠️ A failed read is NOT cached. The next caller tries again — which is
  /// what makes a student who opened the library in a tunnel see real year
  /// headings the moment they have signal, without restarting the app.
  Future<Taxonomy?> load() {
    if (_isFresh) return Future.value(_cached);
    return _pending ??= _fetch();
  }

  Future<Taxonomy?> _fetch() async {
    try {
      final result = await _client.get<Taxonomy>(
        '/taxonomy',
        parse: (data) => TaxonomyMapper.fromJson(data as Map<String, dynamic>),
      );

      if (!result.isOk) return _cached;

      _cached = result.value;
      _fetchedAt = DateTime.now();
      return _cached;
    } finally {
      // Cleared in a `finally` so a THROWN parse error — a shape change, not a
      // network failure — does not leave a permanently-rejected future in the
      // slot, which would fail every later call in the session with an error
      // from minutes ago.
      _pending = null;
    }
  }

  /// Forces the next [load] to go to the network.
  ///
  /// For the admin taxonomy editor, which is the one screen that can make this
  /// cache wrong in the same session it is read.
  void invalidate() {
    _cached = null;
    _fetchedAt = null;
  }
}
