import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import type { CheckState } from '@/lib/youtube-studio/health';

const dateFormat = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' });

export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '';
}

/** One checklist line's mark: done, missing, or «YouTube does not say». */
export function CheckIcon({ state }: { state: CheckState }) {
  if (state === 'ok') return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (state === 'missing') return <CircleAlert className="size-4" aria-hidden="true" />;
  return <CircleHelp className="size-4" aria-hidden="true" />;
}
