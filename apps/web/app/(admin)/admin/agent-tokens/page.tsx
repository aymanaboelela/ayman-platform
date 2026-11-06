import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AgentTokenListSchema } from '@ayman/contracts/admin/agent-tokens';
import { agentTokensCopy as c } from '@ayman/contracts/copy/agent-tokens';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { AgentTokensScreen } from './agent-tokens-screen';

export const metadata = { title: c.title };

/**
 * «ربط Claude» — make a key with the permissions you tick, hand it to the
 * assistant, revoke it from here. See `packages/contracts/src/admin/agent-tokens.ts`.
 *
 * Uncached: a revoked key must show as revoked on the very next load.
 */
export default async function AgentTokensPage() {
  if (!(await getEntitlements()).agentTokens) notFound();

  const [list, requestHeaders] = await Promise.all([
    adminGet('/api/admin/agent-tokens', AgentTokenListSchema)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => {
        console.error('admin/agent-tokens: failed to load keys', error);
        return { ok: false as const };
      }),
    headers(),
  ]);

  // The Keychain entry is named after the host, so one Mac can hold a key for
  // each stack it works on without the two overwriting each other.
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost';

  return (
    <>
      <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mb-6 max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
      {list.ok ? (
        <AgentTokensScreen rows={list.data.rows} grantable={list.data.grantable} host={host} />
      ) : (
        <p className="text-fg-muted">{c.loadFailed}</p>
      )}
    </>
  );
}
