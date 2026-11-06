import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  AGENT_TOKEN_HINT_LENGTH,
  AGENT_TOKEN_PATTERN,
  AGENT_TOKEN_PREFIX,
  AGENT_TOKEN_WITHHELD,
} from '@ayman/contracts/admin/agent-tokens';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { unscopedPermissionsForUser } from './permissions';

type IncomingHeaders = Record<string, string | string[] | undefined>;

/** What a verified key resolves to — attached to the request as `agentToken`. */
export interface ResolvedAgentToken {
  id: string;
  name: string;
  hint: string;
  expiresAt: Date;
  user: AuthenticatedUser;
  /** Effective: on the key AND held by the account right now. */
  permissions: ReadonlySet<string>;
}

/** `lastUsedAt` is a "is this key still in use?" hint, not a log — the audit
 *  table is the log. One write a minute per key is plenty for the hint. */
const LAST_USED_RESOLUTION_MS = 60_000;

export function hashAgentToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A fresh raw key: the prefix and 32 random bytes, base64url. */
export function mintAgentToken(): { raw: string; hash: string; hint: string } {
  const raw = `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    raw,
    hash: hashAgentToken(raw),
    hint: `${AGENT_TOKEN_PREFIX}${raw.slice(AGENT_TOKEN_PREFIX.length, AGENT_TOKEN_PREFIX.length + AGENT_TOKEN_HINT_LENGTH)}`,
  };
}

/**
 * The raw key if this request carries one, else `null`.
 *
 * Decided by the prefix alone, so a better-auth session token — the Flutter
 * app sends those as `Authorization: Bearer` too — never reaches the
 * database here and keeps going down the session path untouched.
 *
 * A header that HAS the prefix but not the shape is still returned: it is
 * meant as a key, and `resolve` turns it into a 401. Falling through to the
 * session path instead would hand a malformed key to better-auth's bearer
 * plugin, which would answer "anonymous" — the wrong question entirely.
 */
export function agentBearerFrom(headers: IncomingHeaders): string | null {
  const raw = headers['authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const match = /^bearer\s+(\S+)\s*$/i.exec(header);
  const token = match?.[1];
  return token?.startsWith(AGENT_TOKEN_PREFIX) ? token : null;
}

/**
 * Verifies a key and works out what it may do. Called by `AuthGuard` only.
 *
 * Every refusal is the same `null` — expired, revoked, unknown, a student, a
 * banned account — so a caller holding a dead key learns nothing about why.
 * The guard turns it into a 401.
 */
@Injectable()
export class AgentTokenResolver {
  private readonly logger = new Logger(AgentTokenResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolve(raw: string, ip: string | null): Promise<ResolvedAgentToken | null> {
    if (!AGENT_TOKEN_PATTERN.test(raw)) return null;

    const row = await this.prisma.agentToken.findUnique({
      where: { tokenHash: hashAgentToken(raw) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailVerified: true,
            image: true,
            phoneNumber: true,
            phoneNumberVerified: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            bannedAt: true,
          },
        },
      },
    });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;

    const { user } = row;
    // A key acts as a STAFF account. A creator who has since been demoted to
    // student, or banned, takes every key they made down with them.
    if (user.bannedAt || user.role === 'student') return null;

    const held = new Set<string>(unscopedPermissionsForUser(user.id, user.role));
    const permissions = new Set(
      row.permissions.filter((p) => held.has(p) && !AGENT_TOKEN_WITHHELD.has(p)),
    );

    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      void this.prisma.agentToken
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date(), lastUsedIp: ip } })
        .catch((error: unknown) => this.logger.warn('lastUsedAt update failed', error as Error));
    }

    return {
      id: row.id,
      name: row.name,
      hint: row.hint,
      expiresAt: row.expiresAt,
      permissions,
      user: {
        id: user.id,
        email: user.email ?? '',
        name: user.name,
        emailVerified: user.emailVerified,
        image: user.image,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: user.phoneNumberVerified,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * One audit row per write made with a key, and per request refused for one.
   *
   * Fire-and-forget: the guard must not wait on the chain lock to let a
   * request through, and an audit hiccup must not fail a mark. A failure is
   * logged loudly instead.
   */
  recordUse(
    token: ResolvedAgentToken,
    request: { method: string; path: string; ip: string | null; userAgent: string | null },
    outcome: 'success' | 'denied',
    permission: string | null,
  ): void {
    void this.audit
      .record({
        action: 'agent-token:use',
        resourceType: 'agent_token',
        resourceId: token.id,
        outcome,
        actorUserId: token.user.id,
        actorIp: request.ip,
        actorUserAgent: request.userAgent,
        metadata: { method: request.method, path: request.path, permission, key: token.hint },
      })
      .catch((error: unknown) => this.logger.error('agent-token audit write failed', error as Error));
  }
}
