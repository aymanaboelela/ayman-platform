'use client';

import { useEffect, useState } from 'react';
import type { WhatsappHealth } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { deviceHealthAction } from '../actions';
import { cairoWhen } from './when';

const c = copy.marketing;

/** Receipts arrive in seconds; a minute is fresh enough and costs nothing. */
const POLL_MS = 60_000;

/**
 * «الإرسال في آخر ٢٤ ساعة» — the answer to "is the number actually
 * delivering?", for the whole number rather than one campaign.
 *
 * Under the pairing card, because the two are different questions: a device
 * can be «متربط» and still deliver nothing — which is precisely the state the
 * platform could not see in 2026-09. The rate, the last delivery and WhatsApp's
 * own refusal codes (in Arabic) are what make that state visible without SSH.
 */
export function DeviceHealth({ initial }: { initial: WhatsappHealth | null }) {
  const [health, setHealth] = useState(initial);

  useEffect(() => {
    const timer = setInterval(async () => {
      const next = await deviceHealthAction();
      if (next) setHealth(next);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.healthTitle}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.healthLead}</p>
        {health ? <Body health={health} /> : <p className="text-fg-muted">{c.healthLoadFailed}</p>}
      </CardBody>
    </Card>
  );
}

function Body({ health }: { health: WhatsappHealth }) {
  const w = health.window;
  const lastDelivered = cairoWhen(health.lastDeliveredAt);

  return (
    <>
      {w.sent === 0 ? (
        <p className="text-fg-muted">{c.healthEmpty}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={c.healthSent} value={w.sent} />
          <Stat label={c.healthDelivered} value={w.delivered} tone="ok" />
          <Stat label={c.healthRead} value={w.read} tone="ok" />
          <Stat label={c.healthRefused} value={w.refused} tone={w.refused > 0 ? 'err' : undefined} />
          <Stat label={c.healthWaiting} value={w.waiting} />
        </dl>
      )}

      <p
        className={
          w.deliveryRate === null
            ? 'text-[length:var(--fs-text-sm)] text-fg-muted'
            : w.deliveryRate >= 0.8
              ? 'text-[length:var(--fs-text-sm)] font-medium text-ok'
              : 'text-[length:var(--fs-text-sm)] font-medium text-err'
        }
      >
        {w.deliveryRate === null
          ? c.healthRateNone
          : formatCopy(c.healthRate, { rate: Math.round(w.deliveryRate * 100) })}
      </p>

      <p className="text-[length:var(--fs-text-sm)] text-fg">
        {lastDelivered ? formatCopy(c.healthLastDelivered, { when: lastDelivered }) : c.healthNeverDelivered}
      </p>

      <div className="rounded-[var(--r-md)] border border-line-subtle p-3 text-[length:var(--fs-text-sm)]">
        <p className="text-fg">
          {formatCopy(c.healthCeiling, { used: health.ceiling.usedToday, limit: health.ceiling.limit })}
        </p>
        {health.ceiling.warmingUp ? (
          <p className="mt-1 text-fg-muted">{formatCopy(c.healthWarmup, { day: health.ceiling.day + 1 })}</p>
        ) : null}
      </div>

      {health.refusals.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.healthRefusalsTitle}</h3>
          <ul className="flex flex-col gap-2">
            {health.refusals.map((row) => (
              <li key={row.code} className="rounded-[var(--r-md)] border border-line-subtle p-3">
                <p className="text-[length:var(--fs-text-sm)] text-err">{row.explanation}</p>
                <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {formatCopy(c.healthRefusalCount, { n: row.count })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {health.recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[length:var(--fs-text-sm)] font-semibold text-fg">{c.healthRecentTitle}</h3>
          <ul className="flex flex-col divide-y divide-line-subtle">
            {health.recent.map((row, i) => (
              <li key={`${row.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[length:var(--fs-text-xs)]">
                <span className="mono text-fg" dir="ltr">
                  {row.phone}
                </span>
                <span className="text-fg-muted">{c.sendSources[row.source]}</span>
                <span className="text-fg-muted">{cairoWhen(row.at)}</span>
                {row.code ? (
                  <span className="mono text-err" dir="ltr">
                    {row.code}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'err' }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--r-md)] border border-line-subtle p-3">
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd
        className={`mono text-[length:var(--fs-title-3)] font-semibold ${
          tone === 'ok' ? 'text-ok' : tone === 'err' ? 'text-err' : 'text-fg'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
