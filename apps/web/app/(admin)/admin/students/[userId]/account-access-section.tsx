'use client';

import { useActionState, useState } from 'react';
import {
  deleteIdentityMatches,
  expectedDeleteIdentity,
  type AdminStudentDetail,
} from '@ayman/contracts/admin/students';
import { formatCopy } from '@ayman/contracts/format';
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
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  banStudentAction,
  deleteStudentAction,
  unbanStudentAction,
  type ActionResult,
} from '../actions';

const IDLE: ActionResult = { ok: true };
const c = copy.admin.students;

/**
 * حالة الحساب — ban, unban, and delete.
 *
 * ## Why these three live in one card and not beside the profile form
 *
 * They are the only controls on this screen that act on the ACCOUNT rather
 * than on the student's data, and two of the three are destructive. Mixing
 * them into `<StudentDetailForm>` would put «مسح الحساب» one tab-stop away
 * from «حفظ», which is how an operator deletes a student they meant to
 * rename. Grouping them also lets the card carry the current state — an
 * operator opening a banned student's page sees «موقوف» and the reason at the
 * top of this card, not buried in a field.
 *
 * ## Why delete is not simply a second button here
 *
 * It is, visually, but its dialog is deliberately harder to complete than the
 * ban dialog: it demands the account's own email typed out, and its confirm
 * button stays disabled until that matches. The id in the URL is unreadable,
 * so retyping the email is the only step in the flow that carries information
 * about WHICH account is about to be erased. The API enforces the same check
 * (`AdminStudentDeleteSchema` + `StudentsService.remove`), so this is a second
 * line rather than the only one.
 */
export function AccountAccessSection({ student }: { student: AdminStudentDetail }) {
  const banned = student.bannedAt !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.accessTitle}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="space-y-2">
          <Badge tone={banned ? 'err' : 'ok'}>{banned ? c.accessBanned : c.accessActive}</Badge>

          {banned ? (
            <div className="space-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              <p>
                {formatCopy(c.bannedSince, {
                  // `ar-EG` with an explicit calendar: the default for this
                  // locale in some runtimes is Islamic, and an admin comparing
                  // this against a WhatsApp message needs the Gregorian date
                  // they were sent.
                  date: new Date(student.bannedAt as string).toLocaleDateString('ar-EG-u-ca-gregory', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                })}
                {student.bannedByName
                  ? ` · ${formatCopy(c.bannedBy, { name: student.bannedByName })}`
                  : null}
              </p>
              {student.bannedReason ? (
                <p>
                  <span className="text-fg-faint">{c.bannedReasonLabel}: </span>
                  {student.bannedReason}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {banned ? <UnbanDialog student={student} /> : <BanDialog student={student} />}
          <DeleteDialog student={student} />
        </div>
      </CardBody>
    </Card>
  );
}

function BanDialog({ student }: { student: AdminStudentDetail }) {
  const [open, setOpen] = useState(false);
  /*
   * The dialog closes from INSIDE the action, not from a `useEffect` watching
   * `state`. The effect version is the obvious shape and it is wrong twice
   * over: `IDLE` is `{ ok: true }`, so `state.ok` is already true on the very
   * first render and the effect fires on MOUNT — closing a dialog the operator
   * has only just opened — and React flags the synchronous `setState` inside
   * an effect as a cascading render (`react-hooks`, which fails lint here).
   *
   * Setting state inside the async action body runs after the await, outside
   * both render and effect, so it is neither.
   */
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const result = await banStudentAction(student.id, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          {c.ban}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.banTitle}</DialogTitle>
          <DialogDescription>{student.fullName}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-3">
          <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.banBody}</p>

          <div>
            <Label htmlFor="ban-reason">{c.banReason}</Label>
            <Textarea
              id="ban-reason"
              name="reason"
              minLength={8}
              maxLength={500}
              required
              placeholder={c.banReasonPlaceholder}
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
              {pending ? copy.admin.actions.saving : c.banConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnbanDialog({ student }: { student: AdminStudentDetail }) {
  const [open, setOpen] = useState(false);
  // Closed from inside the action, for the reason recorded in `BanDialog`.
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async () => {
      const result = await unbanStudentAction(student.id);
      if (result.ok) setOpen(false);
      return result;
    },
    IDLE,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">{c.unban}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.unbanTitle}</DialogTitle>
          <DialogDescription>{student.fullName}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-3">
          <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
            {c.unbanBody}
          </p>

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
              {pending ? copy.admin.actions.saving : c.unbanConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ student }: { student: AdminStudentDetail }) {
  const [open, setOpen] = useState(false);
  const [confirmIdentity, setConfirmIdentity] = useState('');
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    (_previous, formData) => deleteStudentAction(student.id, formData),
    IDLE,
  );

  /**
   * The string the server will compare against, derived by the SAME shared
   * function the server uses (`expectedDeleteIdentity`) rather than
   * re-implemented here. If the two ever disagreed, this dialog would be
   * impossible to pass and would say nothing about why.
   *
   * Phone when there is one, email otherwise, and never the synthesised
   * placeholder — see that function.
   */
  const expected = expectedDeleteIdentity({ phone: student.phone, email: student.email });

  // Literally the same function the server calls (`StudentsService.remove`),
  // not a re-implementation of it — trimmed and case-insensitive for an
  // email, and for a phone it accepts every way this platform writes the
  // number, `01223334567` as readily as the stored `+201223334567`. The
  // students table, the header above and the shipping sheet all print the
  // local form, so retyping what you were just looking at used to be refused
  // by a dialog whose hint showed a different string.
  //
  // `expected === null` (an account with no human-readable identifier at all)
  // leaves this permanently false, which fails closed — the same thing the
  // server does.
  const matches = deleteIdentityMatches(confirmIdentity, expected);

  // NOTE: no `useEffect` closing this dialog on success, unlike the two above.
  // A successful delete `redirect()`s to /admin/students, so this component
  // unmounts with the page — there is nothing left to close, and calling
  // `setOpen(false)` on an unmounting tree is how you get a stray state
  // update warning for no benefit.

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="danger">
          {c.delete}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.deleteTitle}</DialogTitle>
          <DialogDescription>{student.fullName}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-3">
          <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
            {c.deleteBody}
          </p>

          <div>
            <Label htmlFor="delete-confirm-identity">{c.deleteConfirmIdentityLabel}</Label>
            <Input
              id="delete-confirm-identity"
              name="confirmIdentity"
              type="text"
              required
              autoComplete="off"
              // `dir="ltr"` on an address or an E.164 number inside an RTL
              // document, or the bidi algorithm reorders it while the operator
              // is trying to compare it character by character against the
              // hint below.
              dir="ltr"
              value={confirmIdentity}
              onChange={(event) => setConfirmIdentity(event.target.value)}
              aria-describedby="delete-confirm-identity-hint"
            />
            <p
              id="delete-confirm-identity-hint"
              dir="ltr"
              className="mt-1 text-[length:var(--fs-text-xs)] text-fg-faint"
            >
              {formatCopy(c.deleteConfirmIdentityHint, { identity: expected ?? '' })}
            </p>
          </div>

          <div>
            <Label htmlFor="delete-reason">{c.deleteReason}</Label>
            <Textarea
              id="delete-reason"
              name="reason"
              minLength={8}
              maxLength={500}
              required
              placeholder={c.deleteReasonPlaceholder}
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
            {/* Disabled until the email matches. The server checks it too — this
                is the half that stops the operator BEFORE the request, which is
                the only half that can still be undone by pressing cancel. */}
            <Button type="submit" variant="danger" disabled={pending || !matches}>
              {pending ? copy.admin.actions.saving : c.deleteConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
