/**
 * XML-escape a URL on its way into `<loc>`.
 *
 * ## Why this is not paranoia
 *
 * Next writes the element as `content += \`<loc>${item.url}</loc>\`` with no
 * escaping of any kind — read on 2026-09-15 in
 * `next/dist/build/webpack/loaders/metadata/resolve-route-data.js`. That is
 * fine for every URL this site has today and stops being fine the moment one
 * slug carries an `&`.
 *
 * And a slug can. `NewsSlugSchema` refines on `!/[/.\s]/` only — no slash, no
 * dot, no whitespace — so `&`, `<`, `>` and the quotes all pass validation,
 * and there is no slugify step anywhere between the admin's text field and
 * this file. «الذكاء الاصطناعي & الأمن» is a slug an editor can type today.
 *
 * ⚠️ The failure is DOCUMENT-level, not entry-level. XML has no partial
 * parse: a parser that rejects the document rejects every URL in it, not the
 * one bad entry. So a single mistyped ampersand in one article's slug takes
 * the whole catalogue out of the sitemap — and Search Console reports it as a
 * fetch error, which reads like the route is broken rather than like one row
 * is.
 *
 * ⚠️ Escape, do NOT `encodeURIComponent`. The Arabic slugs are already emitted
 * raw in the canonical, in the `BreadcrumbList` and in `/llms.txt`;
 * re-spelling them here would make the sitemap's URL a different string from
 * the one every other surface publishes, which is the one thing a sitemap
 * must never do. Escaping changes the XML encoding of the same URL; encoding
 * changes the URL.
 */
const XML_ENTITIES: ReadonlyArray<[RegExp, string]> = [
  // `&` FIRST, always — escaping it after the others would re-escape the
  // ampersands they just introduced and publish `&amp;lt;`.
  [/&/g, '&amp;'],
  [/</g, '&lt;'],
  [/>/g, '&gt;'],
  [/"/g, '&quot;'],
  [/'/g, '&apos;'],
];

export function sitemapLoc(url: string): string {
  return XML_ENTITIES.reduce((value, [pattern, entity]) => value.replace(pattern, entity), url);
}
