'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { AdminProfile } from '@ayman/contracts/admin/profile';
import { copy } from '@ayman/contracts/copy/admin';
import { adminAccount } from '@ayman/contracts/copy/admin-account';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { updateAdminProfileAction } from '@/app/(admin)/admin/profile/actions';

const c = copy.admin.profile;

export function AdminProfileForm({ profile }: { profile: AdminProfile }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(profile.name);
  const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError(adminAccount.nameTooShort);
      return;
    }

    startTransition(async () => {
      const result = await updateAdminProfileAction({
        name: trimmedName,
        phoneNumber: phoneNumber.trim() ? phoneNumber.trim() : null,
      });

      if (result.ok) {
        setError(null);
        toast.success(c.profileSaved, { id: 'admin-profile' });
      } else {
        setError(result.message);
        toast.error(result.message, { id: 'admin-profile' });
      }
    });
  }

  return (
    <Card className="border-line bg-surface-2">
      <CardHeader>
        <CardTitle>{c.editProfile}</CardTitle>
      </CardHeader>
      <CardBody>
        <form method="post" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="admin-name" className="mb-1.5 block">
              {c.name}
            </Label>
            <Input
              id="admin-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={adminAccount.nameRequiredHint}
              required
              minLength={2}
              maxLength={100}
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor="admin-phone" className="mb-1.5 block">
              {c.phone}
            </Label>
            <Input
              id="admin-phone"
              name="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+201xxxxxxxxx"
              dir="ltr"
              disabled={isPending}
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{adminAccount.phoneHint}</p>
          </div>

          <div>
            <Label htmlFor="admin-email" className="mb-1.5 block">
              {c.email}
            </Label>
            <Input
              id="admin-email"
              value={profile.email ?? adminAccount.emailMissing}
              readOnly
              disabled
              dir="ltr"
              className="bg-surface-3 opacity-80 cursor-not-allowed"
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{adminAccount.emailLocked}</p>
          </div>

          {error ? (
            <p role="alert" className="text-[length:var(--fs-text-xs)] text-err">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? copy.admin.actions.saving : c.saveProfile}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
