'use client';

import { useEffect } from 'react';

const RELS = ['api-catalog', 'service-desc', 'service-doc', 'status', 'describedby', 'sitemap'];

/**
 * One copy of each discovery `<link>` in `<head>`, not two.
 *
 * From Next 16.4 (React 19.2 as it ships there), a page rendered per request
 * — which is every page once the CSP nonce is enforced — streams the
 * `(site)` layout inside the root `loading.tsx` boundary, and on hydrating
 * that boundary React inserts its OWN hoisted copy of each `<link>` instead of
 * adopting the one the server already put in `<head>`. Both are identical and
 * harmless to a parser, but «exactly one api-catalog relation» is what
 * `agent-discovery.e2e.ts` holds the homepage to, and two is how a head
 * starts accumulating.
 *
 * The EARLIER copy is the server's: React holds no reference to it, so it is
 * the one that can be removed without React later failing to unmount a node
 * it owns. With one copy (static pages, older Next) this finds nothing to do.
 */
export function DiscoveryLinksDedupe() {
  useEffect(() => {
    const seen = new Map<string, HTMLLinkElement>();
    for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[rel]')) {
      if (!RELS.includes(link.rel)) continue;
      const key = `${link.rel} ${link.getAttribute('href') ?? ''}`;
      const earlier = seen.get(key);
      if (earlier) earlier.remove();
      seen.set(key, link);
    }
  }, []);
  return null;
}
