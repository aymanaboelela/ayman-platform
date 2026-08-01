import { copy, formatCopy } from '@ayman/contracts';
import { adminGet } from '@/lib/admin-api';
import { z } from 'zod';
import { VerifyButton } from './verify-button';

const VerifyResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), brokenAtId: z.string() }),
]);

/** Above this, verification is a real table scan — gated behind an explicit
 *  button rather than run on every page load (Task 17 Step 5). */
const AUTO_VERIFY_ROW_LIMIT = 50_000;

function VerifyResult({ result }: { result: z.infer<typeof VerifyResultSchema> }) {
  if (result.ok) {
    return <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.audit.chainOk}</p>;
  }
  return (
    <div className="rounded-[var(--r-md)] border border-[color:var(--warn)] bg-[color-mix(in_oklch,var(--warn),transparent_92%)] p-3">
      <p className="text-[length:var(--fs-text-sm)] font-[var(--fw-medium)] text-fg">
        {copy.admin.audit.chainBroken}
      </p>
      <p className="mt-1 font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
        {formatCopy(copy.admin.audit.chainBrokenAt, { id: result.brokenAtId })}
      </p>
    </div>
  );
}

/** A Server Component so the common (small-table) case needs no client JS
 *  at all to show "the chain is intact". */
export async function VerifyBanner({ rowCount }: { rowCount: number }) {
  if (rowCount > AUTO_VERIFY_ROW_LIMIT) {
    return (
      <div className="mb-4 flex items-center justify-between gap-2 rounded-[var(--r-md)] border border-line bg-surface-2 p-3">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{copy.admin.audit.verifyHint}</p>
        <VerifyButton />
      </div>
    );
  }

  const result = await adminGet('/api/admin/audit/verify', VerifyResultSchema);

  return (
    <div className="mb-4 rounded-[var(--r-md)] border border-line-subtle p-3">
      <VerifyResult result={result} />
      {result.ok ? (
        <p className="mt-0.5 font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {formatCopy(copy.admin.audit.chainOkCount, { n: rowCount })}
        </p>
      ) : null}
    </div>
  );
}
