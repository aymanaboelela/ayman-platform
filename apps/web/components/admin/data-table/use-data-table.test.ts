import { describe, expect, it } from 'vitest';
import { sortFromSearchParams, toPrismaOrderBy } from './use-data-table';

const ALLOWED = {
  createdAt: 'createdAt',
  fullName: 'fullName',
  governorate: 'governorateCode',
} as const;

describe('sortFromSearchParams', () => {
  it('maps a known key to its column and keeps the direction', () => {
    expect(sortFromSearchParams('fullName', 'asc', ALLOWED)).toEqual([{ id: 'fullName', desc: false }]);
  });

  it('falls back to the first allowed key when the key is unknown', () => {
    expect(sortFromSearchParams('password', 'asc', ALLOWED)).toEqual([
      { id: 'createdAt', desc: false },
    ]);
  });

  it('never lets an injection string through', () => {
    expect(sortFromSearchParams('id; DROP TABLE app.users --', 'desc', ALLOWED)).toEqual([
      { id: 'createdAt', desc: true },
    ]);
  });
});

describe('toPrismaOrderBy', () => {
  it('resolves through the map, never through the raw parameter', () => {
    expect(toPrismaOrderBy('governorate', 'asc', ALLOWED)).toEqual({ governorateCode: 'asc' });
  });

  it('resolves an unknown key to the default column', () => {
    expect(toPrismaOrderBy('../../etc/passwd', 'desc', ALLOWED)).toEqual({ createdAt: 'desc' });
  });
});
