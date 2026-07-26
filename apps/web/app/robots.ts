import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/jsonld';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // robots.txt is a crawling hint, NOT an access control — every one
        // of these is also protected by proxy.ts's PROTECTED_PREFIXES and
        // the API's deny-by-default guard. Listing them here only keeps
        // them out of the index.
        disallow: ['/admin', '/dashboard', '/onboarding', '/settings', '/api/', '/dev/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
