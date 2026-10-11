'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  ExternalLink,
  KeyRound,
  ListChecks,
  Loader2,
  MinusCircle,
  RotateCcw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Card, CardBody } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';
import type { StackStatus, StepResult } from '@/lib/provisioning/provision';
import { tenantStatusAction, type ProvisionActionResult } from './actions';

const c = copy.admin.tenants;

/** The first build is ~10 minutes; polling stops after this long so a tab
 *  left open over a weekend is not a request every ten seconds forever. */
const WATCH_FOR_MS = 40 * 60 * 1000;
const POLL_EVERY_MS = 10_000;

const STEP_ICON: Record<StepResult['state'], { icon: LucideIcon; className: string; label?: string }> = {
  done: { icon: CheckCircle2, className: 'text-[color:var(--ok)]' },
  reused: { icon: RotateCcw, className: 'text-fg-muted', label: c.stepReused },
  skipped: { icon: MinusCircle, className: 'text-fg-subtle', label: c.stepSkipped },
  failed: { icon: XCircle, className: 'text-[color:var(--err)]', label: c.stepFailed },
};

/**
 * What a run did, step by step — and, once it worked, everything the owner
 * still has to do with his own hands, in the order he has to do it.
 *
 * The password is on this screen and nowhere else this control plane will
 * ever show it: it lives in the stack's Dokploy environment until «إنهاء
 * الإعداد» clears it, and the list screen deliberately never reads it out.
 */
export function ProvisionRun({ result }: { result: ProvisionActionResult }) {
  const ok = result.ok;
  const steps = result.steps;
  const composeId = 'composeId' in result ? result.composeId : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={cn(
          ok
            ? 'border-[color-mix(in_oklch,var(--ok),transparent_55%)]'
            : 'border-[color-mix(in_oklch,var(--err),transparent_55%)]',
        )}
      >
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-lg',
                ok
                  ? 'bg-[color-mix(in_oklch,var(--ok),transparent_85%)] text-[color:var(--ok)]'
                  : 'bg-[color-mix(in_oklch,var(--err),transparent_85%)] text-[color:var(--err)]',
              )}
            >
              {ok ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{ok ? c.doneTitle : c.failedTitle}</h2>
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{ok ? c.doneLead : c.failedHint}</p>
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            {steps.map((step) => {
              const meta = STEP_ICON[step.state];
              const Icon = meta.icon;
              return (
                <li key={step.id} className="flex items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2">
                  <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', meta.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg">
                      {c.steps[step.id]}
                      {meta.label ? <span className="ms-2 text-[length:var(--fs-text-xs)] text-fg-muted">— {meta.label}</span> : null}
                    </p>
                    {step.detail ? (
                      <p
                        dir="ltr"
                        className="mono mt-0.5 break-words text-start text-[length:var(--fs-text-xs)] text-fg-subtle"
                        style={{ unicodeBidi: 'isolate' }}
                      >
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      {ok && composeId ? <Watch composeId={composeId} appUrl={result.appUrl ?? null} /> : null}
      {ok ? <Credentials result={result} /> : null}
      {ok ? <NextSteps result={result} /> : null}
      {ok ? (
        <div>
          <Link
            href="/admin/platforms"
            className="inline-flex h-10 items-center rounded-lg border border-line bg-surface-3 px-4 text-fg hover:bg-surface-4"
          >
            {c.back}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function useCopy(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [
    copied,
    (key, value) => {
      void navigator.clipboard
        .writeText(value)
        .then(() => {
          setCopied(key);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(null), 2000);
        })
        .catch(() => {
          // Refused clipboard: the value is selectable in its field.
        });
    },
  ];
}

function CopyField({ id, label, value, copied, onCopy }: { id: string; label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="mb-1 text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      <div className="flex items-center gap-2">
        <input
          id={id}
          readOnly
          value={value}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className="mono h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 text-fg"
          // Latin inside an RTL card (CLAUDE.md §7).
          dir="ltr"
          style={{ unicodeBidi: 'isolate' }}
        />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-3 px-3 text-[length:var(--fs-text-sm)] text-fg hover:bg-surface-4"
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? c.copied : c.copy}
        </button>
      </div>
    </div>
  );
}

function Credentials({ result }: { result: ProvisionActionResult }) {
  const [copied, copyValue] = useCopy();
  const credentials = 'credentials' in result ? result.credentials : null;
  const appUrl = 'appUrl' in result ? result.appUrl : undefined;
  if (!credentials || !appUrl) return null;
  const loginUrl = `${appUrl}/login`;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text">
            <KeyRound className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.credentialsTitle}</h2>
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.credentialsHint}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <CopyField id="cred-url" label={c.loginAt} value={loginUrl} copied={copied === 'url'} onCopy={() => copyValue('url', loginUrl)} />
          <CopyField id="cred-email" label={c.email} value={credentials.email} copied={copied === 'email'} onCopy={() => copyValue('email', credentials.email)} />
          <CopyField
            id="cred-password"
            label={c.password}
            value={credentials.password}
            copied={copied === 'password'}
            onCopy={() => copyValue('password', credentials.password)}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function NextSteps({ result }: { result: ProvisionActionResult }) {
  const [copied, copyValue] = useCopy();
  if (!result.ok) return null;
  const items: { key: string; body: ReactNode }[] = [];

  if (result.nameservers && result.nameservers.length > 0) {
    items.push({
      key: 'ns',
      body: (
        <>
          <p>{c.nextNameservers}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {result.nameservers.map((ns) => (
              <li key={ns} dir="ltr" className="mono text-start text-fg" style={{ unicodeBidi: 'isolate' }}>
                {ns}
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }
  if (result.dnsManual && result.dnsManual.length > 0) {
    items.push({ key: 'dns', body: <HostList text={c.nextDnsManual} hosts={result.dnsManual} /> });
  }
  if (result.dnsConflicts && result.dnsConflicts.length > 0) {
    items.push({ key: 'conflict', body: <HostList text={c.nextDnsConflict} hosts={result.dnsConflicts} /> });
  }
  if (result.webhookUrl) {
    const url = result.webhookUrl;
    items.push({
      key: 'webhook',
      body: (
        <>
          <p className="mb-2">{c.nextWebhook}</p>
          <CopyField id="webhook" label={c.webhookTitle} value={url} copied={copied === 'webhook'} onCopy={() => copyValue('webhook', url)} />
        </>
      ),
    });
  }
  items.push({ key: 'backups', body: <p>{c.nextBackups}</p> });
  items.push({ key: 'wa', body: <p>{c.nextWhatsapp}</p> });
  items.push({ key: 'finalize', body: <p>{c.nextFinalize}</p> });

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--info),transparent_85%)] text-[color:var(--info)]"
          >
            <ListChecks className="size-5" />
          </span>
          <h2 className="pt-2 text-[length:var(--fs-title-4)] font-semibold text-fg">{c.nextTitle}</h2>
        </div>
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={item.key} className="flex items-start gap-3 rounded-lg border border-line p-3 text-[length:var(--fs-text-sm)] text-fg">
              <span
                aria-hidden="true"
                className="mono grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[length:var(--fs-mono-label)] text-fg-muted"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">{item.body}</div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function HostList({ text, hosts }: { text: string; hosts: readonly string[] }) {
  return (
    <>
      <p>{text}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {hosts.map((host) => (
          <li key={host} dir="ltr" className="mono text-start text-fg" style={{ unicodeBidi: 'isolate' }}>
            {host}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The first build, watched. Dokploy's own status for «built», and the public
 * health URL for «a visitor can load it» — the two are minutes apart on a
 * new domain (DNS, then the certificate), and only the second one means the
 * credentials above are worth sending.
 */
function Watch({ composeId, appUrl }: { composeId: string; appUrl: string | null }) {
  const [status, setStatus] = useState<StackStatus | null>(null);
  const started = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    started.current ??= Date.now();

    async function tick() {
      // A background tab asks nothing — each poll is a Dokploy read and a
      // probe of the new site — and catches up on the first tick after it is
      // shown again.
      if (document.hidden) {
        timer = setTimeout(() => void tick(), POLL_EVERY_MS);
        return;
      }
      const next = await tenantStatusAction(composeId).catch(() => null);
      if (cancelled) return;
      if (next) setStatus(next);
      const settled = next !== null && ((next.status === 'done' && next.live) || next.status === 'error');
      if (!settled && Date.now() - (started.current ?? 0) < WATCH_FOR_MS) {
        timer = setTimeout(() => void tick(), POLL_EVERY_MS);
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [composeId]);

  const building = status === null || status.status === 'running' || status.status === 'idle';
  const failed = status?.status === 'error';

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
            {building ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin text-[color:var(--warn)] motion-reduce:animate-none" />
            ) : failed ? (
              <XCircle aria-hidden="true" className="size-5 text-[color:var(--err)]" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-5 text-[color:var(--ok)]" />
            )}
            {c.watchTitle}
          </h2>
          <Badge tone={failed ? 'err' : building ? 'warn' : 'ok'}>
            {failed ? c.status.error : building ? c.watchRunning : c.watchDone}
          </Badge>
        </div>
        {failed ? <p className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">{c.watchError}</p> : null}
        <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)]" role="status" aria-live="polite">
          {status?.live ? (
            <CheckCircle2 aria-hidden="true" className="size-4 text-[color:var(--ok)]" />
          ) : (
            <CircleDashed aria-hidden="true" className="size-4 text-fg-subtle" />
          )}
          <span className={status?.live ? 'text-fg' : 'text-fg-muted'}>{status?.live ? c.watchLive : c.watchNotYet}</span>
          {status?.live && appUrl ? (
            <a href={appUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text underline-offset-2 hover:underline">
              <ExternalLink aria-hidden="true" className="size-3.5" />
              <span dir="ltr" className="mono" style={{ unicodeBidi: 'isolate' }}>
                {appUrl.replace(/^https:\/\//, '')}
              </span>
            </a>
          ) : null}
        </p>
      </CardBody>
    </Card>
  );
}
