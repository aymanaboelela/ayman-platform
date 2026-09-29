import { FLAG_DECLARATIONS, type FlagDeclaration } from '@ayman/contracts/admin/flags';
import { flagStartsEnabled } from './flag-default';

const arena = FLAG_DECLARATIONS.find((entry) => entry.key === 'arena.enabled') as FlagDeclaration;

describe('flagStartsEnabled', () => {
  it('opens the arena on his stack and closes it on every other one', () => {
    expect(flagStartsEnabled(arena, true)).toBe(true);
    expect(flagStartsEnabled(arena, false)).toBe(false);
  });

  it('leaves every flag without a tenant default exactly as it was, on both sides', () => {
    for (const declaration of FLAG_DECLARATIONS as readonly FlagDeclaration[]) {
      if (declaration.defaultForTenant !== undefined) continue;
      expect(flagStartsEnabled(declaration, true)).toBe(declaration.defaultValue);
      expect(flagStartsEnabled(declaration, false)).toBe(declaration.defaultValue);
    }
  });

  it('reads IS_AYMAN when not told — and the suite runs as his stack', () => {
    expect(flagStartsEnabled(arena)).toBe(true);
  });
});
