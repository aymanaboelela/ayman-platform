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

  it('can SEE its own students money and messages, and move neither', () => {
    /*
     * The line moved once, deliberately, and this is where it sits now.
     *
     * `payment:read` and `conversation:read` used to be on the forbidden list
     * below, on the reasoning that money belongs to whoever operates the
     * platform rather than to the teaching. That reasoning describes a stack
     * with an operator AND instructors on it. On a single-teacher stack it
     * describes somebody who is not there: the instructor IS the business, the
     * subscriptions are their revenue and the messages are addressed to them.
     *
     * ⚠️ What actually forced it: the escape hatch was welded shut. These were
     * documented as grantable, but `role:grant` is not in the owner set either
     * and there is no second account on those stacks — so nobody could ever
     * grant them. Measured on both live instructor stacks:
     * `GET /api/admin/roles/owner/permissions` answered 403. And the student
     * page reads both routes, so every student on both platforms opened to a
     * dead screen.
     */
    for (const permission of ['payment:read', 'conversation:read'] as const) {
      expectFor(permission, roleHasPermission('owner', permission), true);
    }

    // READING is the whole of it. Approving a payment moves money and closing
    // a thread ends somebody's complaint — different authorities, still shut.
    for (const permission of ['payment:review', 'conversation:close'] as const) {
      expectFor(permission, roleHasPermission('owner', permission), false);
    }
  });

  it('cannot touch the books, the audit trail, or the platform itself', () => {
    // The split the role exists for: what is theirs to run, against what
    // belongs to whoever operates the platform. Everything here is either
    // about OTHER people's stacks, or a record that must not be editable by
    // the person it is a record of.
    for (const permission of [
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
  /*
   * ⚠️ `audit:read`, not `payment:read`, and the swap is the point.
   *
   * These cases need a permission the owner baseline genuinely does NOT hold,
   * and `payment:read` stopped being one when the instructor was given sight
   * of their own students' subscriptions. A test that grants something already
   * held still goes green — it just stops testing granting.
   */
  it('opens a permission the baseline does not hold', () => {
    expect(roleHasPermission('owner', 'audit:read')).toBe(false);

    grant('owner', 'audit:read');

    expect(roleHasPermission('owner', 'audit:read')).toBe(true);
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
    grant('owner', 'audit:read');
    setRuntimeGrants(new Map());

    expect(roleHasPermission('owner', 'audit:read')).toBe(false);
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
    /*
     * `payment:read` is NOT in this list any more, and its absence is correct
     * rather than an omission: the owner baseline now holds it, and the case
     * below («never offers something the role already has») is what takes it
     * out. Approving a payment is still here — seeing the money and moving it
     * are the two different authorities that split was always about.
     */
    for (const permission of [
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

  it('still offers the merely-destructive ones, which are a real decision', () => {
    // Ban and delete stay grantable on purpose: an operator who ticks them has
    // decided a support desk may use them, and neither yields a credential.
    const grantable = grantablePermissions('owner');

    expect(grantable).toContain('student:ban');
    expect(grantable).toContain('student:delete');
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
