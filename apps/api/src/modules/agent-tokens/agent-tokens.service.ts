import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AGENT_TOKEN_MAX_ACTIVE,
  AGENT_TOKEN_PERMISSIONS,
  type AgentTokenCreate,
  type AgentTokenCreated,
  type AgentTokenList,
  type AgentTokenRow,
} from '@ayman/contracts/admin/agent-tokens';
import { AuditService } from '../../audit/audit.service';
import { mintAgentToken } from '../../auth/agent-token.resolver';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { permissionsForUser } from '../../auth/permissions';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const ROW_SELECT = {
  id: true,
  name: true,
  hint: true,
  permissions: true,
  createdAt: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  user: { select: { id: true, name: true } },
} as const;

type RowRecord = {
  id: string;
  name: string;
  hint: string;
  permissions: string[];
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  user: { id: string; name: string };
};

function toRow(record: RowRecord): AgentTokenRow {
  return {
    id: record.id,
    name: record.name,
    hint: record.hint,
    permissions: record.permissions,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdBy: record.user,
  };
}

/**
 * «ربط Claude» — making, listing and revoking agent keys.
 *
 * ## Whose keys a caller sees
 *
 * Their own. An `admin` sees every key on the stack too, and may revoke any —
 * the platform owner has to be able to cut off an assistant's key without
 * signing in as the assistant. Nobody else can see or touch a key they did
 * not make.
 */
@Injectable()
export class AgentTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** What this account may put on a key: what it holds, minus the withheld. */
  grantable(user: AuthenticatedUser): string[] {
    const held = new Set<string>(permissionsForUser(user.id, user.role));
    return AGENT_TOKEN_PERMISSIONS.filter((permission) => held.has(permission));
  }

  async list(user: AuthenticatedUser): Promise<AgentTokenList> {
    const rows = await this.prisma.agentToken.findMany({
      where: user.role === 'admin' ? {} : { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: ROW_SELECT,
    });
    return { rows: rows.map(toRow), grantable: this.grantable(user) };
  }

  async create(user: AuthenticatedUser, input: AgentTokenCreate): Promise<AgentTokenCreated> {
    /*
     * Checked against the CALLER, not just the catalogue the schema knows:
     * the resolver would intersect a wider key down anyway, but a key whose
     * row says more than it can do is a screen that lies about it.
     */
    const grantable = new Set(this.grantable(user));
    const refused = input.permissions.filter((permission) => !grantable.has(permission));
    if (refused.length > 0) {
      throw new BadRequestException({ message: 'permissions you do not hold', refused });
    }

    const active = await this.prisma.agentToken.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= AGENT_TOKEN_MAX_ACTIVE) throw new ConflictException('too many active keys');

    const minted = mintAgentToken();
    const record = await this.prisma.agentToken.create({
      data: {
        userId: user.id,
        name: input.name,
        tokenHash: minted.hash,
        hint: minted.hint,
        permissions: input.permissions,
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
      },
      select: ROW_SELECT,
    });

    await this.audit.record({
      action: 'agent-token:create',
      resourceType: 'agent_token',
      resourceId: record.id,
      outcome: 'success',
      metadata: {
        name: record.name,
        hint: record.hint,
        permissions: record.permissions,
        expiresAt: record.expiresAt.toISOString(),
      },
    });

    return { row: toRow(record), token: minted.raw };
  }

  async revoke(user: AuthenticatedUser, id: string): Promise<AgentTokenRow> {
    const existing = await this.prisma.agentToken.findUnique({ where: { id }, select: ROW_SELECT });
    // Someone else's key answers exactly like a missing one.
    if (!existing || (existing.user.id !== user.id && user.role !== 'admin')) {
      throw new NotFoundException();
    }
    if (existing.revokedAt) return toRow(existing);

    const record = await this.prisma.agentToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: ROW_SELECT,
    });
    await this.audit.record({
      action: 'agent-token:revoke',
      resourceType: 'agent_token',
      resourceId: record.id,
      outcome: 'success',
      metadata: { name: record.name, hint: record.hint, owner: record.user.id },
    });
    return toRow(record);
  }
}
