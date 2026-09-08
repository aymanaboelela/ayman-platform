import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_radius.dart';
import '../feedback/app_skeleton.dart';

/// Every remote picture in the product: a course cover, a book jacket, an
/// avatar's photo, a homework attachment, a chat image.
///
/// ## The three states, and why the third one is not an error screen
///
/// A student on a school connection sees all three of these in one session, so
/// all three have to be designed:
///
///   1. **loading** — [AppSkeleton], filling the slot. It owns the 180ms paint
///      delay, so a response that lands in 90ms never flashes a grey rectangle
///      on its way to the picture. Using the same skeleton the rest of the app
///      uses is the point: a cover, a title bar and a list row must all wait in
///      the same way, or a loading screen reads as three unrelated things.
///   2. **loaded** — a short cross-fade. `cached_network_image` defaults to
///      500ms in and 1000ms out, both outside this product's motion vocabulary;
///      a grid of four covers dissolving for a full second reads as a page that
///      has not finished loading long after it has.
///   3. **missing** — [fallback], or a quiet empty frame. **Never** a broken
///      image glyph. `UserAvatar` on the web learned this the expensive way: a
///      dead Google photo URL used to draw the browser's own torn-page icon
///      beside a student's name, and «صورتي بايظة» is not what a stale CDN
///      entry should look like. A dead URL and an absent one must be
///      indistinguishable, which is why a null [url] and a failed fetch land on
///      the same widget here rather than on two.
///
/// ## The caller owns the box
///
/// This fills whatever it is given and never asks for a size of its own. Pass
/// an [aspectRatio] (a cover), [width]/[height] (a thumbnail), or put it in a
/// parent that is already bounded. Dropped into an unbounded slot it collapses
/// to nothing — the same contract `CourseArt` has on the web, where all five
/// call sites own their aspect box.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    required this.url,
    this.aspectRatio,
    this.borderRadius = AppRadius.lgAll,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.fallback,
    this.semanticLabel,
    super.key,
  });

  /// Null or empty renders [fallback] immediately, with no request and no
  /// skeleton. That is the ordinary case, not an error: most courses have no
  /// cover and most accounts have no photo.
  final String? url;

  /// Height is derived from the measured width. Ignored when [height] is given.
  final double? aspectRatio;

  final BorderRadius borderRadius;
  final double? width;
  final double? height;

  /// [BoxFit.cover] by default — a picture in a fixed slot crops rather than
  /// letterboxes, because bars read as an image that failed to load.
  final BoxFit fit;

  /// What to draw when there is no picture. A `SubjectArtwork` for a course, a
  /// monogram for an avatar, a book's spine for the shop.
  ///
  /// Whatever this is, it must look like a finished design rather than a hole:
  /// on this platform the coverless case is the majority case, so the fallback
  /// is most of what a student actually sees.
  final Widget? fallback;

  /// Null marks the picture decorative and hides it from the screen reader.
  ///
  /// That is the right default here: a cover sits beside the course title, an
  /// avatar beside the student's name, and announcing both says everything
  /// twice. Pass a label only when the image carries information that is
  /// nowhere else on the screen — a homework photo, a chat attachment.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final hasUrl = url != null && url!.isNotEmpty;

    // Built once and used for BOTH the no-url case and the failed-fetch case,
    // so the two cannot drift apart. See the class docs.
    final missing =
        fallback ??
        DecoratedBox(
          decoration: BoxDecoration(
            color: c.surface3,
            border: Border.all(color: c.lineSubtle, width: 0.5),
            borderRadius: borderRadius,
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Padding(
              padding: const EdgeInsets.all(8),
              // `image_outlined`, never `broken_image`. This says "there is no
              // picture", which is true; the torn-page glyph says "something is
              // wrong with your account", which is not.
              child: Icon(Icons.image_outlined, size: 24, color: c.fgFaint),
            ),
          ),
        );

    Widget content = hasUrl
        ? LayoutBuilder(
            builder: (context, constraints) {
              // Decode at the size actually painted. A 1600px cover decoded for
              // a 128px thumbnail is several megabytes of RAM per row, and four
              // of them on a dashboard is how a 2GB Android device dies while
              // scrolling. `memCacheWidth` never upscales, so a small source is
              // unaffected.
              final dpr = MediaQuery.devicePixelRatioOf(context);
              final decodeWidth = constraints.maxWidth.isFinite
                  ? (constraints.maxWidth * dpr).round()
                  : null;

              return CachedNetworkImage(
                imageUrl: url!,
                fit: fit,
                width: double.infinity,
                height: double.infinity,
                memCacheWidth: decodeWidth,
                fadeInDuration: AppMotion.popover,
                fadeOutDuration: AppMotion.hover,
                // The skeleton runs its own 180ms delay; fading it in on top of
                // that would delay it twice and put the shimmer on screen after
                // the picture it is standing in for.
                placeholderFadeInDuration: Duration.zero,
                placeholder: (context, _) => AppSkeleton(
                  // The skeleton is a BAR by default — it takes a height rather
                  // than filling, because everywhere else it stands in for a
                  // line of text. Here it stands in for a rectangle, so the
                  // measured box is handed to it.
                  height: constraints.maxHeight.isFinite
                      ? constraints.maxHeight
                      : 0,
                  borderRadius: borderRadius,
                ),
                errorWidget: (context, _, _) => missing,
              );
            },
          )
        : missing;

    if (aspectRatio != null && height == null) {
      content = AspectRatio(aspectRatio: aspectRatio!, child: content);
    }

    // Outside the aspect box so the clip matches the painted rectangle rather
    // than the parent's looser constraints.
    content = ClipRRect(borderRadius: borderRadius, child: content);

    if (width != null || height != null) {
      content = SizedBox(width: width, height: height, child: content);
    }

    return semanticLabel == null
        ? ExcludeSemantics(child: content)
        : Semantics(image: true, label: semanticLabel, child: content);
  }
}
