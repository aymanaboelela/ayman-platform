import { AGENT_DISCOVERY_PATHS } from '@/lib/agents/discovery';

/**
 * The same discovery relations the `Link` RESPONSE HEADER used to carry, as
 * `<link>` elements in the document head.
 *
 * They moved here because the header could not be made to stop growing.
 *
 * `proxy.ts` set `Link` on every public route — the routes that have a cached
 * shell. Next stores that shell's response headers and folds the proxy's
 * headers into them on each revalidation by APPENDING, so one more copy of the
 * whole value landed in the stored entry every time it revalidated. Measured on
 * production 2026-08-06: exactly 2595 bytes added every five minutes, dead
 * constant, which is 519 a minute — and 519 is precisely one copy of this list
 * plus the `, ` that joins it on. It reached 16522 bytes and took the site
 * down, because Node's `fetch` refuses a response carrying more than 16KB of
 * headers and the container healthcheck used `fetch`.
 *
 * `headers.delete('Link')` before `set` inside the proxy did NOT stop it, and
 * that was measured on production rather than assumed: the growth continued at
 * a byte-identical rate after it shipped. The accumulation happens in Next's
 * cache layer, after the proxy has handed its response over, so nothing done
 * to that `Headers` object can reach the stored copy.
 *
 * An element in the document has no such problem — it is part of the HTML that
 * gets cached, so a re-render replaces it rather than appending to it.
 *
 * ⚠️ One relation did not survive the move: `rel="alternate"` pointing at the
 * page's own markdown twin, which was per-path and cannot come from a shared
 * layout that does not know the path. The twins are still served, still listed
 * in `/llms.txt` and `/sitemap.xml`, and still content-negotiated — an agent
 * sending `Accept: text/markdown` gets markdown for any page, and the `.md`
 * suffix works with no negotiation at all. Only the per-page hint is gone.
 * Restoring it belongs in each page's `metadata.alternates.types`, which is a
 * change per route rather than one here.
 */
export function AgentDiscoveryLinks() {
  return (
    <>
      <link
        rel="api-catalog"
        href={AGENT_DISCOVERY_PATHS.apiCatalog}
        type="application/linkset+json"
      />
      <link
        rel="service-desc"
        href={AGENT_DISCOVERY_PATHS.serviceDesc}
        type="application/vnd.oai.openapi+json;version=3.1"
      />
      <link rel="service-doc" href={AGENT_DISCOVERY_PATHS.serviceDoc} type="text/markdown" />
      <link rel="status" href={AGENT_DISCOVERY_PATHS.status} type="application/json" />
      <link rel="describedby" href={AGENT_DISCOVERY_PATHS.llms} type="text/plain" />
      <link rel="describedby" href={AGENT_DISCOVERY_PATHS.agentSkills} type="application/json" />
      <link rel="sitemap" href={AGENT_DISCOVERY_PATHS.sitemap} type="application/xml" />
    </>
  );
}
