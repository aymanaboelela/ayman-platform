'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileQuestion, PencilLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { AdminPracticeSetRow } from '@ayman/contracts/practice';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { deletePracticeSet } from '@/app/(admin)/admin/practice/actions';
import { publicPracticeHref, questionCount, unitHue, unitOf } from './practice-model';
import { PublishSwitch } from './publish-switch';

/**
 * One lesson's set on `/admin/practice`: its code in the unit's colour, the
 * title, how many questions, live or draft — and every action on the card
 * itself, so nothing about a set needs a second screen to find.
 */
export function SetCard({ row }: { row: AdminPracticeSetRow }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await deletePracticeSet(row.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(c.deleteSet.done);
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const count = questionCount(row.questionCount);

  return (
    <article className="prx-card" style={{ '--unit-h': unitHue(unitOf(row.lessonCode)) } as CSSProperties}>
      <div className="prx-card__head">
        <span className="prx-code" aria-label={`${c.lessonCode} ${row.lessonCode}`}>
          {row.lessonCode}
        </span>
        <div className="prx-card__titles">
          <h4 className="prx-card__title">{row.title}</h4>
          {row.unitTitle ? <p className="prx-card__unit">{row.unitTitle}</p> : null}
        </div>
      </div>

      <div className="prx-card__body">
        <div className="prx-card__facts">
          <span className="prx-tag prx-tag--count">
            <FileQuestion className="size-3.5" aria-hidden="true" />
            {count}
          </span>
          <span className={row.published ? 'prx-tag prx-tag--published' : 'prx-tag prx-tag--draft'}>
            {row.published ? c.published : c.draft}
          </span>
          <span className="prx-updated">
            {formatCopy(c.updated, { date: new Date(row.updatedAt).toLocaleDateString('ar-EG-u-nu-latn') })}
          </span>
        </div>
        <PublishSwitch set={row} />
      </div>

      <div className="prx-card__foot">
        <Link href={`/admin/practice/${row.id}`} className="chip chip--solid">
          <PencilLine className="size-4" aria-hidden="true" />
          {c.actions.editQuestions}
        </Link>
        <a
          href={publicPracticeHref(row.year, row.track, row.lessonCode)}
          target="_blank"
          rel="noopener"
          className="chip chip--quiet"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          {c.actions.openPage}
        </a>
        <button type="button" className="chip prx-danger" onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" aria-hidden="true" />
          {c.actions.delete}
        </button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={c.actions.close}>
          <DialogHeader>
            <DialogTitle>{formatCopy(c.deleteSet.title, { title: row.title })}</DialogTitle>
            <DialogDescription>{formatCopy(c.deleteSet.body, { count })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {c.actions.cancel}
            </Button>
            <button type="button" className="chip prx-danger-solid h-10" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.deleteSet.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
