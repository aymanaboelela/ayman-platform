import { describe, expect, it } from 'vitest';
import { DesignFolderCreateSchema, cleanDesignName, designSizeLabel } from './designs';

describe('cleanDesignName — the names the instructor reads before publishing', () => {
  it('strips a right-to-left override, so «exe.png» cannot pose as «gnp.exe»', () => {
    expect(cleanDesignName('thumb‮gnp.exe')).toBe('thumbgnp.exe');
  });

  it('strips zero-width and control characters and collapses spaces', () => {
    expect(cleanDesignName(' غلاف​  المحاضرة\u0000 ٣ ')).toBe('غلاف المحاضرة ٣');
  });

  it('a name that is only invisible characters is refused, not stored empty', () => {
    expect(DesignFolderCreateSchema.safeParse({ name: '​⁦' }).success).toBe(false);
  });
});

describe('designSizeLabel', () => {
  it('drops a zero decimal', () => {
    expect(designSizeLabel(60 * 1024 * 1024)).toBe('60 ميجا');
    expect(designSizeLabel(1.44 * 1024 * 1024)).toBe('1.4 ميجا');
  });
});
