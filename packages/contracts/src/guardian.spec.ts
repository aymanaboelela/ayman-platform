import { describe, expect, it } from 'vitest';
import { GuardianCodeSchema } from './guardian';

describe('GuardianCodeSchema — ٦ خانات، حروف وأرقام ورموز', () => {
  it('accepts the codes the database generates, typed any way a parent types them', () => {
    expect(GuardianCodeSchema.parse('5B76&5')).toBe('5B76&5');
    expect(GuardianCodeSchema.parse(' u4u*jy ')).toBe('U4U*JY');
    expect(GuardianCodeSchema.parse('h%% ec9')).toBe('H%%EC9');
  });

  it('refuses the old 26-character codes, the wrong length and the look-alikes', () => {
    expect(GuardianCodeSchema.safeParse('ABCDEFGHJKMNPQRSTUVWXYZ234').success).toBe(false);
    expect(GuardianCodeSchema.safeParse('AB2#C').success).toBe(false);
    expect(GuardianCodeSchema.safeParse('AB2#C0').success).toBe(false);
    expect(GuardianCodeSchema.safeParse('AB2#CI').success).toBe(false);
    expect(GuardianCodeSchema.safeParse('AB2-CD').success).toBe(false);
  });
});
