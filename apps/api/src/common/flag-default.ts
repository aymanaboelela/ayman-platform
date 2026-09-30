import type { FlagDeclaration } from '@ayman/contracts/admin/flags';
import { IS_AYMAN } from './tenant';

/**
 * The value a flag's row is CREATED with on this stack.
 *
 * ## Why this exists at all
 *
 * A flag's row is written once — by `FlagsService.onModuleInit` on the first
 * boot that knows the declaration, or by the seed — and from then on the row
 * wins over any code (CLAUDE.md §2, rule 2: «الجيت في الكود مابيقدرش يلحق صف
 * في الداتابيز»). So a feature that must be ON for Ayman and OFF everywhere
 * else cannot be gated by reading `IS_AYMAN` at request time on top of the
 * flag: the teacher's own toggle would then be dead on one side. The decision
 * has to be made where the row is born, and only there.
 *
 * His stack reads `defaultValue`, byte-for-byte what it always did. Any other
 * stack reads `defaultForTenant` when the declaration states one, and
 * `defaultValue` otherwise — so every flag declared before the field existed
 * behaves exactly as before, on every stack.
 */
export function flagStartsEnabled(declaration: FlagDeclaration, isAyman: boolean = IS_AYMAN): boolean {
  if (isAyman) return declaration.defaultValue;
  return declaration.defaultForTenant ?? declaration.defaultValue;
}
