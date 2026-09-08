import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../config/app_environment.dart';
import '../../../data/network/api_headers.dart';
import '../../../services/storage_service/secure_store.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/app_radius.dart';
import '../feedback/app_skeleton.dart';

/// An image behind an `/api/…` path that requires the session.
///
/// ## Why this is not `AppNetworkImage` with a header argument
///
/// Conversation attachments have **no signed URL and no TTL**. Access is
/// re-checked from the bearer token on every single request, and the response
/// carries `Cache-Control: private, no-store`. So the URL is useless on its
/// own, and — more importantly — the bytes must not end up somewhere another
/// app or another account can read them.
///
/// `cached_network_image` writes to a shared on-disk cache keyed by URL. That
/// is exactly right for a course cover and exactly wrong for a photograph a
/// student sent about their own homework, so this uses a MEMORY cache only and
/// re-fetches after the app is killed. The file is small (the server re-encodes
/// every image to WebP) and the trade is one round trip against a private photo
/// sitting in a world-readable cache directory.
class AuthenticatedImage extends StatefulWidget {
  const AuthenticatedImage({
    required this.path,
    required this.store,
    this.fit = BoxFit.cover,
    this.borderRadius = AppRadius.mdAll,
    this.aspectRatio,
    super.key,
  });

  /// An API PATH beginning `/api/`, not a full URL.
  final String path;

  final SecureStore store;
  final BoxFit fit;
  final BorderRadius borderRadius;
  final double? aspectRatio;

  @override
  State<AuthenticatedImage> createState() => _AuthenticatedImageState();
}

class _AuthenticatedImageState extends State<AuthenticatedImage> {
  late Future<Map<String, String>> _headers;

  @override
  void initState() {
    super.initState();
    _headers = _buildHeaders();
  }

  Future<Map<String, String>> _buildHeaders() async {
    final token = await widget.store.readSessionToken();
    return {
      if (token != null && token.isNotEmpty)
        ApiHeaders.authorization: 'Bearer $token',
    };
  }

  @override
  Widget build(BuildContext context) {
    final c = AppColors.of(context);

    return FutureBuilder<Map<String, String>>(
      future: _headers,
      builder: (context, snapshot) {
        if (!snapshot.hasData) return _frame(const AppSkeleton());

        final image = CachedNetworkImage(
          imageUrl: '${AppEnvironment.apiOrigin}${widget.path}',
          httpHeaders: snapshot.data,
          fit: widget.fit,
          // Memory only. See the class docs.
          cacheManager: null,
          placeholder: (_, _) => const AppSkeleton(),
          errorWidget: (_, _, _) => ColoredBox(
            color: c.surface3,
            child: Icon(Icons.image_not_supported_outlined, color: c.fgFaint),
          ),
        );

        return _frame(image);
      },
    );
  }

  Widget _frame(Widget child) {
    final clipped = ClipRRect(borderRadius: widget.borderRadius, child: child);
    return widget.aspectRatio == null
        ? clipped
        : AspectRatio(aspectRatio: widget.aspectRatio!, child: clipped);
  }
}
