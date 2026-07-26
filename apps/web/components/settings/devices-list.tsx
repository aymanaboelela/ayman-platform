'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SessionDeviceListSchema, copy, type SessionDevice } from '@ayman/contracts';
import { Badge, Button, Card, CardBody, Skeleton } from '@ayman/ui';
import { apiDelete, apiGet } from '@/lib/api';

/** Western digits everywhere, matching the rest of the app's phone/number
 * fields (e.g. the onboarding phone placeholder `01012345678`) rather than
 * introducing Eastern Arabic-Indic numerals in just this one place. */
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function DevicesList() {
  const router = useRouter();
  const [devices, setDevices] = useState<SessionDevice[] | null>(null);
  const [error, setError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/sessions', SessionDeviceListSchema)
      .then((result) => {
        if (!cancelled) setDevices(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(device: SessionDevice) {
    // The whole point of marking the current device distinctly: revoking IT
    // signs the student out of the very tab they're using right now. An
    // explicit confirmation is the guard against doing that by accident.
    if (device.isCurrent && !window.confirm(copy.settings.devices.revokeCurrentConfirm)) {
      return;
    }

    setRevokingId(device.id);
    try {
      await apiDelete(`/api/sessions/${device.id}`);
      if (device.isCurrent) {
        // The session cookie this page was using no longer authenticates
        // anything — the server already deleted it (Task 7's IDOR-safe
        // revoke path). Nothing left to do here but leave.
        router.replace('/login');
        return;
      }
      setDevices((current) => current?.filter((d) => d.id !== device.id) ?? null);
    } catch {
      setError(true);
    } finally {
      setRevokingId(null);
    }
  }

  if (error) {
    return <p className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">{copy.common.error}</p>;
  }

  if (devices === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (devices.length === 0) {
    return <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.settings.devices.empty}</p>;
  }

  return (
    <ul className="space-y-3">
      {devices.map((device) => (
        <li key={device.id}>
          <Card>
            <CardBody className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[length:var(--fs-text-base)] font-medium text-fg">
                    {device.deviceName}
                  </p>
                  {device.isCurrent && <Badge tone="accent">{copy.settings.devices.current}</Badge>}
                </div>
                <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                  {copy.settings.devices.loggedInAt} {formatDate(device.loggedInAt)}
                </p>
                <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
                  {copy.settings.devices.lastSeenAt} {formatDate(device.lastSeenAt)}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={revokingId === device.id}
                onClick={() => revoke(device)}
              >
                {revokingId === device.id
                  ? copy.settings.devices.revokePending
                  : copy.settings.devices.revoke}
              </Button>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
