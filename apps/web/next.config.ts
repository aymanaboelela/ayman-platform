import path from 'node:path';
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';
const MEDIA_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:3300';
const mediaOriginUrl = new URL(MEDIA_ORIGIN);

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached — the runtime image copies that instead of
  // the whole pnpm workspace.
  output: 'standalone',
  // The workspace root, so the tracer follows symlinked pnpm deps out of
  // apps/web. Without it the standalone bundle silently misses packages.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),

  reactStrictMode: true,

  // Dynamic-by-default with explicit `use cache` opt-in. Retrofitting this later
  // is the expensive path, so it is on from day one.
  cacheComponents: true,

  /**
   * Where every `'use cache'` entry is stored. Next's built-in handler is an
   * LRU inside the process, so a deploy or a restart empties the cache — and
   * `getBranding()` is read by the ROOT layout, meaning the first visitor after
   * every deploy pays for a cold read on the path of every page.
   *
   * Top-level, not `experimental.cacheHandlers` — the experimental spelling is
   * marked `@deprecated` in `next/dist/server/config-shared.d.ts`.
   *
   * The path is stored relative to `distDir` at build time and re-resolved at
   * runtime, and `collect-build-traces` adds it (and `ioredis`) to the
   * standalone bundle — so no `outputFileTracingIncludes` entry is needed.
   */
  cacheHandlers: {
    default: path.join(import.meta.dirname, 'cache-handler', 'redis.js'),
  },

  transpilePackages: ['@ayman/ui', '@ayman/contracts', 'three'],

  /**
   * Media is served from a DIFFERENT origin than the app (Task 13, A10), so
   * `next/image` needs it on the allowlist explicitly — `unoptimized` is
   * unnecessary once the origin is declared here.
   */
  images: {
    /**
     * Next 16 refuses to fetch an upstream image whose host resolves to a
     * private IP — an SSRF guard, and a correct one. In development the media
     * origin IS `http://localhost:3300`, so every uploaded avatar and every
     * branded mark fails to optimise with
     * `upstream image … resolved to private ip` and renders broken.
     *
     * Scoped to non-production by an environment check, not by a comment
     * asking someone to remember: in production `NEXT_PUBLIC_MEDIA_ORIGIN` is
     * a real host on the public internet, the guard has something real to
     * protect against, and this stays `false`.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
    remotePatterns: [
      {
        protocol: mediaOriginUrl.protocol.replace(':', '') as 'http' | 'https',
        hostname: mediaOriginUrl.hostname,
        port: mediaOriginUrl.port,
        pathname: '/media/**',
      },
      /**
       * Google profile photos, for the avatar on /onboarding.
       *
       * Listing the host here rather than pointing an `<img>` straight at it
       * is what keeps the CSP untouched: the optimizer fetches server-side
       * and re-serves from `/_next/image` on OUR origin, so the existing
       * `img-src 'self'` already covers it. A direct `<img src="https://lh3…">`
       * would need `img-src` widened, and — since `CSP_ENFORCE` is still unset
       * — would have looked fine right up until the day the policy was
       * enforced.
       *
       * It also stops a request going to Google on every page view that shows
       * an avatar, which would tell them where a signed-in student is
       * browsing, and it survives Google rotating the URL.
       */
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ],
  },

  /**
   * Pins the monorepo root explicitly. Without this, Turbopack's root
   * auto-detection climbs the directory tree looking for the outermost
   * lockfile and can latch onto an unrelated one above this repo (e.g. a
   * stray package-lock.json in a parent directory on the host machine),
   * which then misresolves every workspace package import.
   */
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },

  /**
   * Single origin: the browser only ever sees `/api/...` on the web origin.
   * This is what makes __Host- cookies, SameSite=Strict, and zero CORS possible
   * simultaneously. Never call the API host directly from client code.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
