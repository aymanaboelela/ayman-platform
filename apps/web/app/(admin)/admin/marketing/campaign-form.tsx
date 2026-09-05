'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { MediaAsset } from '@ayman/contracts/admin/media';
import { BookOrderStatusSchema } from '@ayman/contracts/book-orders';
import {
  CampaignCreateSchema,
  DEFAULT_PACING_INPUT,
  EMPTY_AUDIENCE,
  NAME_TOKEN,
  LINK_TOKEN,
  type Audience,
  type AudiencePreview,
} from '@ayman/contracts/marketing/campaign';
import type { Pacing } from '@ayman/contracts/marketing/pacing';
import { renderCampaignBody } from '@ayman/contracts/marketing/render';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { mediaUrl } from '@ayman/ui/branding';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { createCampaignAction, listMediaForPickerAction, previewAudienceAction } from './actions';
import { formatEstimate } from './format-estimate';

const c = copy.marketing;

export interface CourseOption {
  id: string;
  title: string;
}

/** Debounce for the audience preview call — every checkbox click and every
 *  keystroke in the phone list must not each fire its own request. */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The whole «حملة جديدة» flow: audience, message, pacing, then a confirm step
 * that shows the real numbers before anything is written.
 *
 * Plain `useState` over the draft object rather than `react-hook-form` — the
 * shape here is a nested audience + pacing object edited as checkboxes,
 * multi-selects and a textarea-of-lines, none of which benefit from
 * field-level RHF wiring the way a flat settings form does. Validation is the
 * server's: `CampaignCreateSchema` is the same schema the API parses the
 * body against, so a client-side pre-check here can never diverge from what
 * actually gets accepted.
 */
export function CampaignForm({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageAsset, setImageAsset] = useState<MediaAsset | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE);
  const [extraPhonesText, setExtraPhonesText] = useState('');
  const [pacing, setPacing] = useState<Pacing>(DEFAULT_PACING_INPUT);

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extraPhones = useMemo(
    () => extraPhonesText.split('\n').map((line) => line.trim()).filter(Boolean),
    [extraPhonesText],
  );
  const resolvedAudience: Audience = { ...audience, extraPhones };

  /**
   * «ابعت للأرقام دي بس» — is this campaign already narrowed to the pasted list?
   *
   * Derived, never stored. There is no "numbers only" MODE in the audience
   * model and there should not be: `students: false, parents: false` with
   * numbers in `extraPhones` already means exactly this, and a second flag
   * saying the same thing is a second thing that can disagree with the first.
   * The button below sets those two switches; this reads them back.
   */
  const onlyExtraPhones = !audience.students && !audience.parents && extraPhones.length > 0;

  // Re-price the audience whenever it or the pacing changes — debounced, so
  // typing a list of phone numbers does not fire a request per keystroke.
  //
  // Every `setState` call lives INSIDE the `setTimeout` callback, not in the
  // effect body itself: calling `setPreviewLoading(true)` synchronously at
  // the top of the effect fires on every render this effect re-runs, which
  // is exactly the cascading-render shape the React Compiler's lint rule
  // flags. Deferring it into the same callback that starts the request costs
  // nothing — the loading badge is only meaningful once a request is
  // actually about to go out.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setPreviewLoading(true);
      previewAudienceAction(resolvedAudience, pacing)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resolvedAudience` is a fresh object every render; its own fields are the real deps.
  }, [audience, extraPhones, pacing]);

  const renderedPreview = renderCampaignBody({ body, name: 'محمد', linkUrl: linkUrl || null });

  async function submit() {
    setError(null);
    const parsed = CampaignCreateSchema.safeParse({
      name,
      body,
      imageAssetId: imageAsset?.id ?? null,
      linkUrl: linkUrl || null,
      audience: resolvedAudience,
      pacing,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'فيه بيانات ناقصة');
      return;
    }

    startTransition(async () => {
      const result = await createCampaignAction(parsed.data);
      if (result.ok) {
        toast.success('الحملة اتجهزت');
        router.push(`/admin/marketing/campaigns/${result.data.id}`);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── الجمهور ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{c.audienceTitle}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={audience.students}
              onCheckedChange={(v) => setAudience((a) => ({ ...a, students: v === true }))}
            />
            <span>
              {c.audienceStudents}
              <span className="ms-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.audienceStudentsHint}</span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={audience.parents}
              onCheckedChange={(v) => setAudience((a) => ({ ...a, parents: v === true }))}
            />
            <span>
              {c.audienceParents}
              <span className="ms-2 text-[length:var(--fs-text-xs)] text-fg-muted">{c.audienceParentsHint}</span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{c.audienceYears}</Label>
              <div className="mt-1 flex gap-3">
                {[1, 2, 3].map((year) => (
                  <label key={year} className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)]">
                    <Checkbox
                      checked={audience.years.includes(year)}
                      onCheckedChange={(v) =>
                        setAudience((a) => ({
                          ...a,
                          years: v === true ? [...a.years, year] : a.years.filter((y) => y !== year),
                        }))
                      }
                    />
                    {year}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {audience.years.length === 0 ? c.audienceYearsAll : null}
              </p>
            </div>

            <div>
              <Label>{c.audienceSchoolStreams}</Label>
              <div className="mt-1 flex gap-3">
                {(['general', 'languages'] as const).map((stream) => (
                  <label key={stream} className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)]">
                    <Checkbox
                      checked={audience.schoolStreams.includes(stream)}
                      onCheckedChange={(v) =>
                        setAudience((a) => ({
                          ...a,
                          schoolStreams:
                            v === true
                              ? [...a.schoolStreams, stream]
                              : a.schoolStreams.filter((s) => s !== stream),
                        }))
                      }
                    />
                    {copy.stream[stream]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {audience.schoolStreams.length === 0 ? c.audienceSchoolStreamsAll : null}
              </p>
            </div>

            <div>
              <Label htmlFor="marketing-course">{c.audienceCourses}</Label>
              <Select
                id="marketing-course"
                multiple
                size={Math.min(4, Math.max(2, courses.length))}
                value={audience.courseIds}
                onChange={(event) =>
                  setAudience((a) => {
                    const courseIds = Array.from(event.target.selectedOptions, (o) => o.value);
                    return {
                      ...a,
                      courseIds,
                      // Disabling the control below leaves a stale `true` behind
                      // if it isn't cleared here too — see the control's own note.
                      notSubscribedOnly: courseIds.length > 0 ? a.notSubscribedOnly : false,
                    };
                  })
                }
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {audience.courseIds.length === 0 ? c.audienceCoursesAll : null}
              </p>
            </div>

            {/* «الناس اللي اتشحن ليها + اللي ماتشحنتش ليها + اللي وصل ليها».
                Checkboxes and not a multi-select like the courses beside it:
                the list is five fixed states that never grow with the data,
                every one of them is a message the instructor writes
                differently, and `BookOrderStatusSchema.options` keeps them in
                lifecycle order — which is the order he reasons about them in.
                Same shape as the years and streams above it. */}
            <div>
              <Label>{c.audienceBookOrder}</Label>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5">
                {BookOrderStatusSchema.options.map((status) => (
                  <label key={status} className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)]">
                    <Checkbox
                      checked={audience.bookOrderStatuses.includes(status)}
                      onCheckedChange={(v) =>
                        setAudience((a) => ({
                          ...a,
                          bookOrderStatuses:
                            v === true
                              ? [...a.bookOrderStatuses, status]
                              : a.bookOrderStatuses.filter((s) => s !== status),
                        }))
                      }
                    />
                    {c.audienceBookOrderState[status]}
                  </label>
                ))}
              </div>
              {/* Unlike the neighbours, this swaps to a hint rather than to
                  nothing once something is ticked: «الطلبات المحذوفة مش
                  محسوبة» and «اللي طلبوا من غير حساب» are both invisible from
                  the boxes, and both change who actually gets the message. */}
              <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {audience.bookOrderStatuses.length === 0
                  ? c.audienceBookOrderAll
                  : c.audienceBookOrderHint}
              </p>
            </div>
          </div>

          {/* Only means anything once a course narrows "subscribed" to
              something specific — see `notSubscribedOnly`'s own note in the
              `Audience` schema. Disabled rather than hidden, so ticking a
              course later doesn't require hunting for a control that vanished. */}
          <label
            className={cn(
              'flex items-center gap-2',
              audience.courseIds.length === 0 && 'opacity-50',
            )}
          >
            <Checkbox
              checked={audience.notSubscribedOnly}
              disabled={audience.courseIds.length === 0}
              onCheckedChange={(v) => setAudience((a) => ({ ...a, notSubscribedOnly: v === true }))}
            />
            <span>
              {c.audienceNotSubscribedOnly}
              <span className="ms-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                {audience.courseIds.length === 0
                  ? c.audienceNotSubscribedOnlyNeedsCourse
                  : c.audienceNotSubscribedOnlyHint}
              </span>
            </span>
          </label>

          <div>
            <Label htmlFor="marketing-extra-phones">{c.audienceExtraPhones}</Label>
            <Textarea
              id="marketing-extra-phones"
              rows={3}
              dir="ltr"
              placeholder={'01012345678\n01098765432'}
              value={extraPhonesText}
              onChange={(event) => setExtraPhonesText(event.target.value)}
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.audienceExtraPhonesHint}</p>

            {/*
              Shown only once there is something to narrow TO, and hidden again
              the moment the campaign IS narrowed — an action that is already
              done is a control that only invites a second press.

              This is the whole fix for «عايز أحدد الأرقام اللي أبعتلها بس».
              The capability was always there; nothing pointed at it, and the
              count underneath went on saying «هيوصله ٤٨٦ رقم» next to the one
              number he had just pasted.
            */}
            {extraPhones.length > 0 && !onlyExtraPhones && (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setAudience((a) => ({ ...a, students: false, parents: false }))}
                >
                  {c.audienceOnlyTheseAction}
                </Button>
                <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {c.audienceOnlyTheseHint}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-sm border border-line-subtle bg-surface-2 px-3 py-2 text-[length:var(--fs-text-sm)]">
            {previewLoading ? (
              c.audiencePreviewLoading
            ) : preview && preview.recipients > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="font-medium text-fg">
                  {/* When the campaign is numbers-only, say the SHAPE and not
                      just the size — «هيوصله ١ رقم» is true and tells him
                      nothing about whether the filters are still on. */}
                  {onlyExtraPhones
                    ? formatCopy(c.audienceOnlyTheseActive, { n: preview.recipients })
                    : formatCopy(c.audiencePreviewCount, { n: preview.recipients })}
                </span>
                <span className="text-fg-muted">
                  {formatCopy(c.audienceEstimate, { duration: formatEstimate(preview.estimateMinutes) })}
                </span>
                {preview.unreachable > 0 ? (
                  <span className="text-fg-muted">{formatCopy(c.audienceUnreachable, { n: preview.unreachable })}</span>
                ) : null}
                {preview.optedOut > 0 ? (
                  <span className="text-fg-muted">{formatCopy(c.audienceOptedOut, { n: preview.optedOut })}</span>
                ) : null}
              </div>
            ) : (
              <span className="text-fg-muted">{c.audiencePreviewNone}</span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ── الرسالة ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{c.messageTitle}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div>
            <Label htmlFor="marketing-name">{c.fieldName}</Label>
            <Input id="marketing-name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.fieldNameHint}</p>
          </div>

          <div>
            <Label htmlFor="marketing-body">{c.fieldBody}</Label>
            <Textarea id="marketing-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldBodyHint}{' '}
              <button
                type="button"
                className="mono text-accent underline"
                onClick={() => setBody((b) => `${b}${NAME_TOKEN}`)}
              >
                {NAME_TOKEN}
              </button>
            </p>
          </div>

          <div>
            <Label>{c.fieldImage}</Label>
            {imageAsset ? (
              <div className="mt-1 flex items-center gap-3">
                <Image
                  src={mediaUrl(imageAsset.storageKey)}
                  alt=""
                  width={64}
                  height={64}
                  className="size-16 rounded-sm border border-line object-cover"
                />
                <Button type="button" variant="ghost" onClick={() => setImageAsset(null)}>
                  {c.fieldImageRemove}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
                {c.fieldImagePick}
              </Button>
            )}
          </div>

          <div>
            <Label htmlFor="marketing-link">{c.fieldLink}</Label>
            <Input
              id="marketing-link"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              {c.fieldLinkHint}{' '}
              <button
                type="button"
                className="mono text-accent underline"
                onClick={() => setBody((b) => `${b}${LINK_TOKEN}`)}
              >
                {LINK_TOKEN}
              </button>
            </p>
          </div>

          {body ? (
            <div>
              <Label>{c.previewTitle}</Label>
              <div className="mt-1 whitespace-pre-wrap rounded-[var(--r-lg)] border border-line-subtle bg-surface-2 p-3 text-[length:var(--fs-text-sm)]">
                {renderedPreview || '—'}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* ── السرعة والأمان ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{c.pacingTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-[length:var(--fs-text-sm)] text-fg-muted">{c.pacingLead}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField label={c.pacingMinDelay} value={pacing.minDelaySeconds} onChange={(v) => setPacing((p) => ({ ...p, minDelaySeconds: v }))} />
            <NumberField label={c.pacingMaxDelay} value={pacing.maxDelaySeconds} onChange={(v) => setPacing((p) => ({ ...p, maxDelaySeconds: v }))} />
            <NumberField label={c.pacingBatchSize} value={pacing.batchSize} onChange={(v) => setPacing((p) => ({ ...p, batchSize: v }))} />
            <NumberField label={c.pacingBatchPause} value={pacing.batchPauseMinutes} onChange={(v) => setPacing((p) => ({ ...p, batchPauseMinutes: v }))} />
            <NumberField label={c.pacingDailyCap} value={pacing.dailyCap} onChange={(v) => setPacing((p) => ({ ...p, dailyCap: v }))} />
            <NumberField label={c.pacingWindowStart} value={pacing.windowStartHour} onChange={(v) => setPacing((p) => ({ ...p, windowStartHour: v }))} />
            <NumberField label={c.pacingWindowEnd} value={pacing.windowEndHour} onChange={(v) => setPacing((p) => ({ ...p, windowEndHour: v }))} />
          </div>
          <p className="mt-3 text-[length:var(--fs-text-xs)] text-fg-muted">{c.pacingWindowHint}</p>
        </CardBody>
      </Card>

      {error ? <p className="text-[color:var(--err)]">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="button" disabled={pending} onClick={() => setConfirming(true)}>
          {c.createButton}
        </Button>
      </div>

      {confirming ? (
        <ConfirmDialog
          count={preview?.recipients ?? 0}
          estimateMinutes={preview?.estimateMinutes ?? 0}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void submit();
          }}
        />
      ) : null}

      {pickerOpen ? (
        <MediaPickerDialog
          onClose={() => setPickerOpen(false)}
          onPick={(asset) => {
            setImageAsset(asset);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        dir="ltr"
        className="mono"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function ConfirmDialog({
  count,
  estimateMinutes,
  pending,
  onCancel,
  onConfirm,
}: {
  count: number;
  estimateMinutes: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-line bg-surface-1 p-6">
        <h2 className="mb-2 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.createConfirmTitle}</h2>
        <p className="mb-6 text-fg-muted">
          {formatCopy(c.createConfirmBody, { n: count, duration: formatEstimate(estimateMinutes) })}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {copy.admin.common.cancel}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {c.createConfirmGo}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MediaPickerDialog({ onClose, onPick }: { onClose: () => void; onPick: (asset: MediaAsset) => void }) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);

  useEffect(() => {
    listMediaForPickerAction().then(setAssets).catch(() => setAssets([]));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[var(--r-lg)] border border-line bg-surface-1 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-semibold text-fg">{c.fieldImagePick}</h2>
        {assets === null ? (
          <p className="text-fg-muted">…</p>
        ) : assets.length === 0 ? (
          <p className="text-fg-muted">مفيش صور في المكتبة</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={cn(
                  'aspect-square overflow-hidden rounded-sm border border-line transition-colors',
                  'hover:border-accent',
                )}
                onClick={() => onPick(asset)}
              >
                <Image
                  src={mediaUrl(asset.storageKey)}
                  alt={asset.altAr ?? ''}
                  width={120}
                  height={120}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
