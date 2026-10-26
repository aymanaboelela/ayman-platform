import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StudentBacklogSchema, type StudentBacklog } from '@ayman/contracts/backlog';
import { backlogCopy } from '@ayman/contracts/copy/backlog';
import { BacklogBoard } from '@/components/backlog/backlog-board';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { IS_AYMAN } from '@/lib/tenant';
import '@/components/backlog/backlog.css';

const c = backlogCopy;

export const metadata: Metadata = { title: c.meta.title };

/**
 * «المتراكم» — every lecture, quiz and homework this student could do now and
 * hasn't, grouped by course, with a button on every row.
 *
 * Ayman's stack only. Checked HERE as well as in the API so another stack
 * never even makes the request: no rail entry points here there, and a typed
 * URL gets the same «مش موجود» as any route that does not exist.
 */
export default async function BacklogPage() {
  if (!IS_AYMAN) notFound();

  let backlog: StudentBacklog;
  try {
    backlog = await apiGetAuthed('/api/me/backlog', StudentBacklogSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <header className="study-head">
        <p className="eyebrow mb-2 text-fg-muted">{c.page.eyebrow}</p>
        <h1 className="study-head__title">{c.page.title}</h1>
        <p className="study-head__lead">{c.page.lead}</p>
      </header>
      <BacklogBoard backlog={backlog} />
    </main>
  );
}
