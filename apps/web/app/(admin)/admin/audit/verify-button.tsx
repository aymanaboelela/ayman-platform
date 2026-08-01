'use client';

import { useState } from 'react';
import { z } from 'zod';
import { copy, formatCopy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { apiGet } from '@/lib/api';

const VerifyResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), brokenAtId: z.string() }),
]);

/**
 * The manual-verify path for a large chain — this is a real scan of every
 * row, so it runs only on an explicit click, never on page load (Task 17
 * Step 5's "do not auto-verify past 50,000 rows").
 */
export function VerifyButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    setPending(true);
    try {
      const result = await apiGet('/api/admin/audit/verify', VerifyResultSchema);
      setMessage(
        result.ok
          ? copy.admin.audit.chainOk
          : `${copy.admin.audit.chainBroken} — ${formatCopy(copy.admin.audit.chainBrokenAt, { id: result.brokenAtId })}`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message ? <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{message}</p> : null}
      <Button type="button" variant="secondary" onClick={() => void verify()} disabled={pending}>
        {pending ? copy.admin.audit.verifying : copy.admin.audit.verifyButton}
      </Button>
    </div>
  );
}
