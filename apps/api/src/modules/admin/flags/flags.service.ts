import { Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { FLAG_DECLARATIONS, type FeatureFlag, type FeatureFlagList } from '@ayman/contracts/admin/flags';
import { AuditService } from '../../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin.constants';

// Widened to `Set<string>` explicitly: `key` arrives as a plain string from
// the URL param, and `Set<FlagKey>.has()` would otherwise demand the exact
// literal union type rather than any string.
const DECLARED_KEYS: Set<string> = new Set(FLAG_DECLARATIONS.map((entry) => entry.key));

function toDto(row: { key: string; descriptionAr: string; enabled: boolean; updatedAt: Date }): FeatureFlag {
  return {
    key: row.key,
    descriptionAr: row.descriptionAr,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class FlagsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Upserts a row for every declaration on module init, so the admin screen
   * always lists the full set and an operator never has to know a key by
   * heart. Rows for undeclared keys are LEFT ALONE — deleting a declaration
   * (rather than the row) is how a flag is retired, and the row staying
   * behind is the audit trail of it having existed.
   */
  async onModuleInit(): Promise<void> {
    for (const declaration of FLAG_DECLARATIONS) {
      await this.prisma.featureFlag.upsert({
        where: { key: declaration.key },
        create: {
          key: declaration.key,
          descriptionAr: declaration.descriptionAr,
          enabled: declaration.defaultValue,
        },
        // Description follows the declaration; `enabled` never does — an
        // operator's toggle must survive a deploy.
        update: { descriptionAr: declaration.descriptionAr },
      });
    }
  }

  /** Public: values only, for the same-shape `GET /api/flags` loader. */
  async listPublic(): Promise<FeatureFlagList> {
    const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map(toDto);
  }

  /** Admin: identical rows today, but a distinct endpoint so the two can
   *  diverge (e.g. rollout metadata) without an admin-only field leaking
   *  into the public payload by accident. */
  async listAdmin(): Promise<FeatureFlagList> {
    return this.listPublic();
  }

  async setEnabled(key: string, enabled: boolean): Promise<FeatureFlag> {
    // A key nobody declared is not a flag this admin screen can act on —
    // reject before touching the database rather than silently writing a
    // row for something `isEnabled()` would ignore anyway.
    if (!DECLARED_KEYS.has(key)) throw new NotFoundException();

    const updated = await this.prisma.featureFlag.update({
      where: { key },
      data: { enabled },
    });

    await this.audit.record({
      action: 'flag:update',
      resourceType: AUDIT_RESOURCES.featureFlag,
      resourceId: key,
      outcome: 'success',
      metadata: { enabled },
    });

    return toDto(updated);
  }
}
