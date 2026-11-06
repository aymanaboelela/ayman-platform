import { AGENT_TOKEN_PATTERN } from '@ayman/contracts/admin/agent-tokens';
import { AgentTokenResolver, hashAgentToken, mintAgentToken } from './agent-token.resolver';

const now = new Date();

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: null,
    name: 'Assistant',
    emailVerified: false,
    image: null,
    phoneNumber: null,
    phoneNumberVerified: false,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
    bannedAt: null,
    ...overrides,
  };
}

function tokenRow(overrides: Record<string, unknown> = {}, user = userRow()) {
  return {
    id: 't1',
    name: 'Claude',
    hint: 'ayk_abcdef',
    permissions: ['homework:read', 'news:write', 'role:grant'],
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastUsedAt: new Date(),
    user,
    ...overrides,
  };
}

function resolverFor(row: unknown) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const update = jest.fn().mockResolvedValue({});
  const prisma = { agentToken: { findUnique, update } };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return {
    resolver: new AgentTokenResolver(prisma as never, audit as never),
    findUnique,
    update,
  };
}

const minted = mintAgentToken();

describe('AgentTokenResolver', () => {
  it('mints keys of the documented shape, stored only as their hash', () => {
    expect(minted.raw).toMatch(AGENT_TOKEN_PATTERN);
    expect(minted.hash).toBe(hashAgentToken(minted.raw));
    expect(minted.hash).not.toContain(minted.raw.slice(4));
    expect(minted.raw.startsWith(minted.hint)).toBe(true);
  });

  it('looks a key up by hash and grants only what the key AND the account hold', async () => {
    const { resolver, findUnique } = resolverFor(tokenRow());
    const resolved = await resolver.resolve(minted.raw, '1.2.3.4');
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: minted.hash } }));
    // `owner` is withheld `news:*` and `role:*`; `role:grant` is withheld from
    // every key besides. Only `homework:read` survives.
    expect([...(resolved?.permissions ?? [])]).toEqual(['homework:read']);
    expect(resolved?.user).toMatchObject({ id: 'u1', role: 'owner', email: '' });
  });

  it.each([
    ['revoked', tokenRow({ revokedAt: new Date() })],
    ['expired', tokenRow({ expiresAt: new Date(Date.now() - 1) })],
    ['made by an account now a student', tokenRow({}, userRow({ role: 'student' }))],
    ['made by a banned account', tokenRow({}, userRow({ bannedAt: new Date() }))],
    ['unknown', null],
  ])('refuses a key that is %s', async (_label, row) => {
    const { resolver } = resolverFor(row);
    await expect(resolver.resolve(minted.raw, null)).resolves.toBeNull();
  });

  it('refuses a malformed key without touching the database', async () => {
    const { resolver, findUnique } = resolverFor(tokenRow());
    await expect(resolver.resolve('ayk_short', null)).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('writes lastUsedAt at most once a minute', async () => {
    const fresh = resolverFor(tokenRow({ lastUsedAt: new Date() }));
    await fresh.resolver.resolve(minted.raw, null);
    expect(fresh.update).not.toHaveBeenCalled();

    const stale = resolverFor(tokenRow({ lastUsedAt: new Date(Date.now() - 120_000) }));
    await stale.resolver.resolve(minted.raw, '1.2.3.4');
    expect(stale.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { lastUsedAt: expect.any(Date), lastUsedIp: '1.2.3.4' },
    });
  });
});
