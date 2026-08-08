'use client';

import { useActionState } from 'react';
import type { AdminGrantRow } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts';
import { Button, Card, CardBody, CardHeader, CardTitle, Label, Select } from '@ayman/ui';
import { grantCourseAction, revokeGrantAction, type ActionResult } from '../actions';

const c = copy.admin.students;
const IDLE: ActionResult = { ok: true };

export interface ClosedCourse {
  id: string;
  title: string;
}

/**
 * Which closed courses this student may open — and the control that decides it.
 *
 * ## Why this panel exists at all
 *
 * `Course.requiresGrant` shuts a course to everyone who has not been given it.
 * Without a way to give it, closing a course would be a one-way door: no
 * student could ever enter it again, including the ones the instructor closed
 * it FOR. This is the key to that lock, and it is the reason the flag and this
 * panel ship together rather than the flag going out first.
 *
 * ## Why only closed courses are listed
 *
 * A grant on an open course is a no-op — the platform-wide grant already opens
 * it, so issuing one changes nothing and only leaves a row implying it did.
 * Offering every course here would make the useless case the common one.
 *
 * ## Why a revoked grant stays on screen
 *
 * "Why can't this student open the course any more?" is only answerable if the
 * revoked row is visible. A list that dropped them would make a removal
 * indistinguishable from a grant that was never issued — which is exactly the
 * difference `resolveCourseAccess` goes out of its way to report (`revoked` vs
 * `no_grant`).
 */
export function CourseAccessSection({
  userId,
  grants,
  closedCourses,
}: {
  userId: string;
  grants: AdminGrantRow[];
  closedCourses: ClosedCourse[];
}) {
  const [grantState, grantForm, granting] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => grantCourseAction(userId, formData),
    IDLE,
  );

  const live = grants.filter((grant) => grant.revokedAt === null);
  const heldIds = new Set(live.map((grant) => grant.courseId));
  // A course this student already has must not be offered again — the API
  // returns the existing grant rather than duplicating it, so the option would
  // simply do nothing.
  const offerable = closedCourses.filter((course) => !heldIds.has(course.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.courseAccess}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.courseAccessLead}</p>

        {grants.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.courseAccessEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-2 p-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[length:var(--fs-text-sm)] text-fg">
                    {grant.courseTitle}
                  </span>
                  <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
                    {grant.revokedAt === null ? c.grantLive : c.grantRevoked}
                  </span>
                </span>

                {grant.revokedAt === null ? (
                  <form action={() => void revokeGrantAction(userId, grant.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {c.revokeGrant}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {closedCourses.length === 0 ? (
          // Nothing is closed, so there is nothing to open. Said out loud
          // rather than shown as an empty select, which reads as a bug.
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noClosedCourses}</p>
        ) : offerable.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.allClosedGranted}</p>
        ) : (
          <form action={grantForm} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor="grant-course">{c.grantCourse}</Label>
              <Select id="grant-course" name="courseId" defaultValue={offerable[0]?.id}>
                {offerable.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={granting}>
              {c.grantOpen}
            </Button>
          </form>
        )}

        {grantState.ok ? null : (
          <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
            {copy.admin.common.saveFailed}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
