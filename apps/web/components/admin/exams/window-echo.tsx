'use client';

import { useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { formatCairo, fromLocalInputValue } from './exam-time';

/** Nothing to subscribe to — the question is «هل احنا في المتصفح؟», which is
 *  answered once by hydration and never changes after. Same device
 *  `assistant-widget.tsx` and `admin/command-palette.tsx` already use. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * ⚠️ THE ECHO LINE. The cheapest defence against the one mistake on this screen
 * that cannot be undone.
 *
 * A `datetime-local` input carries no timezone: it shows, and returns, the
 * BROWSER's wall clock. The exam is sat on Cairo's. So under each of the two
 * fields this prints the instant he has actually chosen, back, in Cairo —
 * «يعني الجمعة 12 سبتمبر 20:00 بتوقيت القاهرة».
 *
 * If those two lines agree with what he typed, the window is right. If they do
 * not, he is on a machine that is not on Cairo time, and he finds that out HERE
 * rather than at 20:01 when a cohort cannot get in and the whole thing looks
 * like a broken deploy.
 *
 * ## Why it waits for hydration
 *
 * `fromLocalInputValue` is `new Date(naiveString)`, which resolves against
 * whatever timezone the JS runtime is in. During SSR that is the container's,
 * not the admin's — so a server-rendered echo would print a DIFFERENT hour for
 * a beat before hydration corrected it. A confident, wrong time flashed on the
 * one control whose whole job is to be trusted about the time is worse than a
 * beat of nothing; the field above it is legible throughout, and this line is
 * the check on it, not the value.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`, which
 * `react-hooks/set-state-in-effect` rejects for a good reason: an effect that
 * immediately re-renders is a commit the user can sometimes see.
 */
export function WindowEcho({ value }: { value: string }) {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    // The server cannot know the reader's clock, which is the point.
    () => false,
  );
  if (!hydrated) return null;

  const at = fromLocalInputValue(value);
  // An empty field has nothing to confirm, and a half-typed one would otherwise
  // render «Invalid Date بتوقيت القاهرة».
  if (!at || Number.isNaN(at.getTime())) return null;

  return (
    <p className="mt-1.5 text-[length:var(--fs-text-sm)] text-accent-text">
      {formatCopy(copy.admin.monthlyExams.windowEcho, { when: formatCairo(at) })}
    </p>
  );
}
