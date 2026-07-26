import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Badge, Card, CardBody } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { ResolveAppealButton } from '@/components/admin/quiz/resolve-appeal-button';

const AdminAppealRowSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  attemptQuestionId: z.string(),
  questionVersionId: z.string(),
  userId: z.string(),
  studentName: z.string(),
  quizId: z.string(),
  quizTitle: z.string(),
  reasonAr: z.string(),
  state: z.enum(['open', 'under_review', 'accepted', 'rejected']),
  resolutionAr: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

const STATE_TONE = {
  open: 'accent',
  under_review: 'accent',
  accepted: 'ok',
  rejected: 'err',
} as const;

export const metadata = { title: copy.appeal.queueTitle };

/**
 * A plain list — per the Plan 5/Plan 6 reconciliation, this exact file is
 * where Plan 6 Task 11 later upgrades to the DataTable + nuqs pattern; it
 * does not create a second page.
 */
export default async function AdminAppealsPage() {
  const appeals = await apiGetAuthed('/api/admin/appeals', z.array(AdminAppealRowSchema));

  return (
    <>
      <h1 className="mb-6 text-[length:var(--fs-title-2)] font-semibold">{copy.appeal.queueTitle}</h1>

      {appeals.length === 0 ? (
        <p className="text-fg-muted">{copy.appeal.empty}</p>
      ) : (
        <ul className="space-y-3">
          {appeals.map((appeal) => (
            <li key={appeal.id}>
              <Card>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{appeal.studentName}</p>
                      <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">{appeal.quizTitle}</p>
                    </div>
                    <Badge tone={STATE_TONE[appeal.state]}>{copy.appeal.status[appeal.state]}</Badge>
                  </div>

                  <p className="text-fg">{appeal.reasonAr}</p>

                  {appeal.resolutionAr ? (
                    <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
                      {copy.appeal.resolverNote}: {appeal.resolutionAr}
                    </p>
                  ) : null}

                  {appeal.state === 'open' || appeal.state === 'under_review' ? (
                    <ResolveAppealButton appealId={appeal.id} />
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
