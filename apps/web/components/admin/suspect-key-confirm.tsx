'use client';

import { useState, useTransition } from 'react';
import { CheckCheck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { confirmSuspectKeyAction } from './suspect-keys-actions';

const c = copy.quizAdmin;

/**
 * «الإجابة المتسجّلة صح» on one band row. The row leaves when the action's
 * `revalidatePath` re-renders the band; a failure stays on the row, worded,
 * instead of looking like a click that did nothing.
 */
export function SuspectKeyConfirm({ questionVersionId }: { questionVersionId: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <span className="keyband__confirm-wrap">
      <button
        type="button"
        className="keyband__confirm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            const result = await confirmSuspectKeyAction(questionVersionId);
            if (!result.ok) setFailed(true);
          })
        }
      >
        <CheckCheck className="size-4" aria-hidden="true" />
        {c.suspectKeyConfirm}
      </button>
      {failed ? (
        <span role="alert" className="keyband__confirm-failed">
          {c.suspectKeyConfirmFailed}
        </span>
      ) : null}
    </span>
  );
}
