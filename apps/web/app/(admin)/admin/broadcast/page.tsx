import { copy } from '@ayman/contracts/copy/admin';
import { BroadcastForm } from './broadcast-form';

const c = copy.admin.broadcast;

export const metadata = { title: c.title };

/**
 * `/admin/broadcast` — the instructor's own words, sent on purpose.
 *
 * See `AdminBroadcastController`'s header for why this is a route of its
 * own rather than a button added to `/admin/outreach`: that screen's whole
 * design argues against a "send to everyone" control living beside its own
 * automated log, and this page is that control, named for what it is.
 */
export default function AdminBroadcastPage() {
  return (
    <>
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
          {c.eyebrow}
        </p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
      </header>

      <BroadcastForm />
    </>
  );
}
