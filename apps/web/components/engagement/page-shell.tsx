import { notFound } from 'next/navigation';
import type { ZodType } from 'zod';
import { ApiRequestError } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';

/**
 * The five engagement pages read one `/api/me/*` row each, and a 404 there
 * means the feature is closed on this stack — which the page answers the same
 * way, as a route that does not exist. Anything else is `(app)/error.tsx`'s.
 */
export async function readOr404<T>(path: string, schema: ZodType<T>): Promise<T> {
  try {
    return await apiGetAuthed(path, schema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

/** The page header every study route opens with (`.study-head`). */
export function EngagementHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="study-head">
      <p className="eyebrow mb-2 text-fg-muted">{eyebrow}</p>
      <h1 className="study-head__title">{title}</h1>
      <p className="study-head__lead">{lead}</p>
    </header>
  );
}
