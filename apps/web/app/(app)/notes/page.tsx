import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NotebookSchema } from '@ayman/contracts/engagement';
import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { NotebookBoard } from '@/components/engagement/notebook';
import { EngagementHead, readOr404 } from '@/components/engagement/page-shell';
import { featureEnabled } from '@/lib/entitlements';
import '@/components/engagement/engagement.css';

const c = engagementCopy.notes;

export const metadata: Metadata = { title: c.meta.title };

/** «ملاحظاتي» — behind `lessonNotes`; the API answers 404 without it, and so does this page. */
export default async function NotesPage() {
  if (!(await featureEnabled('lessonNotes'))) notFound();
  const notebook = await readOr404('/api/me/notes', NotebookSchema);
  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <EngagementHead {...c.page} />
      <NotebookBoard notebook={notebook} />
    </main>
  );
}
