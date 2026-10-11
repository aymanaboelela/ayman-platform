'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, KeyRound, PencilLine, RefreshCw, ShieldCheck } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { DEFAULT_TENANT_SUBJECT, SUBJECTS } from '@ayman/contracts/subjects';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Select } from '@ayman/ui/components/select';
import { finalizeTenantAction, redeployTenantAction, updateTenantIdentityAction } from './tenant-actions';

const c = copy.admin.tenants;

export interface TenantRowActionsProps {
  composeId: string | null;
  name: string;
  /** `TENANT_SUBJECT` as set, or null for the default (programming). */
  subject: string | null;
  appUrl: string | null;
  pendingHandover: boolean;
  webhookUrl: string | null;
}

/**
 * The buttons on one teacher's card. Links first (they cost nothing), then
 * the two that act on the stack — each disabled while its own request is in
 * flight, so a second press is not a second deploy queued behind the first.
 */
export function TenantRowActions({ composeId, name, subject, appUrl, pendingHandover, webhookUrl }: TenantRowActionsProps) {
  const [redeploying, startRedeploy] = useTransition();
  const [finalizing, startFinalize] = useTransition();
  const [handedOver, setHandedOver] = useState(!pendingHandover);
  const [copied, setCopied] = useState(false);

  function onRedeploy() {
    if (!composeId) return;
    startRedeploy(async () => {
      const result = await redeployTenantAction(composeId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function onFinalize() {
    if (!composeId) return;
    startFinalize(async () => {
      const result = await finalizeTenantAction(composeId);
      if (result.ok) {
        setHandedOver(true);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  async function onCopyWebhook() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (insecure context, permissions policy). The URL is
      // in the read-only field beside the button, selectable by hand.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!handedOver && composeId ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--warn),transparent_60%)] bg-[color-mix(in_oklch,var(--warn),transparent_90%)] p-2.5 text-[length:var(--fs-text-sm)] text-fg">
          <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[color:var(--warn)]" />
          <span>{c.pendingHandover}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {appUrl ? (
          <>
            <a
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206] hover:bg-accent-hover"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              {c.open}
            </a>
            <a
              href={`${appUrl}/admin`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface-3 px-3 text-[length:var(--fs-text-sm)] text-fg hover:bg-surface-4"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              {c.openAdmin}
            </a>
          </>
        ) : null}
        {composeId ? (
          <Button type="button" variant="secondary" disabled={redeploying} onClick={onRedeploy}>
            <RefreshCw aria-hidden="true" className={redeploying ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} />
            {redeploying ? c.redeploying : c.redeploy}
          </Button>
        ) : null}
        {composeId ? <EditIdentity composeId={composeId} name={name} subject={subject} /> : null}
        {composeId && !handedOver ? (
          <Button type="button" variant="secondary" disabled={finalizing} onClick={onFinalize}>
            <ShieldCheck aria-hidden="true" className="size-4" />
            {finalizing ? c.finalizing : c.finalize}
          </Button>
        ) : null}
      </div>

      {webhookUrl ? (
        <div className="rounded-lg border border-dashed border-line p-2.5">
          <p className="text-[length:var(--fs-text-xs)] font-medium text-fg">{c.webhookTitle}</p>
          <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{c.webhookHint}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={webhookUrl}
              aria-label={c.webhookTitle}
              onFocus={(event) => event.currentTarget.select()}
              className="mono h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-2 text-[length:var(--fs-mono-label)] text-fg-muted"
              // A Latin URL inside an RTL card reverses its segments without
              // these two (CLAUDE.md §7).
              dir="ltr"
              style={{ unicodeBidi: 'isolate' }}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => void onCopyWebhook()}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copied ? c.copied : c.copy}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * «تعديل» — the teacher's name and subject. A dialog rather than inline
 * fields: saving REBUILDS the stack (both are baked in at `next build`), and
 * that cost should be one deliberate press with the reason printed above it,
 * not a side effect of tabbing out of a field.
 */
function EditIdentity({ composeId, name, subject }: { composeId: string; name: string; subject: string | null }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(name);
  const [slug, setSlug] = useState(subject ?? DEFAULT_TENANT_SUBJECT);
  const [saving, startSaving] = useTransition();
  const fieldId = `identity-${composeId}`;

  function onSave() {
    startSaving(async () => {
      const result = await updateTenantIdentityAction(composeId, { displayName, subject: slug });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <PencilLine aria-hidden="true" className="size-4" />
          {c.edit}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.editTitle}</DialogTitle>
          <DialogDescription>{c.editLead}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-name`}>{c.displayName}</Label>
            <Input id={`${fieldId}-name`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-subject`}>{c.subject}</Label>
            <Select id={`${fieldId}-subject`} value={slug} onChange={(event) => setSlug(event.target.value)}>
              {SUBJECTS.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.nameAr}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Button type="button" disabled={saving || displayName.trim().length < 2} onClick={onSave}>
              {saving ? c.editSaving : c.editSave}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
