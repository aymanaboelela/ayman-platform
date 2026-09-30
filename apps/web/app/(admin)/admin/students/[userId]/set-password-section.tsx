'use client';

import { useActionState, useState } from 'react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
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
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { setStudentPasswordAction, type ActionResult } from '../actions';

const IDLE: ActionResult = { ok: true };
const c = copy.admin.students;

/**
 * تعيين كلمة سر جديدة — never «عرض كلمة السر». Passwords are Argon2id hashes
 * (`ARGON2_OPTIONS`, same as every other credential on this platform) — there
 * is nothing to read back, only something to overwrite.
 *
 * Its own card, its own dialog, its own endpoint — same shape as
 * `RoleChangeSection` and for the same reason: a credential reset is not a
 * field on the profile-patch form, so `AdminStudentPatchSchema` never carries
 * one, and this is the only path that can change one.
 *
 * Closed from INSIDE the action on success, not from a `useEffect` watching
 * `state` — `IDLE` is `{ ok: true }`, so `state.ok` is already true on the
 * very first render and an effect version would close a dialog the operator
 * has only just opened. Same pattern as `BanDialog`/`UnbanDialog`.
 *
 * ⚠️ STUDENTS ONLY, and not a tidiness choice — `StudentsService.setPassword`
 * refuses any other role, on purpose: it rewrites an Argon2 hash from a user
 * id with no check of its own on WHOSE, so a screen that let this run on an
 * `owner` row would be handing the operator a working credential for the
 * platform operator's own account. The API comment carries the full argument.
 *
 * This card standing down for a non-student target is the SAME decision
 * stated twice, not a redundant one: the list search that reaches this page
 * matches staff accounts too (`/admin/students?q=` is not student-scoped),
 * so an operator can land here on «مستر محمد عادل» — the platform's own
 * seeded admin — by typing his name. Showing the button and letting the API
 * refuse it read as broken: «مقدرناش نغيّر كلمة السر — نحاول تاني» names a
 * transient failure, and retrying can never succeed. Not rendering the card
 * at all is the honest screen — there is nothing to retry.
 */
export function SetPasswordSection({ student }: { student: AdminStudentDetail }) {
  // Hooks run unconditionally, ABOVE the role check below — the rule a
  // conditional `return` before a hook call would break.
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const result = await setStudentPasswordAction(student.id, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    IDLE,
  );

  if (student.role !== 'student') return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.setPasswordTitle}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.setPasswordLead}</p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary">
              {c.setPasswordAction}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={copy.admin.common.close}>
            <DialogHeader>
              <DialogTitle>{c.setPasswordDialogTitle}</DialogTitle>
              <DialogDescription>{student.fullName}</DialogDescription>
            </DialogHeader>

            <form action={action} className="space-y-3">
              <div>
                <Label htmlFor="newPassword">{c.setPasswordNewLabel}</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">{c.setPasswordConfirmLabel}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
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
                  {pending ? copy.admin.actions.saving : c.setPasswordConfirm}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardBody>
    </Card>
  );
}
