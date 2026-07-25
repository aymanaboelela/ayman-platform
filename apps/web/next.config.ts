import path from 'node:path';
import type { NextConfig } from 'next';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3300';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Dynamic-by-default with explicit `use cache` opt-in. Retrofitting this later
  // is the expensive path, so it is on from day one.
  cacheComponents: true,

  transpilePackages: ['@ayman/ui', '@ayman/contracts'],

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
