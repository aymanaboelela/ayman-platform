import 'package:cached_network_image/cached_network_image.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:photo_view/photo_view.dart';

import '../../../localization/copy_keys.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_motion.dart';
import '../../../theme/app_spacing.dart';
import '../../../theme/app_text_style.dart';
import '../../../theme/app_theme.dart';

/// One picture, full screen, pinch to zoom — a homework photo, a chat
/// attachment, a whiteboard shot the instructor sent to the thread.
///
/// ## Why the ground is ink in both themes
///
/// A photograph is not part of the page. Painting it onto the light theme's
/// warm off-white means a bright frame around a bright picture, which flattens
/// it; and the surface the eye compares the image against is then a different
/// colour depending on what the student happens to have their phone set to,
/// which is exactly what a viewer must not do. `ink` stays `#0F0C09` in both
/// themes for this family of surfaces — the video stage, code windows, this.
///
/// ## Dismiss by dragging DOWN, not only by the close button
///
/// It is the gesture every phone photo viewer has, so its absence reads as a
/// stuck screen rather than as a missing feature. It also has to lose to the
/// zoom: [PhotoViewGestureDetectorScope] with a vertical axis is what makes
/// photo_view hand a vertical drag to the parent only when the picture has
/// nowhere left to pan, so panning a zoomed-in photo upward never throws the
/// viewer off the screen.
class AppImageViewer extends StatefulWidget {
  const AppImageViewer({
    required this.imageUrl,
    this.heroTag,
    this.semanticLabel,
    super.key,
  });

  final String imageUrl;

  /// Matches a tag on the thumbnail that opened this, so the picture flies into
  /// place instead of cross-fading over the page it came from.
  final Object? heroTag;

  /// What the picture IS, for a screen reader. Unlike a cover or an avatar this
  /// one is worth announcing: a viewer opened on purpose is the only thing on
  /// the screen, so there is no caption beside it to say it twice.
  final String? semanticLabel;

  /// Pushes the viewer over the current page.
  ///
  /// A transparent route rather than an opaque one, because the drag-to-dismiss
  /// has to reveal what is underneath as it moves — dragging a photo down off a
  /// black rectangle looks like a bug.
  static Future<void> show(
    BuildContext context, {
    required String imageUrl,
    Object? heroTag,
    String? semanticLabel,
  }) {
    return Navigator.of(context, rootNavigator: true).push<void>(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: null,
        transitionDuration: AppMotion.modal,
        reverseTransitionDuration: AppMotion.modal,
        pageBuilder: (context, animation, secondaryAnimation) => AppImageViewer(
          imageUrl: imageUrl,
          heroTag: heroTag,
          semanticLabel: semanticLabel,
        ),
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            FadeTransition(
              opacity: CurvedAnimation(parent: animation, curve: AppMotion.out),
              child: child,
            ),
      ),
    );
  }

  @override
  State<AppImageViewer> createState() => _AppImageViewerState();
}

class _AppImageViewerState extends State<AppImageViewer>
    with SingleTickerProviderStateMixin {
  /// How far down the picture has to travel before letting go dismisses it.
  /// Short enough to feel like a flick, long enough that a mis-swipe while
  /// reading does not throw the picture away.
  static const double _dismissDistance = 96;

  /// …or fast enough. A quick flick covers very little distance before the
  /// finger leaves the glass, and without this the gesture only works when
  /// performed slowly, which is the opposite of how anyone performs it.
  static const double _dismissVelocity = 700;

  /// The travel over which the ground fades out. Deliberately longer than the
  /// dismiss distance so that letting go at the threshold still shows most of
  /// the ground — a backdrop already at zero would make the release look like
  /// nothing happened.
  static const double _fadeDistance = 320;

  /// Read synchronously in the drag handler rather than mirrored into state:
  /// photo_view reports a scale change from inside its own layout, and calling
  /// `setState` from there is how a viewer ends up throwing "setState() called
  /// during build" the first time a student pinches.
  final PhotoViewScaleStateController _scaleStates =
      PhotoViewScaleStateController();

  late final AnimationController _settle = AnimationController(
    vsync: this,
    duration: AppMotion.popover,
  )..addListener(() {
    setState(() {
      _dragY = _settleFrom * (1 - AppMotion.out.transform(_settle.value));
    });
  });

  double _dragY = 0;
  double _settleFrom = 0;

  bool get _zoomed =>
      _scaleStates.scaleState != PhotoViewScaleState.initial;

  @override
  void dispose() {
    _settle.dispose();
    _scaleStates.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails details) {
    // Zoomed in, photo_view keeps the gesture until the picture hits its edge —
    // and at the edge it hands it here, where dismissing would be wrong. The
    // student is looking at a detail, not leaving.
    if (_zoomed) return;
    if (_settle.isAnimating) _settle.stop();
    setState(() => _dragY += details.delta.dy);
  }

  void _onDragEnd(DragEndDetails details) {
    if (_zoomed) return;
    final velocity = details.velocity.pixelsPerSecond.dy;
    if (_dragY.abs() > _dismissDistance || velocity.abs() > _dismissVelocity) {
      Navigator.of(context).maybePop();
      return;
    }
    _settleFrom = _dragY;
    _settle.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);
    final type = AppTextStyle.of(context);

    final travel = (_dragY.abs() / _fadeDistance).clamp(0.0, 1.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // The dark theme's overlay regardless of the app's theme, because this
      // page is dark regardless of the app's theme. Light status-bar icons over
      // a light bar is the usual way a full-screen viewer ships with an
      // invisible clock.
      value: AppTheme.overlayFor(AppColors.dark),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                color: c.ink.withValues(alpha: 1 - travel * 0.65),
              ),
            ),
            Positioned.fill(
              child: GestureDetector(
                onVerticalDragUpdate: _onDragUpdate,
                onVerticalDragEnd: _onDragEnd,
                child: Transform.translate(
                  offset: Offset(0, _dragY),
                  // Shrinking as it goes is what makes the picture read as
                  // being put back rather than as sliding off a shelf.
                  child: Transform.scale(
                    scale: 1 - travel * 0.12,
                    child: PhotoViewGestureDetectorScope(
                      axis: Axis.vertical,
                      child: PhotoView(
                        imageProvider: CachedNetworkImageProvider(
                          widget.imageUrl,
                        ),
                        // The same provider and the same cache key the
                        // thumbnail used, so opening a picture the student has
                        // already seen costs no bytes and no wait.
                        scaleStateController: _scaleStates,
                        backgroundDecoration: const BoxDecoration(
                          color: Colors.transparent,
                        ),
                        minScale: PhotoViewComputedScale.contained,
                        initialScale: PhotoViewComputedScale.contained,
                        maxScale: PhotoViewComputedScale.covered * 3,
                        filterQuality: FilterQuality.medium,
                        semanticLabel: widget.semanticLabel,
                        heroAttributes: widget.heroTag == null
                            ? null
                            : PhotoViewHeroAttributes(tag: widget.heroTag!),
                        loadingBuilder: (context, event) => Center(
                          child: SizedBox.square(
                            dimension: AppSpacing.x32,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: c.accent,
                              // Determinate as soon as the server sends a
                              // length: a full-size attachment on a school
                              // connection is long enough that a spinner with
                              // no end alone reads as a hang.
                              value: event == null || event.expectedTotalBytes == null
                                  ? null
                                  : event.cumulativeBytesLoaded /
                                        event.expectedTotalBytes!,
                            ),
                          ),
                        ),
                        errorBuilder: (context, error, stackTrace) => Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            spacing: AppSpacing.x8,
                            children: [
                              Icon(
                                Icons.image_outlined,
                                size: AppSpacing.x32,
                                color: c.inkFg2,
                              ),
                              Text(
                                tr(CopyKeys.commonError),
                                style: type.bodySm(color: c.inkFg2),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: SafeArea(
                child: Align(
                  // Top-start: the right of the screen under Arabic, which is
                  // where the thumb that opened this already is.
                  alignment: AlignmentDirectional.topStart,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.x8),
                    child: Material(
                      // A scrim under the glyph. Without it the close control
                      // vanishes over a photograph that happens to be pale in
                      // its top corner, which is most photographs of a page of
                      // homework.
                      color: c.ink.withValues(alpha: 0.55),
                      shape: const CircleBorder(),
                      clipBehavior: Clip.antiAlias,
                      child: IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: const Icon(Icons.close_rounded),
                        color: c.inkFg,
                        tooltip: tr(CopyKeys.commonClose),
                        constraints: const BoxConstraints.tightFor(
                          width: AppSpacing.minTap,
                          height: AppSpacing.minTap,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
