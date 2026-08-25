/**
 * Permissions are `resource:action` strings, checked against a role→permission
 * map — never role equality (Plan 2 Global Constraint #9 / Plan 6 Global
 * Constraint 7). `ROLE_PERMISSIONS` below is the *only* place a role name is
 * ever looked up; everywhere else (the guard, decorators, controllers) only
 * ever asks "does this role hold this permission?" via `roleHasPermission`,
 * never "is this role admin?".
 *
 * Each plan APPENDS its own permissions to this catalogue — it is never
 * replaced. Dropping an entry here would revoke it from every route that
 * carries it, and the only symptom would be 403s in production.
 *
 * Shape is strictly `^[a-z][a-z-]*:[a-z][a-z-]*$` — two segments, one colon.
 */
export const PERMISSIONS = [
  // student-facing (Plan 2)
  'course:read',
  'profile:read',
  'profile:write',
  // content authoring (Plan 3) — DO NOT DROP
  'course:create',
  'course:update',
  'course:publish',
  'course:delete',
  // Deliberately separate from 'course:read' above: that string is also held
  // by `student` (Plan 2, for the player/catalog read path), and
  // `CourseController`'s admin list/detail endpoints used to require it too
  // — so any signed-in student could call `GET /api/admin/courses` and
  // `GET /api/admin/courses/:id` and read every course's admin metadata
  // (draft titles, unpublished section/lesson trees, video external ids),
  // regardless of enrollment. Found by the Task 12 authorization matrix.
  // `course:read-admin` is admin-only (never granted to student) and is
  // what those two routes require now.
  'course:read-admin',
  'section:write',
  'section:reorder',
  'lesson:write',
  'lesson:reorder',
  'enrollment:read',
  'enrollment:create',
  // progress (Plan 4) — DO NOT DROP
  'progress:read',
  'progress:write',
  // quiz (Plan 5) — DO NOT DROP
  'question:read',
  'question:write',
  'quiz:read',
  'quiz:write',
  'quiz:attempt',
  'quiz:grade',
  'attempt:grade',
  'analytics:read',
  // admin shell (Plan 6)
  'admin:access',
  // platform configuration (Plan 6)
  'settings:read',
  'settings:write',
  'flags:read',
  'flags:write',
  'nav:read',
  'nav:write',
  'home:read',
  'home:write',
  'media:read',
  'media:write',
  'media:delete',
  'taxonomy:read',
  'taxonomy:write',
  'student:read',
  'student:write',
  'student:role-change',
  // Blocking and removing an account. Split from `student:write` — and from
  // each other — on the same principle as every other pair in this catalogue:
  // editing a student's year is an ordinary correction, locking them out is a
  // disciplinary act, and erasing them is irreversible. A moderator role added
  // later should plausibly hold `student:ban` and never `student:delete`, and
  // that is then one entry in `ROLE_PERMISSIONS` and zero route changes.
  'student:ban',
  'student:delete',
  'attempt:read',
  'attempt:unlock',
  'audit:read',
  // المساعد — the assistant's inbox. THREE permissions rather than one, even
  // though only `admin` holds any of them today: reading what students asked,
  // answering them, and declaring a thread finished are genuinely different
  // authorities. An assistant/moderator role added later that may read and
  // reply but not close is then one entry in `ROLE_PERMISSIONS` and zero route
  // changes — which is the whole reason this catalogue exists.
  'conversation:read',
  'conversation:reply',
  'conversation:close',
  // «رسايل م. أيمن» — auditing what the platform said in the instructor's name.
  //
  // Split from `conversation:read` rather than folded into it, and the split is
  // the substantive one on this list: reading what a student ASKED and reading
  // what was SENT UNDER YOUR NAME WITHOUT YOU are different authorities. A
  // support role that answers the inbox should plausibly hold the first and not
  // the second. There is deliberately no `outreach:send` to pair with it —
  // sending is caused by what students do, and the only human control over it
  // is `settings:write` (see `AdminOutreachController`).
  'outreach:read',
  // «نيوز». `news:publish` is split from `news:write` for the same reason
  // `course:publish` is split from `course:update`: fixing a typo and putting
  // a page on the public internet under the instructor's name are different
  // authorities, and a writer role added later should hold the first only.
  'news:read',
  'news:write',
  'news:publish',
  // Failures students actually saw. Split read from resolve for the same
  // reason every pair above is split: looking at what broke and declaring it
  // handled are different authorities, and a support role that may triage
  // without closing is then one entry in `ROLE_PERMISSIONS`.
  'diagnostics:read',
  'diagnostics:resolve',
  // التسويق — the only subsystem that speaks to people outside the platform.
  //
  // FOUR permissions, and the split matters more here than anywhere else in
  // this catalogue: writing a campaign, pressing «ابدأ» on it, and pairing the
  // phone it will be sent from are three genuinely different acts. Drafting is
  // reversible and private; starting puts a message on thousands of personal
  // phones under the instructor's name and cannot be recalled; linking the
  // device hands the platform the ability to speak AS him, on a number that is
  // his and not the company's.
  //
  // Nothing today holds any of these except `admin: '*'`. That is the point —
  // an assistant who may prepare a campaign and never start one is one entry
  // in `ROLE_PERMISSIONS` and zero route changes.
  'marketing:read',
  'marketing:write',
  'marketing:send',
  'marketing:device',
  // Vodafone Cash course subscriptions. `payment:submit` is self-scoped —
  // same principle as `progress:write`: every query it reaches resolves
  // through the caller's own userId, so holding it never lets a student
  // touch another student's submission. Split from the two admin
  // permissions for the same reason `conversation:read`/`conversation:reply`
  // is split: SEEING the review queue and DECIDING money in or out of it are
  // different authorities, and a support role added later should plausibly
  // hold the first and never the second.
  'payment:submit',
  'payment:read',
  'payment:review',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = 'admin' | 'student';

/**
 * `'*'` grants every permission, including ones added after this line was
 * written — that is deliberate. `permissionsForRole` materialises it into the
 * concrete catalogue for the client, which needs a list rather than a wildcard.
 *
 * `course:create`, `course:update`, `course:publish`, `course:delete`,
 * `section:write`, `section:reorder`, `lesson:write`, `lesson:reorder` and the
 * whole Plan 6 admin surface are held only through `admin: '*'` — nothing here
 * grants them to `student`, so adding an `editor` role later is one entry in
 * this map and zero changes anywhere else.
 */
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission> | '*'> = {
  admin: '*',
  // RECONCILED: this is the accumulated set from Plans 2–5. Keep it in sync
  // with the assertion in permissions.spec.ts; shrinking it is a silent
  // regression that only shows up as a 403 for a legitimate student.
  student: new Set<Permission>([
    'profile:read', // Plan 2
    'profile:write', // Plan 2
    'course:read', // Plan 2
    'enrollment:read', // Plan 3
    'enrollment:create', // Plan 3
    'progress:read', // Plan 4
    // Plan 4 — self-scoped only; every write resolves through an
    // ownership-scoped query, never a permission-level check, so holding this
    // does not let a student write another student's progress row.
    'progress:write',
    // Quiz (Plan 5). A student may read a quiz's public shape and run their
    // own sittings. Authoring, grading, unlocking and analytics are admin-only
    // and are never granted here.
    'quiz:read',
    'quiz:attempt',
    // Payments — submit a Vodafone Cash claim and read back your own.
    'payment:submit',
  ]),
};

const KNOWN_ROLES = new Set<string>(Object.keys(ROLE_PERMISSIONS));

function isKnownRole(role: string): role is Role {
  return KNOWN_ROLES.has(role);
}

/**
 * Whether `role` grants `permission`. An unrecognised or missing role holds
 * no permissions — fail closed, same principle as the guard's S12 handling.
 */
export function roleHasPermission(role: string | undefined | null, permission: string): boolean {
  if (!role || !isKnownRole(role)) return false;
  const granted = ROLE_PERMISSIONS[role];
  return granted === '*' || granted.has(permission as Permission);
}

/**
 * The concrete permission list for a role. The web app uses this to decide
 * what to *render*; it is never the authorization decision itself — that is
 * always the guard, on the server, per request.
 */
export function permissionsForRole(role: string | undefined | null): readonly Permission[] {
  if (!role || !isKnownRole(role)) return [];
  const granted = ROLE_PERMISSIONS[role];
  if (granted === '*') return PERMISSIONS;
  return PERMISSIONS.filter((permission) => granted.has(permission));
}
