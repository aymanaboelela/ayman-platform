'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { changeRoleAction, type ActionResult } from '../actions';

const IDLE: ActionResult = { ok: true };

/**
 * Its own card, its own form, its own endpoint (A4). A role change is never
 * a field on the profile-patch form above — the API's `AdminStudentPatchSchema`
 * does not even have a `role` key, so this is the only path that can change
 * one, and it always requires a reason that lands in the audit trail.
 */
export function RoleChangeSection({ student }: { student: AdminStudentDetail }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    (_previous, formData) => changeRoleAction(student.id, formData),
    IDLE,
  );

  useEffect(() => {
    if (state.ok && formRef.current) {
      setOpen(false);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.admin.students.currentRole}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Badge tone={student.role === 'admin' ? 'accent' : 'neutral'}>
          {student.role === 'admin' ? copy.admin.students.roleAdmin : copy.admin.students.roleStudent}
        </Badge>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary">
              {copy.admin.students.changeRole}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={copy.admin.common.close}>
            <DialogHeader>
              <DialogTitle>{copy.admin.students.roleChangeTitle}</DialogTitle>
              <DialogDescription>{student.fullName}</DialogDescription>
            </DialogHeader>

            <form ref={formRef} action={action} className="space-y-3">
              <div>
                <Label htmlFor="role">{copy.admin.students.roleChangeNewRole}</Label>
                <Select
                  id="role"
                  name="role"
                  defaultValue={student.role === 'admin' ? 'student' : 'admin'}
                >
                  <option value="student">{copy.admin.students.roleStudent}</option>
                  <option value="admin">{copy.admin.students.roleAdmin}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="reason">{copy.admin.students.roleChangeReason}</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  minLength={8}
                  maxLength={500}
                  required
                  placeholder={copy.admin.students.roleChangeReasonPlaceholder}
                />
              </div>

              {!state.ok ? (
                <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
                  {state.message}
                </p>
              ) : null}

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    {copy.admin.actions.cancel}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? copy.admin.actions.saving : copy.admin.students.roleChangeConfirm}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardBody>
    </Card>
  );
}
