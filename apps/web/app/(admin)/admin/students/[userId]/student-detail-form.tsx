'use client';

import { useActionState } from 'react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { patchStudentAction, type ActionResult } from '../actions';

const IDLE: ActionResult = { ok: true };

function ActionError({ state }: { state: ActionResult }) {
  if (state.ok) return null;
  return (
    <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
      {state.message}
    </p>
  );
}

export function StudentDetailForm({
  student,
  governorateOptions,
}: {
  student: AdminStudentDetail;
  governorateOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    (_previous, formData) => patchStudentAction(student.id, formData),
    IDLE,
  );

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
            {copy.admin.students.profileSection}
          </h2>
          <Badge tone={student.onboardingCompleted ? 'accent' : 'neutral'}>
            {student.onboardingCompleted
              ? copy.admin.students.onboardingDone
              : copy.admin.students.onboardingPending}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
          <div>
            <dt className="text-fg-muted">{copy.admin.students.columnEmail}</dt>
            <dd className="text-fg">
              {student.email ?? (
                <span className="text-fg-faint">{copy.admin.students.emailNotGiven}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{copy.admin.students.memberSince}</dt>
            <dd className="text-fg">{new Date(student.createdAt).toLocaleDateString('ar-EG')}</dd>
          </div>
          {/* Printed even when null, unlike every other row here. The rest are
              "we may or may not have this"; a missing school stream is a
              student onboarded before the question existed, and «مش متسجّل» is
              the fact worth seeing — a row that simply vanishes reads as if
              nobody was ever asked. */}
          <div>
            <dt className="text-fg-muted">{copy.admin.students.schoolStream}</dt>
            <dd className="text-fg">
              {student.schoolStream
                ? copy.stream[student.schoolStream]
                : copy.admin.students.schoolStreamUnknown}
            </dd>
          </div>
          {student.fatherPhone ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.fatherPhone}</dt>
              <dd className="text-fg">{student.fatherPhone}</dd>
            </div>
          ) : null}
          {student.motherPhone ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.motherPhone}</dt>
              <dd className="text-fg">{student.motherPhone}</dd>
            </div>
          ) : null}
          {student.electiveSubjectNameAr ? (
            <div>
              <dt className="text-fg-muted">{copy.admin.students.electiveSubject}</dt>
              <dd className="text-fg">{student.electiveSubjectNameAr}</dd>
            </div>
          ) : null}
        </dl>

        <form action={action} className="max-w-[var(--w-prose)] space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fullName">{copy.admin.students.fullName}</Label>
              <Input id="fullName" name="fullName" defaultValue={student.fullName} required />
            </div>
            <div>
              <Label htmlFor="schoolName">{copy.admin.students.schoolName}</Label>
              <Input id="schoolName" name="schoolName" defaultValue={student.schoolName ?? ''} />
            </div>
            <div>
              <Label htmlFor="governorateCode">{copy.onboarding.governorate}</Label>
              <Select id="governorateCode" name="governorateCode" defaultValue={student.governorateCode}>
                {governorateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="year">{copy.admin.students.columnYear}</Label>
              <Select id="year" name="year" defaultValue={student.year ?? ''}>
                <option value="">—</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            </div>
          </div>

          <ActionError state={state} />

          <Button type="submit" disabled={pending}>
            {pending ? copy.admin.actions.saving : copy.admin.actions.save}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
