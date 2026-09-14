import {
  PERMISSIONS,
  grantablePermissions,
  permissionsForRole,
  roleHasPermission,
  runtimeGrantsFor,
  setRuntimeGrants,
  type Permission,
  type Role,
} from './permissions';

/**
 * The runtime grant layer — «a feature ships to the operator first, and reaches
 * the instructor when somebody opens it».
 *
 * Every case here resets the grant table afterwards, because it is module
 * state shared by the whole process: a leaked grant would make a later test
 * pass for a reason that has nothing to do with what it is checking.
 */
function grant(role: Role, ...permissions: Permission[]): void {
  setRuntimeGrants(new Map([[role, new Set(permissions)]]));
}

/**
 * `expect(value, message)` is a vitest signature; this package runs jest,
 * where the second argument throws. Comparing a one-key object instead keeps
 * the failure output naming the permission that broke, which is the whole
 * reason the message was there.
 */
function expectFor(label: string, actual: boolean, expected: boolean): void {
  expect({ [label]: actual }).toEqual({ [label]: expected });
}

afterEach(() => setRuntimeGrants(new Map()));

describe('the owner baseline', () => {
  it('can run its own teaching without anybody granting anything', () => {
    for (const permission of [
      'admin:access',
      'course:create',
      'course:publish',
      'lesson:write',
      'quiz:write',
      'quiz:grade',
      'student:read',
      'homework:review',
      'settings:write',
      'home:write',
      'analytics:read',
    ] as const) {
      expectFor(permission, roleHasPermission('owner', permission), true);
    }
  });

  it('cannot touch money, the audit trail, or the platform itself', () => {
    // The split the role exists for: what is theirs to run, against what
    // belongs to whoever operates the platform.
    for (const permission of [
      'payment:read',
      'payment:review',
      'book-order:read',
      'expense:read',
      'expense:write',
      'audit:read',
      'diagnostics:read',
      'flags:write',
      'taxonomy:write',
      'marketing:send',
      'marketing:device',
      'outreach:read',
    ] as const) {
      expectFor(permission, roleHasPermission('owner', permission), false);
    }
  });

  it('cannot do anything irreversible to a student account', () => {
    for (const permission of [
      'student:write',
      'student:ban',
      'student:delete',
      'student:set-password',
      'student:role-change',
    ] as const) {
      expectFor(permission, roleHasPermission('owner', permission), false);
    }
  });

  it('can write news but not publish it', () => {
    // The same split `course:publish` already makes: writing a page and
    // putting it on the public internet are different authorities.
    expect(roleHasPermission('owner', 'news:write')).toBe(true);
    expect(roleHasPermission('owner', 'news:publish')).toBe(false);
  });

  it('holds strictly less than admin', () => {
    const owner = new Set(permissionsForRole('owner'));

    expect(owner.size).toBeLessThan(PERMISSIONS.length);
    for (const permission of owner) {
      expectFor(permission, roleHasPermission('admin', permission), true);
    }
  });
});

describe('admin is unaffected by any of this', () => {
  it('still holds every permission, including ones added later', () => {
    for (const permission of PERMISSIONS) {
      expectFor(permission, roleHasPermission('admin', permission), true);
    }
  });

  it('is not changed by a grant to another role', () => {
    grant('owner', 'payment:read');

    expect(permissionsForRole('admin')).toEqual(PERMISSIONS);
  });
});

describe('student is unaffected', () => {
  it('keeps exactly its own set, and gains nothing from an owner grant', () => {
    const before = permissionsForRole('student');
    grant('owner', 'payment:read', 'audit:read');

    expect(permissionsForRole('student')).toEqual(before);
    expect(roleHasPermission('student', 'payment:read')).toBe(false);
  });
});

describe('granting at runtime', () => {
  it('opens a permission the baseline does not hold', () => {
    expect(roleHasPermission('owner', 'payment:read')).toBe(false);

    grant('owner', 'payment:read');

    expect(roleHasPermission('owner', 'payment:read')).toBe(true);
  });

  it('shows up in the list the client renders from', () => {
    grant('owner', 'payment:read');

    expect(permissionsForRole('owner')).toContain('payment:read');
  });

  it('keeps the catalogue order rather than appending', () => {
    // The client renders from this list, and a grant must not reorder it.
    grant('owner', 'payment:read', 'audit:read');
    const listed = permissionsForRole('owner');
    const expected = PERMISSIONS.filter((permission) => listed.includes(permission));

    expect(listed).toEqual(expected);
  });

  it('closes again when the grant goes away', () => {
    grant('owner', 'payment:read');
    setRuntimeGrants(new Map());

    expect(roleHasPermission('owner', 'payment:read')).toBe(false);
  });

  it('cannot invent a permission that is not in the catalogue', () => {
    grant('owner', 'nonsense:everything' as Permission);

    expect(permissionsForRole('owner')).not.toContain('nonsense:everything');
  });

  it('never widens an unknown role', () => {
    grant('superuser' as Role, 'audit:read');

    expect(roleHasPermission('superuser', 'audit:read')).toBe(false);
  });

  it('reports what is loaded', () => {
    grant('owner', 'payment:read');

    expect(runtimeGrantsFor('owner')).toEqual(['payment:read']);
    expect(runtimeGrantsFor('student')).toEqual([]);
  });
});

describe('grantablePermissions', () => {
  const grantable = new Set(grantablePermissions('owner'));

  it('offers the things an operator would plausibly open up', () => {
    for (const permission of [
      'payment:read',
      'payment:review',
      'book-order:read',
      'student:write',
      'news:publish',
      'audit:read',
    ] as const) {
      expectFor(permission, grantable.has(permission), true);
    }
  });

  it('never offers the permission that hands out permissions', () => {
    // The one that would make the baseline decoration: a role that can be
    // given the granting screen can give itself the rest of the platform.
    expect(grantable.has('role:grant')).toBe(false);
    expect(grantable.has('role:read')).toBe(false);
  });

  it('never offers a self-scoped student permission', () => {
    // These resolve through the caller's own id and mean nothing on a staff
    // account — granting one would be a row that does nothing.
    for (const permission of [
      'profile:read',
      'progress:write',
      'quiz:attempt',
      'payment:submit',
      'book-order:submit',
      'homework:submit',
      'enrollment:create',
    ] as const) {
      expectFor(permission, grantable.has(permission), false);
    }
  });

  it('never offers something the role already has', () => {
    for (const permission of permissionsForRole('owner')) {
      expectFor(permission, grantable.has(permission), false);
    }
  });

  it('offers admin nothing, because admin already holds everything', () => {
    expect(grantablePermissions('admin')).toEqual([]);
  });

  it('is entirely inside the catalogue', () => {
    for (const permission of grantable) {
      expect(PERMISSIONS).toContain(permission);
    }
  });
});
