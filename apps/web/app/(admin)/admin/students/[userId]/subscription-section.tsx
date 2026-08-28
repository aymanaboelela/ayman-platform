'use client';

import { useActionState, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import type { AdminSubscriptionRow } from '@ayman/contracts/admin/payments';
import type { PaymentPlan } from '@ayman/contracts/payments';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Label } from '@ayman/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@ayman/ui/components/radio-group';
import { Select } from '@ayman/ui/components/select';
import { Switch } from '@ayman/ui/components/switch';
import { formatEGP } from '@/lib/price';
import { subscriptionExpiryLabel } from '@/lib/subscription-expiry';
import { uploadPaymentScreenshot } from '@/lib/upload-client';
import {
  adminCancelSubscriptionAction,
  adminSubscribeAction,
  type ActionResult,
} from '../actions';

const c = copy.admin.students;
const cp = copy.admin.payments;
const IDLE: ActionResult = { ok: true };

const PLAN_LABEL: Record<Exclude<PaymentPlan, 'term'>, string> = {
  monthly: cp.planMonthly,
  quarterly: cp.planQuarterly,
  yearly: cp.planYearly,
};

const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

export interface SubscribableTerm {
  id: string;
  title: string;
  isOpen: boolean;
  priceCents: number | null;
}

export interface SubscribableCourse {
  id: string;
  title: string;
  monthlyPriceCents: number | null;
  quarterlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  /** Priced terms only — see the page's own filter. Offered here even
   *  CLOSED: this is the admin override, unlike the student-facing flow. */
  terms: SubscribableTerm[];
}

/** `termId` is only meaningful for `plan: 'term'` — every other plan prices
 *  straight off the course. */
function planPriceFor(
  course: SubscribableCourse | undefined,
  plan: PaymentPlan,
  termId: string | null,
): number | null {
  if (!course) return null;
  if (plan === 'term') return course.terms.find((term) => term.id === termId)?.priceCents ?? null;
  if (plan === 'monthly') return course.monthlyPriceCents;
  if (plan === 'quarterly') return course.quarterlyPriceCents;
  return course.yearlyPriceCents;
}

function plansOfferedBy(course: SubscribableCourse | undefined): PaymentPlan[] {
  if (!course) return [];
  const plans: PaymentPlan[] = [];
  if (course.monthlyPriceCents !== null) plans.push('monthly');
  if (course.quarterlyPriceCents !== null) plans.push('quarterly');
  if (course.yearlyPriceCents !== null) plans.push('yearly');
  if (course.terms.length > 0) plans.push('term');
  return plans;
}

/**
 * اشتراكات الكورسات المدفوعة — the admin student page's own entry point into
 * the paid-subscription system, distinct from `<CourseAccessSection>` (a
 * different mechanism entirely — see that component's header comment). Every
 * course offered here sells at least one plan; subscribing reaches the exact
 * `AccessGrant`/`Enrollment` state a genuine Vodafone Cash approval would,
 * through `PaymentsService.adminManualSubscribe`.
 */
export function SubscriptionSection({
  userId,
  subscriptions,
  courses,
}: {
  userId: string;
  subscriptions: AdminSubscriptionRow[];
  courses: SubscribableCourse[];
}) {
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.subscriptionsTitle}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.subscriptionsLead}</p>

        {subscriptions.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.subscriptionsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subscriptions.map((row) => (
              <SubscriptionRow key={row.id} userId={userId} row={row} now={now} />
            ))}
          </ul>
        )}

        {courses.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noPricedCourses}</p>
        ) : (
          <SubscribeDialog userId={userId} courses={courses} subscriptions={subscriptions} />
        )}
      </CardBody>
    </Card>
  );
}

function SubscriptionRow({
  userId,
  row,
  now,
}: {
  userId: string;
  row: AdminSubscriptionRow;
  now: Date;
}) {
  const validUntilDate = row.validUntil ? new Date(row.validUntil) : null;
  const isLive = row.revokedAt === null && (validUntilDate === null || validUntilDate > now);

  let statusText: string;
  if (row.revokedAt !== null) {
    statusText = c.subscriptionCancelled;
  } else if (!isLive) {
    statusText = c.subscriptionExpired;
  } else if (row.validUntil === null) {
    statusText = c.subscriptionLive;
  } else {
    // `subscriptionExpiryLabel` returns `null` once already lapsed — cannot
    // happen here (`isLive` already checked that), so `?? c.subscriptionLive`
    // is unreachable in practice and only satisfies the return type.
    statusText = subscriptionExpiryLabel(row.validUntil, now) ?? c.subscriptionLive;
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-2 p-2">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[length:var(--fs-text-sm)] text-fg">{row.courseTitle}</span>
          {row.plan === 'term' ? (
            <Badge tone="neutral">{formatCopy(cp.planTerm, { term: row.termTitle ?? '' })}</Badge>
          ) : row.plan ? (
            <Badge tone="neutral">{PLAN_LABEL[row.plan]}</Badge>
          ) : null}
          {row.isFree ? <Badge tone="accent">{c.subscriptionFreeBadge}</Badge> : null}
        </span>
        <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
          {statusText}
        </span>
      </span>

      {isLive ? <CancelButton userId={userId} grantId={row.id} courseTitle={row.courseTitle} /> : null}
    </li>
  );
}

function CancelButton({
  userId,
  grantId,
  courseTitle,
}: {
  userId: string;
  grantId: string;
  courseTitle: string;
}) {
  const [open, setOpen] = useState(false);
  // Closed from inside the action, not a `useEffect` — see `BanDialog`'s own
  // note in `account-access-section.tsx` for why.
  const [state, action, pending] = useActionState<ActionResult, FormData>(async () => {
    const result = await adminCancelSubscriptionAction(userId, grantId);
    if (result.ok) setOpen(false);
    return result;
  }, IDLE);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {c.cancelSubscription}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.cancelSubscriptionDialogTitle}</DialogTitle>
          <DialogDescription>{courseTitle}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-3">
          <p className="text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">
            {c.cancelSubscriptionBody}
          </p>

          {!state.ok ? (
            <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {copy.admin.actions.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? copy.admin.actions.saving : c.cancelSubscriptionConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscribeDialog({
  userId,
  courses,
  subscriptions,
}: {
  userId: string;
  courses: SubscribableCourse[];
  subscriptions: AdminSubscriptionRow[];
}) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const course = courses.find((entry) => entry.id === courseId);
  const [plan, setPlan] = useState<PaymentPlan>(plansOfferedBy(course)[0] ?? 'monthly');
  const [termId, setTermId] = useState<string>(course?.terms[0]?.id ?? '');
  const [isFree, setIsFree] = useState(false);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const plans = plansOfferedBy(course);
  const priceCents = planPriceFor(course, plan, plan === 'term' ? termId : null);

  function handleCourseChange(nextCourseId: string) {
    setCourseId(nextCourseId);
    const nextCourse = courses.find((entry) => entry.id === nextCourseId);
    const nextPlans = plansOfferedBy(nextCourse);
    if (!nextPlans.includes(plan)) setPlan(nextPlans[0] ?? 'monthly');
    setTermId(nextCourse?.terms[0]?.id ?? '');
  }

  function handlePlanChange(nextPlan: PaymentPlan) {
    setPlan(nextPlan);
    if (nextPlan === 'term' && !termId) setTermId(course?.terms[0]?.id ?? '');
  }

  // For `plan: 'term'`, "already active" has to name the SAME term — a live
  // subscription to a DIFFERENT term (or a whole-course one) is not what this
  // warning is about. For the other two plans it is any live whole-course row.
  const existingLive = subscriptions.find(
    (row) =>
      row.courseId === courseId &&
      row.revokedAt === null &&
      (plan === 'term' ? row.termId === termId : row.termId === null),
  );

  // Closed from inside the action, not a `useEffect` — see `BanDialog`'s own
  // note in `account-access-section.tsx` for why.
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      let screenshotKey = '';
      if (file) {
        const uploaded = await uploadPaymentScreenshot(file);
        if (!uploaded.ok) return { ok: false, message: c.subscribeUploadFailed };
        screenshotKey = uploaded.value.screenshotKey;
      }
      formData.set('screenshotKey', screenshotKey);

      const result = await adminSubscribeAction(userId, formData);
      if (result.ok) {
        setOpen(false);
        setFile(null);
        setConfirmedPaid(false);
        setIsFree(false);
      }
      return result;
    },
    IDLE,
  );

  // The plan price is never zero for a course offered here (both price
  // columns are non-null exactly when a course is `requiresGrant` AND
  // priced — see `courses_priced_requires_grant`), so `priceCents === null`
  // only means "no course selected at all" (an empty `courses` list, guarded
  // by the caller) — the submit button stays disabled either way. For
  // `plan: 'term'` it also means no term is selected yet.
  const canSubmit = priceCents !== null && (plan !== 'term' || termId !== '') && (isFree || confirmedPaid);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFile(null);
          setConfirmedPaid(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">{c.subscribeButton}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.subscribeDialogTitle}</DialogTitle>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="termId" value={plan === 'term' ? termId : ''} />
          <input type="hidden" name="isFree" value={String(isFree)} />

          <div>
            <Label htmlFor="subscribe-course">{c.subscribeCourseLabel}</Label>
            <Select
              id="subscribe-course"
              value={courseId}
              onChange={(event) => handleCourseChange(event.target.value)}
            >
              {courses.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </Select>
            {existingLive ? (
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {existingLive.validUntil
                  ? formatCopy(c.subscribeAlreadyActive, {
                      date: dateFormatter.format(new Date(existingLive.validUntil)),
                    })
                  : c.subscribeAlreadyActiveTerm}
              </p>
            ) : null}
          </div>

          <div>
            {/* Not a `<Label htmlFor>` — `RadioGroupItem` renders as a
                `role="radio"` button, not a native input a `for` can target,
                and the group already carries its own `aria-label` below. */}
            <p className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
              {c.subscribePlanLabel}
            </p>
            <RadioGroup
              value={plan}
              onValueChange={(value) => handlePlanChange(value as PaymentPlan)}
              aria-label={c.subscribePlanLabel}
            >
              {plans.map((option) => (
                <label key={option} className="flex items-center gap-3">
                  <RadioGroupItem value={option} />
                  <span className="text-fg">
                    {option === 'term' ? c.subscribePlanTermLabel : PLAN_LABEL[option]}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* Which term, specifically — only meaningful once `plan: 'term'`
              is chosen. Every priced term is offered, open or closed: this
              dialog is the admin override (see `SubscribableTerm`'s own
              doc), unlike the student-facing subscribe panel. */}
          {plan === 'term' ? (
            <div>
              <Label htmlFor="subscribe-term">{c.subscribeTermLabel}</Label>
              <Select
                id="subscribe-term"
                value={termId}
                onChange={(event) => setTermId(event.target.value)}
              >
                {(course?.terms ?? []).map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.isOpen ? term.title : `${term.title} (${c.subscribeTermClosedBadge})`}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-surface-3 p-3">
            <div>
              <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                {isFree ? c.subscribeFreeLabel : c.subscribePaidLabel}
              </p>
              {isFree ? (
                <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {c.subscribeFreeHint}
                </p>
              ) : null}
            </div>
            <Switch
              checked={isFree}
              onCheckedChange={(checked) => {
                setIsFree(checked);
                if (checked) setConfirmedPaid(false);
              }}
              aria-label={c.subscribeFreeLabel}
            />
          </div>

          {priceCents !== null ? (
            <p className="mono text-[length:var(--fs-text-sm)] text-fg">
              {formatCopy(c.subscribeAmountLabel, { amount: formatEGP(priceCents) })}
            </p>
          ) : null}

          {!isFree ? (
            <>
              <label className="flex items-start gap-2.5">
                <Checkbox checked={confirmedPaid} onCheckedChange={(v) => setConfirmedPaid(v === true)} />
                <span className="text-[length:var(--fs-text-sm)] text-fg">
                  {priceCents !== null
                    ? formatCopy(c.subscribeConfirmPaid, { amount: formatEGP(priceCents) })
                    : null}
                </span>
              </label>

              <div>
                <Label htmlFor="subscribe-screenshot">{c.subscribeScreenshotLabel}</Label>
                <input
                  id="subscribe-screenshot"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor="subscribe-screenshot"
                  className="flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-150 ease-out hover:border-accent/40"
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                  {file ? file.name : c.subscribeScreenshotHint}
                </label>
              </div>
            </>
          ) : null}

          {!state.ok ? (
            <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {copy.admin.actions.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending ? c.subscribeSubmitting : c.subscribeSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
