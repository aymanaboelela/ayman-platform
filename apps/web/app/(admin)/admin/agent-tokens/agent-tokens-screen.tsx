'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';

import {
  AGENT_TOKEN_CATEGORIES,
  AGENT_TOKEN_LIFETIMES_DAYS,
  type AgentTokenCreated,
  type AgentTokenRow,
} from '@ayman/contracts/admin/agent-tokens';
import { copy } from '@ayman/contracts/copy/admin';
import { agentTokensCopy as c } from '@ayman/contracts/copy/agent-tokens';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody } from '@ayman/ui/components/card';
import { Checkbox } from '@ayman/ui/components/checkbox';
import { Input } from '@ayman/ui/components/input';
import { Select } from '@ayman/ui/components/select';

import { createAgentTokenAction, revokeAgentTokenAction } from './actions';

const roles = copy.admin.roles;
const dateTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

/** Latin text inside an Arabic page flips without this (CLAUDE.md §7). */
const LTR = { direction: 'ltr', unicodeBidi: 'isolate' } as const;

/** What «التصحيح بس» ticks — exactly what marking homework and exam papers calls. */
const GRADING = ['homework:read', 'homework:review', 'attempt:read', 'attempt:grade'];

/** `payment:review` → «المدفوعات · يراجع», same labels as the roles screen. */
function permissionLabel(permission: string): string {
  const [resource = '', action = ''] = permission.split(':');
  const actions = roles.action as Record<string, string | undefined>;
  const groups = roles.group as Record<string, string | undefined>;
  return `${groups[resource] ?? resource} · ${actions[action] ?? action}`;
}

function statusOf(row: AgentTokenRow): 'active' | 'expired' | 'revoked' {
  if (row.revokedAt) return 'revoked';
  if (new Date(row.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {done ? c.copied : c.copy}
    </Button>
  );
}

/**
 * The once-only reveal. Stays until «تمام، نسخته» — closing it by accident
 * would lose the key for good, since the API never returns it again.
 */
function Reveal({ created, host, onDone }: { created: AgentTokenCreated; host: string; onDone: () => void }) {
  const setup = `security add-generic-password -U -s platform-mcp -a ${host} -w`;
  return (
    <Card className="border-[color:var(--warn)]">
      <CardBody className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
            <KeyRound aria-hidden className="size-5 text-[color:var(--warn)]" />
            {c.revealTitle}
          </h2>
          <p className="mt-1 text-fg-muted">{c.revealLead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code
            style={LTR}
            className="mono min-w-0 flex-1 break-all rounded-sm border border-line bg-surface-3 px-3 py-2 text-fg"
          >
            {created.token}
          </code>
          <CopyButton text={created.token} />
        </div>
        <div>
          <p className="font-medium text-fg">{c.setupTitle}</p>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.setupLead}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code
              style={LTR}
              className="mono min-w-0 flex-1 break-all rounded-sm border border-line bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg"
            >
              {setup}
            </code>
            <CopyButton text={setup} />
          </div>
        </div>
        <Button type="button" onClick={onDone}>
          {c.done}
        </Button>
      </CardBody>
    </Card>
  );
}

function CreateForm({ grantable, onCreated }: { grantable: string[]; onCreated: (created: AgentTokenCreated) => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number>(90);
  const [held, setHeld] = useState<Set<string>>(() => new Set(GRADING.filter((p) => grantable.includes(p))));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  /* Only what this account may hand on — the API refuses anything else, so a
     checkbox for it would be a promise the server breaks. */
  const sections = useMemo(() => {
    const allowed = new Set(grantable);
    return AGENT_TOKEN_CATEGORIES.map((category) => ({
      ...category,
      permissions: category.permissions.filter((permission) => allowed.has(permission)),
    })).filter((category) => category.permissions.length > 0);
  }, [grantable]);

  const set = (permissions: readonly string[], on: boolean) =>
    setHeld((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (on) next.add(permission);
        else next.delete(permission);
      }
      return next;
    });

  const preset = (pick: (key: string, permission: string) => boolean) =>
    setHeld(
      new Set(sections.flatMap((section) => section.permissions.filter((p) => pick(section.key, p)))),
    );

  const submit = () =>
    start(async () => {
      const result = await createAgentTokenAction({ name, permissions: [...held], expiresInDays: days });
      if (result.ok) {
        setName('');
        onCreated(result.created);
      } else {
        toast.error(result.message);
      }
    });

  return (
    <Card>
      <CardBody className="space-y-5">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
          <KeyRound aria-hidden className="size-5 text-accent-text" />
          {c.createTitle}
        </h2>

        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="mb-1 block text-[length:var(--fs-text-sm)] font-medium text-fg">{c.nameLabel}</span>
            <Input
              value={name}
              maxLength={60}
              placeholder={c.namePlaceholder}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[length:var(--fs-text-sm)] font-medium text-fg">{c.lifetimeLabel}</span>
            <Select value={days} disabled={pending} onChange={(event) => setDays(Number(event.target.value))}>
              {AGENT_TOKEN_LIFETIMES_DAYS.map((d) => (
                <option key={d} value={d}>
                  {c.lifetime[d]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div>
          <p className="font-medium text-fg">{c.permissionsTitle}</p>
          <p className="mt-0.5 text-[length:var(--fs-text-sm)] text-fg-muted">{c.permissionsLead}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.presetTitle}</span>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => preset((_k, p) => GRADING.includes(p))}>
              {c.presetGrading}
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => preset((k) => k !== 'finance')}>
              {c.presetTeaching}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => preset(() => true)}>
              {c.presetAll}
            </Button>
          </div>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.presetHint}</p>
        </div>

        <ul className="space-y-2">
          {sections.map((section) => {
            const on = section.permissions.filter((p) => held.has(p)).length;
            const all = section.permissions.length;
            const isOpen = open.has(section.key);
            return (
              <li key={section.key} className="rounded-md border border-line-subtle bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <Checkbox
                      checked={on === all ? true : on > 0 ? 'indeterminate' : false}
                      disabled={pending}
                      onCheckedChange={(checked) => set(section.permissions, checked === true)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-fg">{section.titleAr}</span>
                      <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{section.hintAr}</span>
                    </span>
                  </label>
                  <Badge tone={on === all ? 'ok' : on === 0 ? 'neutral' : 'warn'}>
                    {on === all ? c.countAll : on === 0 ? c.countNone : formatCopy(c.count, { on, all })}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(section.key)) next.delete(section.key);
                        else next.add(section.key);
                        return next;
                      })
                    }
                  >
                    {isOpen ? c.close : c.open}
                  </Button>
                </div>
                {isOpen ? (
                  <ul className="mt-3 grid gap-1.5 border-t border-line-subtle pt-3 sm:grid-cols-2">
                    {section.permissions.map((permission) => (
                      <li key={permission}>
                        <label title={permission} className="flex items-center gap-2 text-[length:var(--fs-text-sm)]">
                          <Checkbox
                            checked={held.has(permission)}
                            disabled={pending}
                            onCheckedChange={(checked) => set([permission], checked === true)}
                          />
                          {permissionLabel(permission)}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        <Button type="button" disabled={pending} onClick={submit}>
          <ShieldCheck aria-hidden className="size-4" />
          {pending ? c.creating : c.create}
        </Button>
      </CardBody>
    </Card>
  );
}

function TokenList({ rows, onRevoked }: { rows: AgentTokenRow[]; onRevoked: (row: AgentTokenRow) => void }) {
  const [pending, start] = useTransition();
  const [showPermissions, setShowPermissions] = useState<string | null>(null);

  const revoke = (row: AgentTokenRow) => {
    if (!window.confirm(formatCopy(c.revokeConfirm, { name: row.name }))) return;
    start(async () => {
      const result = await revokeAgentTokenAction(row.id);
      if (result.ok) {
        toast.success(c.revoked);
        onRevoked(result.row);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-[length:var(--fs-title-4)] font-semibold text-fg">{c.listTitle}</h2>
        {rows.length === 0 ? (
          <p className="text-fg-muted">{c.listEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const status = statusOf(row);
              return (
                <li key={row.id} className="rounded-md border border-line-subtle bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <KeyRound
                      aria-hidden
                      className={status === 'active' ? 'size-4 text-accent-text' : 'size-4 text-fg-muted'}
                    />
                    <span className="font-medium text-fg">{row.name}</span>
                    <code style={LTR} className="mono text-[length:var(--fs-text-xs)] text-fg-muted">
                      {row.hint}…
                    </code>
                    <Badge tone={status === 'active' ? 'ok' : status === 'revoked' ? 'err' : 'warn'}>
                      {status === 'active' ? c.statusActive : status === 'revoked' ? c.statusRevoked : c.statusExpired}
                    </Badge>
                    <span className="ms-auto flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={showPermissions === row.id}
                        onClick={() => setShowPermissions((id) => (id === row.id ? null : row.id))}
                      >
                        {formatCopy(c.permissionsCount, { n: row.permissions.length })}
                      </Button>
                      {status === 'active' ? (
                        <Button variant="danger" size="sm" disabled={pending} onClick={() => revoke(row)}>
                          <Trash2 aria-hidden className="size-4" />
                          {c.revoke}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                    <span>
                      {c.colCreated}: {dateOnly.format(new Date(row.createdAt))}
                    </span>
                    <span>
                      {c.colLastUsed}: {row.lastUsedAt ? dateTime.format(new Date(row.lastUsedAt)) : c.neverUsed}
                    </span>
                    <span>
                      {c.colExpires}: {dateOnly.format(new Date(row.expiresAt))}
                    </span>
                    <span>{formatCopy(c.createdBy, { name: row.createdBy.name })}</span>
                  </p>
                  {showPermissions === row.id ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-line-subtle pt-2">
                      {row.permissions.map((permission) => (
                        <li key={permission}>
                          <Badge tone="accent" title={permission}>
                            {permissionLabel(permission)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export function AgentTokensScreen({
  rows: initialRows,
  grantable,
  host,
}: {
  rows: AgentTokenRow[];
  grantable: string[];
  host: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [created, setCreated] = useState<AgentTokenCreated | null>(null);

  return (
    <div className="space-y-6">
      {created ? (
        <Reveal created={created} host={host} onDone={() => setCreated(null)} />
      ) : (
        <CreateForm
          grantable={grantable}
          onCreated={(next) => {
            setCreated(next);
            setRows((current) => [next.row, ...current]);
          }}
        />
      )}
      <TokenList
        rows={rows}
        onRevoked={(row) => setRows((current) => current.map((r) => (r.id === row.id ? row : r)))}
      />
    </div>
  );
}
