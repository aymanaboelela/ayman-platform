import { Card, CardBody } from '@ayman/ui';
import { AssistantQuestionSchema } from '@ayman/contracts/assistant/questions';
import { listResponse } from '@ayman/contracts/admin/list';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { QuestionRow } from './question-row';
import { InboxTabs } from '../inbox-tabs';
import { ListControl } from '@/components/admin/list-controls';

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

        <InboxTabs active="/admin/inbox/questions" />
      </header>

      {/*
        A dropdown and a search box, matching every other admin list.

        ⚠️ The two links this replaces still pointed at `/admin/assistant` — the
        page's own old URL. After the move that is a redirect back to here on
        every filter press, and it would have dropped the `q` below with it.

        The search box is new UI over an EXISTING capability: the API has taken
        `q` on this endpoint all along and the page read it from the query
        string, but nothing on screen could set it. «الملخص فين» asked forty
        times is one search away and was unreachable.
      */}
      <form action="/admin/inbox/questions" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.searchLabel}</span>
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder={c.searchPlaceholder}
            className="h-9 min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint sm:w-[20rem]"
          />
        </label>
        {/* A plain submit, because this half is a GET form and the dropdown
            beside it navigates on change — mixing the two into one control
            would mean a search that only ran when the filter changed. */}
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-accent px-4 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]"
        >
          {c.searchSubmit}
        </button>
        {/* Rides along so submitting the search does not silently clear the
            filter — a GET form replaces the whole query string. */}
        {escalatedOnly ? <input type="hidden" name="escalated" value="1" /> : null}
      </form>

      <div className="mb-5 flex flex-wrap items-end gap-2">
        <ListControl
          name="escalated"
          label={c.filterLabel}
          value={escalatedOnly ? '1' : ''}
          options={[
            { value: '', label: c.filterAll },
            { value: '1', label: c.filterEscalated },
          ]}
        />
        <span className="ms-auto self-end text-[length:var(--fs-text-xs)] text-fg-muted">
          {rowCount}
        </span>
      </div>

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

