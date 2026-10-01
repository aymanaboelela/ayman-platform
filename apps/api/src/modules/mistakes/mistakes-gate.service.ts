import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { FLAG_DECLARATIONS, type FlagDeclaration } from '@ayman/contracts/admin/flags';
import { flagStartsEnabled } from '../../common/flag-default';
import { PrismaService } from '../../prisma/prisma.service';

export const MISTAKES_FLAG = 'mistakes.enabled';

/** فلاج اتقفل من `/admin/flags` بيوصل للدفتر في خلال كده. */
const CACHE_MS = 10_000;

/**
 * دفتر الغلطات مفتوح على الستاك ده؟ — فلاج `mistakes.enabled` (`admin/flags.ts`).
 * نفس `ArenaGateService` بالظبط — مفتوح افتراضيًا عند أيمن ومقفول عند الباقي.
 */
@Injectable()
export class MistakesGateService {
  private cached: { at: number; open: boolean } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async isOpen(): Promise<boolean> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.open;
    const row = await this.prisma.featureFlag.findUnique({
      where: { key: MISTAKES_FLAG },
      select: { enabled: true },
    });
    const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === MISTAKES_FLAG) as
      | FlagDeclaration
      | undefined;
    const open = row?.enabled ?? (declaration ? flagStartsEnabled(declaration) : false);
    this.cached = { at: Date.now(), open };
    return open;
  }
}

/**
 * ٤٠٤ على كل راوت في الدفتر لما الفلاج مقفول — نفس منطق `ArenaOpenGuard`:
 * الحاجة المقفولة **مش موجودة** على الستاك ده.
 */
@Injectable()
export class MistakesOpenGuard implements CanActivate {
  constructor(private readonly gate: MistakesGateService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.gate.isOpen())) throw new NotFoundException();
    return true;
  }
}
