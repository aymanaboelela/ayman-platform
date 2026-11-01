'use client';

import { useState, useTransition } from 'react';
import { ContactRound, UsersRound } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import type { ContactExportKind } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { toast } from 'sonner';
import { exportContactsAction } from './actions';
import { studentsSearchParams } from './search-params';

const c = copy.admin.students;

/** The words that differ between the students' button and the parents'. */
const LABELS = {
  student: {
    button: c.saveContacts,
    again: c.saveContactsAgain,
    done: c.saveContactsDone,
    nothingNew: c.saveContactsNothingNew,
    empty: c.saveContactsEmpty,
    file: c.saveContactsFile,
  },
  parents: {
    button: c.saveParents,
    again: c.saveParentsAgain,
    done: c.saveParentsDone,
    nothingNew: c.saveParentsNothingNew,
    empty: c.saveParentsEmpty,
    file: c.saveParentsFile,
  },
} as const;

/**
 * «حفظ في جهات الاتصال» — the students the current filter shows, as one .vcf
 * file the phone imports. iOS opens it straight into «إضافة كل جهات
 * الاتصال»; Android hands it to Contacts from the download.
 *
 * Only the students not exported before by this admin, so pressing it again
 * next week adds the new sign-ups and nobody twice. When everyone in the
 * filter was already saved, «نزّلهم كلهم تاني» is offered instead — the way
 * back for a phone that lost them, or an import that was cancelled.
 *
 * `kind="parents"` is the same button for the same filter, carrying the
 * students' father and mother numbers instead — remembered separately, so
 * saving the students first does not make the parents look «already saved».
 */
export function SaveContactsButton({ kind = 'student' }: { kind?: ContactExportKind }) {
  const l = LABELS[kind];
  const [state] = useQueryStates(studentsSearchParams);
  const [pending, startTransition] = useTransition();
  const [allSaved, setAllSaved] = useState(false);

  function run(includeSaved: boolean) {
    startTransition(async () => {
      const result = await exportContactsAction({
        q: state.q,
        governorate: state.governorate,
        year: state.year,
        track: state.track,
        role: state.role,
        access: state.access ?? null,
        stream: state.stream ?? null,
        includeSaved,
        kind,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.exported === 0) {
        setAllSaved(result.alreadySaved > 0);
        toast(result.alreadySaved > 0 ? formatCopy(l.nothingNew, { n: result.alreadySaved }) : l.empty);
        return;
      }
      download(result.vcf, l.file);
      setAllSaved(false);
      toast.success(formatCopy(l.done, { n: result.cards, s: result.exported }));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allSaved ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(true)}>
          {l.again}
        </Button>
      ) : null}
      <Button size="sm" variant={kind === 'parents' ? 'secondary' : 'primary'} disabled={pending} onClick={() => run(false)}>
        {kind === 'parents' ? <UsersRound className="size-4" aria-hidden="true" /> : <ContactRound className="size-4" aria-hidden="true" />}
        {pending ? c.saveContactsBusy : l.button}
      </Button>
    </div>
  );
}

function download(vcf: string, name: string) {
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.vcf`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handed to the browser, not before: iOS
  // reads the blob asynchronously and a synchronous revoke races it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
