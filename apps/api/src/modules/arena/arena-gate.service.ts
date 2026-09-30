import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { FLAG_DECLARATIONS, type FlagDeclaration } from '@ayman/contracts/admin/flags';
import { flagStartsEnabled } from '../../common/flag-default';
import { PrismaService } from '../../prisma/prisma.service';

export const ARENA_FLAG = 'arena.enabled';

/** فلاج اتقفل من `/admin/flags` بيوصل للساحة في خلال كده. */
const CACHE_MS = 10_000;

/**
 * الساحة مفتوحة على الستاك ده؟ — فلاج `arena.enabled` (`admin/flags.ts`).
 *
 * مفتوح افتراضيًا عند أيمن ومقفول عند الباقي، والقرار ده بيتاخد مرة واحدة
 * وقت ما صف الفلاج بيتعمل (`flagStartsEnabled`). بعدها الصف هو اللي بيحكم:
 * المدرّس بيقفل ويفتح من لوحته. صف مش موجود (قبل أول بوت) بيقرا نفس
 * الافتراضي اللي كان هيتكتب.
 */
@Injectable()
export class ArenaGateService {
  private cached: { at: number; open: boolean } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async isOpen(): Promise<boolean> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.open;
    const row = await this.prisma.featureFlag.findUnique({ where: { key: ARENA_FLAG }, select: { enabled: true } });
    const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === ARENA_FLAG) as FlagDeclaration | undefined;
    const open = row?.enabled ?? (declaration ? flagStartsEnabled(declaration) : false);
    this.cached = { at: Date.now(), open };
    return open;
  }
}

/**
 * ٤٠٤ على كل راوت في الساحة لما الفلاج مقفول — نفس منطق `FeatureGuard`:
 * الحاجة المقفولة **مش موجودة** على الستاك ده، مش «موجودة ومش من حقك».
 * بيشتغل بعد `AuthGuard`، فالزائر لسه بياخد ٤٠١.
 */
@Injectable()
export class ArenaOpenGuard implements CanActivate {
  constructor(private readonly gate: ArenaGateService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.gate.isOpen())) throw new NotFoundException();
    return true;
  }
}
