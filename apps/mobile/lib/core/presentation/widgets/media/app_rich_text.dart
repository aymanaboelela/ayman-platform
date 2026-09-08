import 'package:flutter/material.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';

/// Admin-authored rich text — a course description, a lesson's reading.
///
/// ## Why this renders HTML at all
///
/// The admin editor stores HTML, and the same string has to read the same way
/// on the site and in the app. Converting it to Markdown on the way in would
/// be a second, lossy representation nobody maintains.
///
/// ## The sanitisation this does NOT do
///
/// Two passes already ran before this string arrived: one on WRITE in the API,
/// one on READ in the web app. This is a third surface and it does not add a
/// DOMPurify of its own — it renders through an ALLOWLIST instead, which is
/// the stronger guarantee on a client that cannot execute what it does not
/// build. `flutter_widget_from_html_core` has no script engine and no
/// `<iframe>`: an `onerror` attribute is not a vulnerability here, it is an
/// unknown attribute that gets dropped.
///
/// The tag set below mirrors `richTextSanitizeOptions()` in
/// `apps/web/lib/sanitize-options.ts`. ⚠️ If that list changes, this one
/// changes with it — a tag the web renders and the app silently swallows is
/// content a student on a phone cannot see.
///
/// ## Links open OUTSIDE the app
///
/// And only `http(s)` and `mailto:` ones, matching the web's
/// `ALLOWED_URI_REGEXP`. A `javascript:` or an app-scheme URL in a description
/// is either a mistake or an attack, and neither should be handed to the OS.
class AppRichText extends StatelessWidget {
  const AppRichText({required this.html, super.key});

  final String html;

  /// The tags the admin editor can produce, and the only ones drawn.
  static const _allowed = {
    'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li',
    'h2', 'h3', 'blockquote', 'code', 'pre', 'a',
  };

  static final _safeScheme = RegExp(r'^(?:https?|mailto):', caseSensitive: false);

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    return HtmlWidget(
      html,
      textStyle: type.body(color: c.fg),
      // Anything not on the list is dropped, tag and children alike for the
      // structural ones. Returning `false` from the builder removes the
      // element entirely.
      customWidgetBuilder: (element) =>
          _allowed.contains(element.localName) ? null : const SizedBox.shrink(),
      customStylesBuilder: (element) => switch (element.localName) {
        'h2' => {'font-size': '1.25em', 'font-weight': '600'},
        'h3' => {'font-size': '1.1em', 'font-weight': '600'},
        'blockquote' => {
            'padding-inline-start': '${AppSpacing.x12}px',
            'color': _hex(c.fgMuted),
          },
        'a' => {'color': _hex(c.accentText), 'text-decoration': 'none'},
        'code' || 'pre' => {'color': _hex(c.fgMuted)},
        _ => null,
      },
      onTapUrl: (url) async {
        if (!_safeScheme.hasMatch(url)) return false;
        return launchUrl(
          Uri.parse(url),
          mode: LaunchMode.externalApplication,
        );
      },
    );
  }

  /// `flutter_widget_from_html_core` takes CSS strings, so a token has to be
  /// spelled back out as one. Alpha is dropped: every colour handed here is
  /// opaque, and `#RRGGBBAA` is not universally parsed.
  static String _hex(Color color) {
    final value = color.toARGB32() & 0xFFFFFF;
    return '#${value.toRadixString(16).padLeft(6, '0')}';
  }
}
