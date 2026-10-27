import Link from 'next/link';
import { AlertTriangle, CalendarClock, Globe, PlugZap, UserPlus } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { subjectNameAr } from '@ayman/contracts/subjects';
import { Badge, Card, CardBody, cn } from '@ayman/ui';
import type { TenantList, TenantSummary } from '@/lib/provisioning/tenants';
import { TenantRowActions } from './tenant-row-actions';

const c = copy.admin.tenants;

/** Latin digits inside Arabic, like every other date on the platform. */
const dateTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'long' });

/** A month before `exp` is when the owner has to act: a document whose job
 *  is to CLOSE a feature re-opens it the moment it lapses. */
const RENEW_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/**
 * One colour per teacher, picked from the key so it is stable across views:
 * two «م» initials side by side read as one card printed twice otherwise.
 * Tokens only (CLAUDE.md §7).
 */
const AVATAR_HUES = ['var(--a-9)', 'var(--info)', 'var(--ok)', 'var(--warn)', 'var(--a-11)'] as const;

function hueFor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length]!;
}

const STATUS_TONE: Record<TenantSummary['status'], 'ok' | 'warn' | 'err' | 'neutral'> = {
  done: 'ok',
  running: 'warn',
  error: 'err',
  idle: 'neutral',
  unknown: 'neutral',
};

/**
 * «المدرّسين» — one card per stack, read off Dokploy on every view.
 *
 * Request-time on purpose: the status is "is it building right now", and a
 * cached answer to that is a wrong answer. The page streams this section, so
 * a slow panel never holds up the rest of the screen.
 */
export function TenantsSection({ list, now }: { list: TenantList; now: number }) {
  return (
    <section className="mb-8">
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.listTitle}</h2>
        <span className="group-head__note">{c.listLead}</span>
      </div>

      {!list.connected ? (
        <Card>
          <CardBody className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text">
              <PlugZap className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-fg">{c.notConnected}</p>
              <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.notConnectedHint}</p>
              <p dir="ltr" className="mono mt-2 text-start text-[length:var(--fs-mono-label)] text-fg-muted" style={{ unicodeBidi: 'isolate' }}>
                CONTROL_PLANE_DOKPLOY_KEY=…
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {list.connected && !list.reachable ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--err),transparent_60%)] bg-[color-mix(in_oklch,var(--err),transparent_92%)] p-3 text-[length:var(--fs-text-sm)]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[color:var(--err)]" />
          <div className="min-w-0">
            <p className="text-fg">{c.unreachable}</p>
            {list.problem ? (
              <p dir="ltr" className="mono mt-1 break-words text-start text-[length:var(--fs-text-xs)] text-fg-subtle" style={{ unicodeBidi: 'isolate' }}>
                {list.problem}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {list.connected && list.reachable && list.tenants.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-3">
            <p className="text-fg">{c.empty}</p>
            <NewTeacherLink />
          </CardBody>
        </Card>
      ) : null}

      {list.tenants.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.tenants.map((tenant) => (
            <li key={tenant.key}>
              <TenantCard tenant={tenant} now={now} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function NewTeacherLink() {
  return (
    <Link
      href="/admin/platforms/new"
      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 font-medium text-[#1A1206] hover:bg-accent-hover"
    >
      <UserPlus aria-hidden="true" className="size-4" />
      {c.newTeacher}
    </Link>
  );
}

function entitlementsLine(exp: number | null, now: number): { text: string; tone: 'muted' | 'warn' | 'err' } {
  if (exp === null) return { text: c.entitlementsNone, tone: 'muted' };
  const date = dateOnly.format(new Date(exp * 1000));
  if (exp <= now) return { text: c.entitlementsExpired, tone: 'err' };
  if (exp - now < RENEW_WINDOW_SECONDS) return { text: formatCopy(c.entitlementsSoon, { date }), tone: 'warn' };
  return { text: formatCopy(c.entitlementsUntil, { date }), tone: 'muted' };
}

function TenantCard({ tenant, now }: { tenant: TenantSummary; now: number }) {
  const host = tenant.appUrl ? tenant.appUrl.replace(/^https?:\/\//, '') : null;
  const entitlements = entitlementsLine(tenant.entitlementsExp, now);
  const initial = Array.from(tenant.name.replace(/^(م|أ|د|مستر|مس)\.?\s+/, '')).find((char) => /\p{L}|\p{N}/u.test(char)) ?? '؟';

  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full text-[length:var(--fs-title-4)] font-semibold"
            style={{ background: `color-mix(in oklch, ${hueFor(tenant.key)}, transparent 82%)`, color: hueFor(tenant.key) }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{tenant.name}</h3>
              <Badge tone={STATUS_TONE[tenant.status]}>{c.status[tenant.status]}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
              {tenant.subject ? (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg">
                  {subjectNameAr(tenant.subject)}
                </span>
              ) : null}
              {host ? (
                <span className="inline-flex items-center gap-1">
                  <Globe aria-hidden="true" className="size-3.5" />
                  <span dir="ltr" className="mono" style={{ unicodeBidi: 'isolate' }}>
                    {host}
                  </span>
                </span>
              ) : null}
              <span dir="ltr" className="mono text-[length:var(--fs-mono-label)] text-fg-subtle" style={{ unicodeBidi: 'isolate' }}>
                {tenant.key}
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
          <div className="rounded-lg bg-surface-2 p-2.5">
            <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.lastDeploy}</dt>
            <dd className="mt-0.5 text-fg">
              {tenant.lastDeployAt ? dateTime.format(new Date(tenant.lastDeployAt)) : c.neverDeployed}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-2 p-2.5">
            <dt className="flex items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-muted">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              {copy.admin.platforms.signTitle}
            </dt>
            <dd
              className={cn(
                'mt-0.5',
                entitlements.tone === 'err' && 'text-[color:var(--err)]',
                entitlements.tone === 'warn' && 'text-[color:var(--warn)]',
                entitlements.tone === 'muted' && 'text-fg',
              )}
            >
              {entitlements.text}
            </dd>
          </div>
        </dl>

        <div className="mt-auto">
          <TenantRowActions
            tenantKey={tenant.key}
            composeId={tenant.composeId}
            name={tenant.name}
            subject={tenant.subject}
            appUrl={tenant.appUrl}
            pendingHandover={tenant.pendingHandover}
            webhookUrl={tenant.webhookUrl}
          />
        </div>
      </CardBody>
    </Card>
  );
}
