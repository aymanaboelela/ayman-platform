import { resolveStackGrades } from './stack-grades';

/*
 * `TENANT_GRADES` is read from the env at import; this suite runs with it
 * unset, so the build-time default is `[]` — the shape of his stack and of
 * every stack provisioned before grades existed.
 */
describe('resolveStackGrades', () => {
  it('is the build-time list while nothing was saved', () => {
    expect(resolveStackGrades(undefined)).toEqual([]);
    expect(resolveStackGrades({ slugs: null })).toEqual([]);
  });

  it('is the saved list once an admin saved one, in the canonical order', () => {
    expect(resolveStackGrades({ slugs: ['bac2', 'prep3', 'bac1'] }).map((g) => g.slug)).toEqual([
      'prep3',
      'bac1',
      'bac2',
    ]);
  });

  it('treats a saved EMPTY list as a real answer — the old questions', () => {
    expect(resolveStackGrades({ slugs: [] })).toEqual([]);
  });

  it('falls back to the build-time list on a row it cannot read', () => {
    expect(resolveStackGrades({ slugs: ['nope'] })).toEqual([]);
    expect(resolveStackGrades('garbage')).toEqual([]);
  });
});
