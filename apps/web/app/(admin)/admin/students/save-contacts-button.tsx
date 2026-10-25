'use client';

import { useState, useTransition } from 'react';
import { ContactRound } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { toast } from 'sonner';
import { exportContactsAction } from './actions';
import { studentsSearchParams } from './search-params';

const c = copy.admin.students;

/**
 * «حفظ في جهات الاتصال» — the students the current filter shows, as one .vcf
 * file the phone imports. iOS opens it straight into «إضافة كل جهات
 * الاتصال»; Android hands it to Contacts from the download.
 *
 * Only the students not exported before by this admin, so pressing it again
 * next week adds the new sign-ups and nobody twice. When everyone in the
 * filter was already saved, «نزّلهم كلهم تاني» is offered instead — the way
 * back for a phone that lost them, or an import that was cancelled.
 */
export function SaveContactsButton() {
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
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.exported === 0) {
        setAllSaved(result.alreadySaved > 0);
        toast(result.alreadySaved > 0 ? formatCopy(c.saveContactsNothingNew, { n: result.alreadySaved }) : c.saveContactsEmpty);
        return;
      }
      download(result.vcf);
      setAllSaved(false);
      toast.success(formatCopy(c.saveContactsDone, { n: result.exported }));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allSaved ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(true)}>
          {c.saveContactsAgain}
        </Button>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => run(false)}>
        <ContactRound className="size-4" aria-hidden="true" />
        {pending ? c.saveContactsBusy : c.saveContacts}
      </Button>
    </div>
  );
}

function download(vcf: string) {
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${c.saveContactsFile}-${new Date().toISOString().slice(0, 10)}.vcf`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handed to the browser, not before: iOS
  // reads the blob asynchronously and a synchronous revoke races it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
