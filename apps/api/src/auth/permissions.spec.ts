import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS, permissionsForRole, roleHasPermission, type Permission } from './permissions';

/**
 * Walks `apps/api/src` and collects every literal argument passed to
 * `@RequirePermission(...)`. A permission string that is not in the catalogue
 * is a route nobody can ever reach — and it fails SILENTLY, because
 * `roleHasPermission` simply returns false for an unknown string.
 *
 * A grep is the right tool here rather than a type-level check: the decorator
 * is typed, but a `as never` cast or a re-export could still smuggle one past
 * the compiler, and this test costs milliseconds.
 */
function collectRequirePermissionArguments(root: string): Set<string> {
  const found = new Set<string>();
  const pattern = /@RequirePermission\(\s*'([^']+)'\s*\)/g;

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'node_modules' || entry === 'generated') continue;
        walk(path);
        continue;
      }
      if (!path.endsWith('.ts')) continue;
      // Comments are stripped first: the decorator's own doc block contains a
      // deliberately misspelled example, and a scanner that counted it would
      // fail forever for the wrong reason.
      const source = readFileSync(path, 'utf8')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .replaceAll(/\/\/[^\n]*/g, '');
      for (const match of source.matchAll(pattern)) {
        found.add(match[1]!);
      }
    }
  };

  walk(root);
  return found;
}

describe('permission catalogue', () => {
  it('has no duplicate entries', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('every entry is resource:action shaped', () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z][a-z-]*:[a-z][a-z-]*$/);
    }
  });

  it('admin holds every catalogued permission', () => {
    expect(permissionsForRole('admin')).toEqual([...PERMISSIONS]);
  });

  // RECONCILED: the student set is the union of what Plans 2–5 appended.
  // Asserting a shorter list here would pass only by deleting other plans'
  // permissions.
  it('student holds exactly its own set, and never admin:access', () => {
    expect([...permissionsForRole('student')].sort()).toEqual([
      'course:read',
      'enrollment:create',
      'enrollment:read',
      'payment:submit',
      'profile:read',
      'profile:write',
      'progress:read',
      'progress:write',
      'quiz:attempt',
      'quiz:read',
    ]);
    expect(roleHasPermission('student', 'admin:access')).toBe(false);
    expect(roleHasPermission('student', 'settings:write')).toBe(false);
    expect(roleHasPermission('student', 'course:publish')).toBe(false);
    expect(roleHasPermission('student', 'attempt:unlock')).toBe(false);
  });

  // The catalogue must be exhaustive: a @RequirePermission string that is not
  // in PERMISSIONS is a route nobody can ever reach, and it fails silently.
  it('every @RequirePermission argument in the repo is catalogued', () => {
    const used = collectRequirePermissionArguments(join(__dirname, '..'));
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((p) => !PERMISSIONS.includes(p as Permission))).toEqual([]);
  });

  it('an unknown or missing role holds nothing (fail closed)', () => {
    expect(permissionsForRole('parent')).toEqual([]);
    expect(permissionsForRole(undefined)).toEqual([]);
    expect(roleHasPermission(null, 'course:read')).toBe(false);
  });
});

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
    expect(roleHasPermission('student', 'quiz:read')).toBe(true);
  });

  it('denies an unrecognised role every permission', () => {
    expect(roleHasPermission('editor', 'quiz:read')).toBe(false);
  });
});
