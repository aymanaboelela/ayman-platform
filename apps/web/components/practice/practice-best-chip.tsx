'use client';

import { Trophy } from 'lucide-react';
import { practiceCopy as p } from '@ayman/contracts/copy/practice';
import { practiceBand } from '@/lib/practice/grade';
import { usePracticeBest } from './use-practice-best';

/**
 * «أعلى نتيجة» on a lesson card — this device's best, or «لسه ما اتحلّش».
 *
 * The prerendered card always says «لسه ما اتحلّش»; the score replaces it
 * after mount, which is the only moment storage can be read without the server
 * HTML and the first client render disagreeing.
 */
export function PracticeBestChip({ id }: { id: string }) {
  const best = usePracticeBest(id);

  if (!best) return <span className="practice-chip">{p.index.notYet}</span>;
  return (
    <span className="practice-chip" data-band={practiceBand(best.score, best.total)}>
      <Trophy size={14} aria-hidden="true" />
      {p.index.best.replace('{score}', String(best.score)).replace('{total}', String(best.total))}
    </span>
  );
}
