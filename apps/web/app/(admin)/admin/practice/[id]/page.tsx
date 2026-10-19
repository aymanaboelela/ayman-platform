import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, ExternalLink, FileQuestion, GraduationCap, Hash } from 'lucide-react';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { AdminPracticeSetDetailSchema } from '@ayman/contracts/practice';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { PasteQuestionsDialog } from '@/components/admin/practice/paste-questions-dialog';
import { SetMetaForm } from '@/components/admin/practice/set-meta-form';
import { SetQuestionsPanel } from '@/components/admin/practice/set-questions-panel';
import { publicPracticeHref, questionCount, unitHue, unitOf } from '@/components/admin/practice/practice-model';
import '@/components/admin/practice/practice-admin.css';

export const metadata = { title: c.title };

/**
 * One set's editor — `/admin/practice/{id}`.
 *
 * The band names the lesson and carries the two ways to fill it plus its
 * public link; the questions take the wide column, the lesson's own fields
 * and the publish switch the narrow one (sticky on a desktop, under the list
 * on a phone).
 *
 * `adminGetOrNotFound`: a set deleted from another tab is «مش موجود», not a
 * crash (see the helper's note).
 */
export default async function AdminPracticeSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const set = await adminGetOrNotFound(
    `/api/admin/practice/sets/${encodeURIComponent(id)}`,
    AdminPracticeSetDetailSchema,
  );
  const questions = [...set.questions].sort((a, b) => a.position - b.position);
  const publicHref = publicPracticeHref(set.year, set.track, set.lessonCode);

  return (
    <div style={{ '--unit-h': unitHue(unitOf(set.lessonCode)) } as CSSProperties}>
      <section className="stage">
        <div className="stage__body">
          <Link href="/admin/practice" className="stage__back">
            <ArrowRight className="size-4" aria-hidden="true" />
            {c.editor.back}
          </Link>
          <h1 className="stage__title">{set.title}</h1>
          <div className="stage__facts">
            <span className="stage__fact">
              <GraduationCap className="size-4" aria-hidden="true" />
              {c.years[set.year]} · {c.tracks[set.track]}
            </span>
            <span className="stage__fact">
              <Hash className="size-4" aria-hidden="true" />
              {c.lessonCode}{' '}
              <span dir="ltr" className="[unicode-bidi:isolate]">
                {set.lessonCode}
              </span>
            </span>
            <span className="stage__fact">
              <FileQuestion className="size-4" aria-hidden="true" />
              {questionCount(questions.length)}
            </span>
            <span className="stage__fact">{set.published ? c.published : c.draft}</span>
          </div>
          <div className="prx-hero__actions">
            <PasteQuestionsDialog setId={set.id} triggerClassName="prx-hero__secondary" />
            <a href={publicHref} target="_blank" rel="noopener" className="prx-hero__secondary">
              <ExternalLink className="size-5" aria-hidden="true" />
              {c.actions.openPage}
            </a>
          </div>
        </div>
      </section>

      <div className="prx-layout">
        <SetQuestionsPanel setId={set.id} questions={questions} />
        <aside className="prx-side">
          <SetMetaForm set={set} />
        </aside>
      </div>
    </div>
  );
}
