import 'package:ayman_mobile/core/services/deep_link/deep_link_service.dart';
import 'package:flutter_test/flutter_test.dart';

/// Turning an incoming link into a route.
///
/// Every case below is a link that landed on go_router's English «Page Not
/// Found» before this existed — measured on the emulator.
void main() {
  String? route(String uri) => DeepLinkService.routeFor(Uri.parse(uri));

  group('custom scheme', () {
    test('the first segment is the HOST, not the path', () {
      // The trap: `Uri.parse('aymanapp://quizzes/x').path` is `/x`, so reading
      // the path alone silently drops «quizzes» and routes to the wrong place.
      expect(
        route('aymanapp://quizzes/019f-abc'),
        '/quizzes/019f-abc',
      );
    });

    test('deeper paths keep every segment', () {
      expect(
        route('aymanapp://courses/algebra/lessons/l1'),
        '/courses/algebra/lessons/l1',
      );
    });

    test('a bare scheme resolves to nothing', () {
      expect(route('aymanapp://'), isNull);
    });
  });

  group('https links', () {
    test('the host is dropped and the path kept', () {
      expect(
        route('https://aymanaboelela.com/library/algebra'),
        '/library/algebra',
      );
    });

    test('the query survives', () {
      expect(
        route('https://aymanaboelela.com/login?next=/path'),
        '/login?next=/path',
      );
    });
  });

  group('routes the app deliberately does not serve', () {
    test('the marketing home is refused', () {
      // Refused rather than 404'd: it exists on the web, and the caller opens
      // it there instead of showing a student a broken screen.
      expect(route('https://aymanaboelela.com/'), isNull);
    });

    test('the public catalogue and the legal pages are refused', () {
      expect(route('https://aymanaboelela.com/courses'), isNull);
      expect(route('https://aymanaboelela.com/privacy'), isNull);
      expect(route('https://aymanaboelela.com/terms'), isNull);
    });

    test('a wildcard entry matches its whole subtree', () {
      expect(route('https://aymanaboelela.com/dev/fixtures'), isNull);
    });

    test('a parameterised entry matches by prefix', () {
      expect(route('https://aymanaboelela.com/years/2'), isNull);
    });

    test('a NEWS ARTICLE is served even though the index is not', () {
      // The index stays on the web; a single article opens in the app, which
      // is what a notification or a shared link points at.
      expect(
        route('https://aymanaboelela.com/news/some-article'),
        '/news/some-article',
      );
    });

    test('a route that merely starts with a refused word is served', () {
      // `/coursesomething` is not `/courses`.
      expect(
        route('https://aymanaboelela.com/library/courses-and-things'),
        '/library/courses-and-things',
      );
    });
  });
}
