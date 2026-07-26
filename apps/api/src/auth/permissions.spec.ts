import { roleHasPermission } from './permissions';

describe('quiz permissions', () => {
  it.each([
    'question:write',
    'quiz:write',
    'attempt:read',
    'attempt:grade',
    'attempt:unlock',
    'appeal:resolve',
    'analytics:read',
  ])('never grants %s to a student', (permission) => {
    expect(roleHasPermission('student', permission)).toBe(false);
    expect(roleHasPermission('admin', permission)).toBe(true);
  });

  it('grants a student only their own attempt permissions', () => {
    expect(roleHasPermission('student', 'quiz:attempt')).toBe(true);
    expect(roleHasPermission('student', 'appeal:create')).toBe(true);
    expect(roleHasPermission('student', 'quiz:read')).toBe(true);
  });

  it('denies an unrecognised role every permission', () => {
    expect(roleHasPermission('editor', 'quiz:read')).toBe(false);
  });
});
