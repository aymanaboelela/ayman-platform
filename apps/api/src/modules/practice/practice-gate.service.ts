import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { FLAG_DECLARATIONS, type FlagDeclaration } from '@ayman/contracts/admin/flags';
import { flagStartsEnabled } from '../../common/flag-default';
import { PrismaService } from '../../prisma/prisma.service';

export const PRACTICE_FLAG = 'practice.enabled';

/** A flag switched off at `/admin/flags` reaches these routes within this long. */
const CACHE_MS = 10_000;

/**
 * Is «اختبارات مجانية» open on this stack? — the `practice.enabled` flag.
 * The same shape as `MistakesGateService`: on by default for Ayman, off for
 * any other tenant until the teacher switches it on (an empty public section
 * is worse than none).
 */
@Injectable()
export class PracticeGateService {
  private cached: { at: number; open: boolean } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async isOpen(): Promise<boolean> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.open;
    const row = await this.prisma.featureFlag.findUnique({
      where: { key: PRACTICE_FLAG },
      select: { enabled: true },
    });
    const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === PRACTICE_FLAG) as
      | FlagDeclaration
      | undefined;
    const open = row?.enabled ?? (declaration ? flagStartsEnabled(declaration) : false);
    this.cached = { at: Date.now(), open };
    return open;
  }
}

/**
 * 404 on EVERY practice route — public and admin — while the flag is off: on
 * this stack the feature does not exist, so it must not even answer «مش من
 * حقك». Runs after the global `AuthGuard`, so an anonymous call to an admin
 * route still gets its 401 first.
 */
@Injectable()
export class PracticeOpenGuard implements CanActivate {
  constructor(private readonly gate: PracticeGateService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.gate.isOpen())) throw new NotFoundException();
    return true;
  }
}
