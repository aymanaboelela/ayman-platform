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
        // Kept in step with `proxy.ts`'s PROTECTED_PREFIXES: a signed-in-only
        // route that Google crawls is a login page in the index under a course
        // page's name.
        disallow: [
          '/admin',
          '/dashboard',
          '/onboarding',
          '/settings',
          '/library',
          '/profile',
          '/results',
          '/foundations',
          '/path',
          '/quizzes',
          '/api/',
          '/dev/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
