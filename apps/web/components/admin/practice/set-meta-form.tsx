'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { AdminPracticeSetRow, PracticeSetPatch } from '@ayman/contracts/practice';
import { Button } from '@ayman/ui/components/button';
import { patchPracticeSet } from '@/app/(admin)/admin/practice/actions';
import { SetMetaFields, blankToNull, checkSetMeta, type SetMetaValue } from './set-meta-fields';
import { PublishSwitch } from './publish-switch';

function valueOf(set: AdminPracticeSetRow): SetMetaValue {
  return {
    year: set.year,
    track: set.track,
    lessonCode: set.lessonCode,
    title: set.title,
    unitTitle: set.unitTitle ?? '',
    articleSlug: set.articleSlug ?? '',
  };
}

/**
 * «بيانات الدرس» in the editor's side column.
 *
 * Sends only the fields that CHANGED. The contract's PATCH is partial for a
 * reason (`PracticeSetPatchSchema`'s ⚠️), and resending an untouched
 * `lessonCode` would turn a fixed typo in the title into a uniqueness check
 * against a row edited in another tab.
 *
 * Publishing is its own switch above the fields and saves on its own: it is
 * the one change here that is visible to the public the moment it lands.
 */
export function SetMetaForm({ set }: { set: AdminPracticeSetRow }) {
  const router = useRouter();
  const saved = valueOf(set);
  const [value, setValue] = useState<SetMetaValue>(saved);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = shown ? checkSetMeta(value) : {};

  function changes(): PracticeSetPatch {
    const patch: PracticeSetPatch = {};
    if (value.year !== saved.year) patch.year = value.year;
    if (value.track !== saved.track) patch.track = value.track;
    if (value.lessonCode.trim() !== saved.lessonCode) patch.lessonCode = value.lessonCode.trim();
    if (value.title.trim() !== saved.title) patch.title = value.title.trim();
    if (blankToNull(value.unitTitle) !== set.unitTitle) patch.unitTitle = blankToNull(value.unitTitle);
    if (blankToNull(value.articleSlug) !== set.articleSlug) patch.articleSlug = blankToNull(value.articleSlug);
    return patch;
  }

  const patch = changes();
  const dirty = Object.keys(patch).length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !dirty) return;
    setShown(true);
    setError(null);
    if (Object.keys(checkSetMeta(value)).length > 0) return;
    setBusy(true);
    try {
      const result = await patchPracticeSet(set.id, patch);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(c.editor.saved);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="prx-panel" onSubmit={submit} noValidate>
      <p className="prx-panel__title">
        <span className="prx-panel__well" aria-hidden="true">
          <Settings2 className="size-4" />
        </span>
        {c.editor.meta}
      </p>
      <PublishSwitch set={set} />
      <p className="prx-hint">{c.editor.metaHint}</p>
      <SetMetaFields value={value} onChange={setValue} errors={errors} compact />
      {error ? (
        <p role="alert" className="prx-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !dirty}>
        {c.editor.saveMeta}
      </Button>
    </form>
  );
}
