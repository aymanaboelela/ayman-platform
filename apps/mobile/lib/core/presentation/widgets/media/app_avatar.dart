import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../../../theme/app_text_style.dart';
import 'app_network_image.dart';
import 'subject_artwork.dart';

/// The four sizes an avatar is ever drawn at.
///
/// A closed set rather than a free `double`, because these four are the whole
/// inventory of the signed-in shell and a fifth would be a design decision
/// rather than a call-site one.
enum AppAvatarSize {
  /// 32 — the account control's own loading placeholder, and a sender's face in
  /// a dense list.
  row(32),

  /// 36 — the account trigger in the app bar.
  bar(36),

  /// 44 — the account menu's header, a message in the assistant thread. Also
  /// the tap floor, which is why nothing interactive is smaller than this.
  menu(44),

  /// 64 — the profile page and the onboarding identity header.
  profile(64);

  const AppAvatarSize(this.px);

  final double px;
}

/// A student's face: the photo when there is one, initials when there is not.
///
/// ## The fallback is the COMMON case
///
/// An email/password account never has a photo, and neither does a Google
/// account whose owner never set one, so the monogram is what most of this
/// product's avatars actually are. It is designed accordingly, and the failed
/// fetch renders through exactly the same path as the absent one — a dead
/// `lh3.googleusercontent.com` URL and a null column must be indistinguishable
/// to a student, because to a student they are the same thing.
///
/// ## Why the monogram is coloured, and why only just
///
/// The web draws every monogram on `--n-4`, which is honest and, in a list of
/// twenty students, unreadable: twenty identical grey discs are worse than no
/// avatar at all because they defeat the scanning they exist to help. So the
/// ground is tinted from a hue hashed off the name, on the same 24-step wheel
/// the coverless course artwork uses — one way of turning a name into a colour
/// in the whole app, and «أحمد» is the same colour in the account menu, in the
/// assistant thread and in the admin table.
///
/// The chroma is the SUBJECT-MARK pair (0.045 light / 0.055 dark), not the
/// artwork's 0.145. That is the difference between a tint and a paint, and it
/// matters here for the reason the decorative-hue rule exists at all: an avatar
/// sits inches from the amber "press me" colour in the app bar, and a saturated
/// disc beside it competes for the one thing the accent is supposed to own.
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    required this.name,
    this.imageUrl,
    this.size = AppAvatarSize.bar,
    super.key,
  });

  /// The student's display name. Also what the hue and the initials are derived
  /// from, so an empty string is handled rather than assumed away: it produces
  /// a neutral person glyph instead of a blank disc.
  final String name;

  /// An absolute URL. `User.image` holds either that or a storage key, and
  /// reconstructing a media URL from a key is the caller's job — this widget
  /// deliberately knows nothing about the media origin.
  final String? imageUrl;

  final AppAvatarSize size;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);
    final px = size.px;

    final hue = decorativeHue(name.trim());
    final ground = c.isDark
        ? oklch(0.28, 0.055, hue.toDouble())
        : oklch(0.94, 0.045, hue.toDouble());
    final ink = c.isDark
        ? oklch(0.82, 0.095, hue.toDouble())
        : oklch(0.45, 0.115, hue.toDouble());

    final letters = _initials(name);

    final monogram = Center(
      child: letters.isEmpty
          ? Icon(Icons.person_outline, size: px * 0.52, color: ink)
          : Text(
              letters,
              // The one place a size is computed rather than taken from the
              // scale, and it has to be: a monogram is a fraction of its disc,
              // and no fixed step tracks a disc that ranges from 32 to 64. 0.36
              // is the web's ratio. `height: 1` because the Arabic line box
              // carries leading for ascenders this has none of, and at 0.36 of
              // 32px that leading pushes two letters visibly off centre.
              style: type
                  .body(color: ink, weight: AppTextStyle.semibold)
                  .copyWith(fontSize: (px * 0.36).roundToDouble(), height: 1),
              maxLines: 1,
              textAlign: TextAlign.center,
            ),
    );

    return Semantics(
      label: name.isEmpty ? null : name,
      image: true,
      child: Container(
        width: px,
        height: px,
        decoration: BoxDecoration(color: ground, shape: BoxShape.circle),
        // The ring is a FOREGROUND decoration. `decoration`'s border paints
        // under the child, and a cover-fit photo fills the disc edge to edge —
        // so a border there is drawn and then immediately painted over, which
        // is how the hairline silently disappears on exactly the avatars that
        // have a photo.
        foregroundDecoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: c.line, width: 1),
        ),
        child: ClipOval(
          child: AppNetworkImage(
            url: imageUrl,
            borderRadius: AppRadius.fullAll,
            fallback: monogram,
          ),
        ),
      ),
    );
  }

  /// First letter of the first word, first letter of the LAST word.
  ///
  /// Egyptian names arrive as three or four words — «أيمن أبو العلا» — and the
  /// middle ones are patronymics that repeat across a whole class, so the first
  /// two words identify a student far less often than the first and last do.
  ///
  /// Reads runes rather than indexing the string: a name can carry an emoji or
  /// a Latin surname, and `name[0]` on a surrogate pair returns half a
  /// character, which renders as the replacement box — a student seeing «□» in
  /// their own avatar reasonably reports the account as broken.
  String _initials(String value) {
    final words = value.trim().split(RegExp(r'\s+'))
      ..removeWhere((w) => w.isEmpty);
    if (words.isEmpty) return '';

    String first(String word) => String.fromCharCode(word.runes.first);

    return words.length == 1
        ? first(words.first)
        : '${first(words.first)}${first(words.last)}';
  }
}
