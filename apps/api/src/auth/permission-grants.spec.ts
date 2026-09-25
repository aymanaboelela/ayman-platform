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
  it('runs the same system Ayman does, without anybody granting anything', () => {
    /*
     * «عادل وصبري بيستخدموا السيستم شبهي». There is nobody above the
     * instructor on their stack to grant the rest, so the rest is theirs:
     * answering a student, approving a transfer, issuing a code, shipping a
     * book. Measured on both live stacks before this: each answered 403.
     */
    for (const permission of [
      'admin:access',
      'course:create',
      'course:publish',
      'quiz:grade',
      'homework:review',
      'settings:write',
      'payment:read',
      'payment:review',
      'conversation:read',
      'conversation:reply',
      'conversation:close',
      'book-order:read',
      'book-order:ship',
      'expense:write',
      'center:write',
      'center:attendance',
      'student:write',
      'student:set-password',
      'outreach:read',
      'marketing:send',
      'flags:write',
      'audit:read',
    ] as const) {
      expectFor(permission, roleHasPermission('owner', permission), true);
    }
  });

  it('holds no part of articles — «شيل من عندهم بتاعت المقالات بس»', () => {
    for (const permission of ['news:read', 'news:write', 'news:publish'] as const) {
      expectFor(permission, roleHasPermission('owner', permission), false);
    }
  });

  it('holds none of the ways to give articles back to itself', () => {
    // Granting `news:*` to the owner role, or promoting a second account to
    // `admin`, would each undo the line above.
    for (const permission of ['role:read', 'role:grant', 'student:role-change'] as const) {
      expectFor(permission, roleHasPermission('owner', permission), false);
    }
  });

  it('holds everything else, including a permission added later', () => {
    // Inverted on purpose — see `OWNER_WITHHELD`.
    expect(permissionsForRole('owner')).toHaveLength(PERMISSIONS.length - 6);
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
    grant('owner', 'payment:read', 'news:publish');

    expect(permissionsForRole('student')).toEqual(before);
    expect(roleHasPermission('student', 'payment:read')).toBe(false);
  });
});

describe('granting at runtime', () => {
  /*
   * ⚠️ `news:publish`, not `payment:read`, and the swap is the point.
   *
   * These cases need a permission the owner baseline genuinely does NOT hold,
   * and `payment:read` stopped being one when the instructor was given sight
   * of their own students' subscriptions. A test that grants something already
   * held still goes green — it just stops testing granting.
   */
  it('opens a permission the baseline does not hold', () => {
    expect(roleHasPermission('owner', 'news:publish')).toBe(false);

    grant('owner', 'news:publish');

    expect(roleHasPermission('owner', 'news:publish')).toBe(true);
  });

  it('shows up in the list the client renders from', () => {
    grant('owner', 'payment:read');

    expect(permissionsForRole('owner')).toContain('payment:read');
  });

  it('keeps the catalogue order rather than appending', () => {
    // The client renders from this list, and a grant must not reorder it.
    grant('owner', 'payment:read', 'news:publish');
    const listed = permissionsForRole('owner');
    const expected = PERMISSIONS.filter((permission) => listed.includes(permission));

    expect(listed).toEqual(expected);
  });

  it('closes again when the grant goes away', () => {
    grant('owner', 'news:publish');
    setRuntimeGrants(new Map());

    expect(roleHasPermission('owner', 'news:publish')).toBe(false);
  });

  it('cannot invent a permission that is not in the catalogue', () => {
    grant('owner', 'nonsense:everything' as Permission);

    expect(permissionsForRole('owner')).not.toContain('nonsense:everything');
  });

  it('never widens an unknown role', () => {
    grant('superuser' as Role, 'news:publish');

    expect(roleHasPermission('superuser', 'news:publish')).toBe(false);
  });

  it('reports what is loaded', () => {
    grant('owner', 'payment:read');

    expect(runtimeGrantsFor('owner')).toEqual(['payment:read']);
    expect(runtimeGrantsFor('student')).toEqual([]);
  });
});

describe('grantablePermissions', () => {
  const grantable = new Set(grantablePermissions('owner'));

  it('offers the one thing the owner is kept out of: articles', () => {
    // Everything else is already in the baseline, and the role/escalation
    // permissions are never grantable — so an operator's only choice left is
    // whether this instructor writes articles after all.
    expect([...grantable].sort()).toEqual(['news:publish', 'news:read', 'news:write']);
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

describe('the two escalation paths are not offered at all', () => {
  /**
   * These are different in kind from the other destructive permissions, and
   * the difference is the whole reason they are listed separately: banning or
   * deleting a student is a bad day; either of these hands over the platform.
   */
  it('never offers student:role-change — a second account promoted to admin', () => {
    // `changeRole` refuses to change your OWN role, so it cannot be turned on
    // yourself. It does not stop promoting another account you control.
    expect(grantablePermissions('owner')).not.toContain('student:role-change');
  });

  it('never offers student:set-password — the operator account taken over', () => {
    expect(grantablePermissions('owner')).not.toContain('student:set-password');
  });

  it('leaves the merely-destructive ones with the instructor, who is the operator', () => {
    // Ban and delete were grantable once, for an operator to hand a support
    // desk. On a single-teacher stack the instructor IS the operator, so they
    // are in the baseline — and neither yields a credential.
    expect(roleHasPermission('owner', 'student:ban')).toBe(true);
    expect(roleHasPermission('owner', 'student:delete')).toBe(true);
  });

  it('cannot be reached by writing them through the API either', () => {
    // `PermissionGrantsService.replace` validates against this same list, so
    // the endpoint refuses them even if somebody hand-crafts the request.
    const allowed = new Set(grantablePermissions('owner'));

    for (const escalation of ['student:role-change', 'student:set-password', 'role:grant'] as const) {
      expectFor(escalation, allowed.has(escalation), false);
    }
  });
});
