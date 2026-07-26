/**
 * `</script>` inside a JSON string closes the surrounding tag and everything
 * after it becomes markup. Escaping `<` is the standard fix and is not
 * optional.
 *
 * ⚠️ Under a NONCE-based CSP this inline script needs the nonce. The public
 * catalog deliberately runs a HASH-based/permissive policy (nonces disable
 * static optimization and PPR — see `proxy.ts`'s `buildPublicCsp`), so this
 * is fine here — but if `/courses` is ever moved behind the authenticated
 * matcher in `proxy.ts`, this breaks silently and the structured data
 * disappears from the rendered page.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
