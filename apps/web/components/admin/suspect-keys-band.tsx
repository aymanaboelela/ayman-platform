import Link from 'next/link';
import { CircleAlert, PencilLine } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { SuspectKeyListSchema, type SuspectKeyRow } from '@ayman/contracts/quiz/suspect-key';
import { adminGet } from '@/lib/admin-api';
import '@/components/admin/quiz/question-bank.css';
import './suspect-keys-band.css';

const c = copy.quizAdmin;

/** Never throws: the band is a warning on a page whose own job is elsewhere. */
async function loadSuspectKeys(): Promise<SuspectKeyRow[]> {
  try {
    return (await adminGet('/api/admin/questions/suspect-keys', SuspectKeyListSchema)).rows;
  } catch {
    return [];
  }
}

/**
 * «أسئلة إجابتها الصح غالبًا متسجّلة غلط» — every question, across every quiz,
 * whose answers say the key is wrong, on the first screen a teacher opens.
 *
 * PR #659 put the same verdict on each quiz's analytics page, and nobody opens
 * that page: two reversed true/false keys marked nine students wrong before a
 * student complained. The alert in the bell (`suspect_key`) says it once; this
 * says it for as long as it stays true, and renders nothing at all when no
 * question is suspect — which is the ordinary day.
 *
 * A row leaves on its own once fixing the key and «صحّح من جديد» have moved
 * the answers onto the corrected version (see `KeyWatchService.listSuspects`).
 */
export async function SuspectKeysBand() {
  const rows = await loadSuspectKeys();
  if (rows.length === 0) return null;

  return (
    <section className="keyband" aria-labelledby="keyband-title">
      <div className="keyband__head">
        <span className="qsuspect">
          <CircleAlert className="size-3.5" aria-hidden="true" />
          {c.suspectKey}
        </span>
        <h2 id="keyband-title" className="keyband__title">
          {c.suspectKeysTitle}
        </h2>
      </div>
      <p className="keyband__lead">{c.suspectKeysLead}</p>

      <ul className="keyband__list">
        {rows.map((row) => (
          <li key={row.questionVersionId} className="keyband__row">
            <div className="keyband__body">
              <p className="keyband__stem">{row.stemText}</p>
              {row.quizTitle ? (
                <p className="keyband__meta">{formatCopy(c.suspectKeysQuiz, { quiz: row.quizTitle })}</p>
              ) : null}
              <p className="keyband__evidence">
                {formatCopy(c.suspectKeysEvidence, {
                  picks: row.picks,
                  answers: row.answers,
                  picked: row.pickedText,
                  key: row.keyText,
                })}
              </p>
              {row.edited ? <p className="keyband__edited">{c.suspectKeysEdited}</p> : null}
            </div>
            <Link href={`/admin/questions/${row.bankEntryId}`} className="keyband__open">
              <PencilLine className="size-4" aria-hidden="true" />
              {c.suspectKeyOpen}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
