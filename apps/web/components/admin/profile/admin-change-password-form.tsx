'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { changeAdminPasswordAction } from '@/app/(admin)/admin/profile/actions';

const c = copy.admin.profile;

export function AdminChangePasswordForm() {
  const [isPending, startTransition] = useTransition();

  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError(c.currentPasswordPlaceholder);
      return;
    }

    if (newPassword.length < 8) {
      setError(c.passwordTooShort);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(c.passwordMismatch);
      return;
    }

    startTransition(async () => {
      const result = await changeAdminPasswordAction({
        currentPassword,
        newPassword,
        revokeOtherSessions,
      });

      if (result.ok) {
        toast.success(result.message ?? c.passwordChanged);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(result.message);
        toast.error(result.message);
      }
    });
  }

  return (
    <Card className="border-line bg-surface-2">
      <CardHeader className="flex flex-row items-center gap-2">
        <KeyRound className="size-5 text-accent" aria-hidden="true" />
        <CardTitle>{c.changePassword}</CardTitle>
      </CardHeader>
      <CardBody>
        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current-password" className="mb-1.5 block">
              {c.currentPassword}
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={c.currentPasswordPlaceholder}
                autoComplete="current-password"
                required
                disabled={isPending}
                dir="ltr"
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                className="absolute inset-y-0 end-0 flex items-center justify-center px-3 text-fg-muted transition-colors hover:text-fg"
                aria-label={showCurrent ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="new-password" className="mb-1.5 block">
              {c.newPassword}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={c.newPasswordPlaceholder}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                disabled={isPending}
                dir="ltr"
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="absolute inset-y-0 end-0 flex items-center justify-center px-3 text-fg-muted transition-colors hover:text-fg"
                aria-label={showNew ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.passwordTooShort}
            </p>
          </div>

          <div>
            <Label htmlFor="confirm-password" className="mb-1.5 block">
              {c.confirmPassword}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={c.confirmPasswordPlaceholder}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                disabled={isPending}
                dir="ltr"
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute inset-y-0 end-0 flex items-center justify-center px-3 text-fg-muted transition-colors hover:text-fg"
                aria-label={showConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1/40 p-3">
            <Checkbox
              id="revoke-sessions"
              checked={revokeOtherSessions}
              onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
              disabled={isPending}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <label
                htmlFor="revoke-sessions"
                className="text-[length:var(--fs-text-sm)] font-medium text-fg cursor-pointer"
              >
                {c.revokeOtherSessions}
              </label>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                {c.revokeOtherSessionsHint}
              </p>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-err/30 bg-err/10 p-2.5 text-[length:var(--fs-text-xs)] text-err">
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? copy.admin.actions.saving : c.changePassword}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
