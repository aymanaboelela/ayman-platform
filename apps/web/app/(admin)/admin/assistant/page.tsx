import Link from 'next/link';
import { Card, CardBody } from '@ayman/ui';
import { cn } from '@ayman/ui/lib/cn';
import { AssistantQuestionSchema } from '@ayman/contracts/assistant/questions';
import { listResponse } from '@ayman/contracts/admin/list';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { QuestionRow } from './question-row';

const c = copy.admin.assistantQuestions;
const RowsSchema = listResponse(AssistantQuestionSchema);

export const metadata = { title: c.title };

/**
 * `/admin/assistant` — what students actually asked.
 *
 * ## Why this screen is worth a page of its own
 *
 * The inbox holds the questions a student escalated to a person. This holds
 * the ones they never escalated — the ordinary, unglamorous «الملخص فين» and
 * «نسيت الباسورد» that المساعد answered, or failed to. That second set is the
 * product's to-do list: every row flagged «محتاج أيمن» is a gap in
 * `copy.assistant.knowledge` with a student's own wording already attached.
 *
 * ## The flagged rows come first, by default
 *
 * Not sorted first — FILTERED first is available in one press, and the
 * unfiltered list is newest-first. A screen that opened on everything would
 * bury the twenty rows worth acting on under four hundred that answered
 * themselves.
 *
 * `adminGet`, never a cached loader: a stale answer here is an instructor
 * acting on a gap that was filled last week.
 */
export default async function AdminAssistantQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.escalated) ? params.escalated[0] : params.escalated;
  const escalatedOnly = raw === '1';
  const search = (Array.isArray(params.q) ? params.q[0] : params.q) ?? '';

  const query = new URLSearchParams({ perPage: '50' });
  if (escalatedOnly) query.set('escalatedOnly', 'true');
  if (search) query.set('q', search);

  const { rows, rowCount } = await adminGet(
    `/api/admin/assistant/questions?${query.toString()}`,
    RowsSchema,
  );

  return (
    <>
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
          {c.eyebrow}
        </p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
        {/* Said once, quietly, on the screen it is true about. */}
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-faint">{c.retention}</p>
      </header>

      {/*
        Two links rather than a client-side toggle: the filter is in the URL,
        so it survives a refresh and can be sent to somebody. Same reasoning as
        the outreach log's filter row.
      */}
      <nav className="mb-5 flex flex-wrap items-center gap-2">
        <FilterLink href="/admin/assistant" active={!escalatedOnly} label={c.filterAll} />
        <FilterLink
          href="/admin/assistant?escalated=1"
          active={escalatedOnly}
          label={c.filterEscalated}
        />
        <span className="ms-auto text-[length:var(--fs-text-xs)] text-fg-muted">{rowCount}</span>
      </nav>

      {rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-6 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {escalatedOnly ? c.emptyFiltered : c.empty}
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <QuestionRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3 py-1 text-[length:var(--fs-text-xs)] transition-colors duration-[160ms] ease-out',
        active
          ? 'border-accent/40 bg-accent/12 font-medium text-accent-text'
          : 'border-line-subtle text-fg-muted hover:border-accent/40 hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}
