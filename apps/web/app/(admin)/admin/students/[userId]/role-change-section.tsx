'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { AdminStudentDetail } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
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
  /*
   * الوصف بيتغيّر مع الاختيار، وده مش زينة.
   *
   * «مسؤول» و«مساعد» جنب بعض في قايمة، والفرق بينهم إن واحد بيوصل للفلوس
   * ومسح الحسابات والتاني لأ — وده مش حاجة يتوقعها اللي بيقرا الاسمين. سطر
   * تحت القايمة بيقول اللي إنت على وشك تديه، **قبل** ما تدوس.
   */
  const [role, setRole] = useState(student.role === 'admin' ? 'student' : 'admin');
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
        {/* تلات حالات، مش اتنين: الشرط القديم كان `admin ? … : طالب`، فالمساعد
            كان بيتعرض على إنه **طالب** — والصفحة تقول حاجة والحساب حاجة
            تانية. ماكانش بيبان قبل كده لأن الرول مكانش ينفع يتعمل من هنا
            أصلًا. */}
        <Badge tone={student.role === 'student' ? 'neutral' : 'accent'}>
          {student.role === 'admin'
            ? copy.admin.students.roleAdmin
            : student.role === 'owner'
              ? copy.admin.students.roleOwner
              : copy.admin.students.roleStudent}
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
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <option value="student">{copy.admin.students.roleStudent}</option>
                  {/* ⚠️ `owner` كان مخفي، والنتيجة إن الاختيار الوحيد لإضافة
                      مساعد كان «أدمن» — يعني **كل** الصلاحيات: الفلوس،
                      الاستردادات، مسح الطلبة، الباسوردات، سجل التدقيق.

                      الباكند بيقبله من الأول (`AdminRoleChangeSchema`)،
                      والرول نفسه مكتوب بعناية في `permissions.ts` — صلاحيات
                      التدريس بس، ومن غير أي حاجة لا رجعة فيها ولا خاصة
                      بالفلوس. الشاشة هي اللي كانت بتخفي الاختيار الآمن. */}
                  <option value="owner">{copy.admin.students.roleOwner}</option>
                  <option value="admin">{copy.admin.students.roleAdmin}</option>
                </Select>
                {role === 'admin' || role === 'owner' ? (
                  <p
                    className={cn(
                      'mt-1 text-[length:var(--fs-text-xs)]',
                      role === 'admin' ? 'text-err' : 'text-fg-muted',
                    )}
                  >
                    {role === 'admin'
                      ? copy.admin.students.roleAdminHint
                      : copy.admin.students.roleOwnerHint}
                  </p>
                ) : null}
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
