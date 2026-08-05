import { absoluteDiscoveryUrl } from '@/lib/agents/discovery';
import { SITE_URL } from '@/lib/seo/jsonld';

/**
 * RFC 9727 — the API catalog, as an RFC 9264 linkset.
 *
 * One anchor, because this site has exactly one public API: the read-only
 * catalog. Everything else Nest serves is session-gated and belongs in no
 * catalog — see `/auth.md` for why that is a deliberate answer and not an
 * omission.
 *
 * ⚠️ `application/linkset+json`, not `application/json`. The media type IS the
 * discovery mechanism here: an agent that fetched this URL because a `Link`
 * header said `rel="api-catalog"` uses the type to decide whether it can parse
 * what came back. Serving a correct document under the wrong type is the same
 * as not serving it.
 */

const CATALOG_ANCHOR = `${SITE_URL}/api`;

export function GET(): Response {
  const linkset = {
    linkset: [
      {
        /**
         * The API's own base URL, which is what every relation below is
         * "about". It is on THIS origin, not the Nest host — the browser and
         * every agent reach the API through `next.config.ts`'s `/api/:path*`
         * rewrite, and the API host is not meant to be addressed directly
         * (single-origin invariant). Anchoring at the internal host would
         * publish a URL that works from our VPS and nowhere else.
         */
        anchor: CATALOG_ANCHOR,
        'service-desc': [
          {
            href: absoluteDiscoveryUrl('serviceDesc'),
            type: 'application/vnd.oai.openapi+json;version=3.1',
            title: 'OpenAPI 3.1 description of the public catalog API',
          },
        ],
        'service-doc': [
          {
            href: absoluteDiscoveryUrl('serviceDoc'),
            type: 'text/markdown',
            title: 'How to read the public catalog API',
          },
        ],
        status: [
          {
            href: absoluteDiscoveryUrl('status'),
            type: 'application/json',
            title: 'Liveness probe',
          },
        ],
        /**
         * RFC 9727 §3 recommends pointing at the terms an API is used under.
         * `/auth.md` is that document here: it states the API is open,
         * unauthenticated, read-only, and rate-limited, which is the entire
         * contract.
         */
        'terms-of-service': [
          {
            href: absoluteDiscoveryUrl('authDoc'),
            type: 'text/markdown',
            title: 'Access terms and authentication (there is none to obtain)',
          },
        ],
        author: [{ href: `${SITE_URL}/about`, type: 'text/html' }],
      },
    ],
  };

  return new Response(JSON.stringify(linkset, null, 2), {
    // No `Link` header set here on purpose: `proxy.ts` already stamps the full
    // set on every public response, and a second `.set('Link', …)` from this
    // handler would be the one that loses — silently, and only for the header
    // an agent landing HERE first would most want.
    headers: {
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
