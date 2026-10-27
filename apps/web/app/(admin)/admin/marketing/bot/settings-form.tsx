'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Moon, ShieldCheck, Sparkles } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import type { BotSettings } from '@ayman/contracts/wa-bot/schemas';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { saveBotSettingsAction } from '../wa-bot-actions';

const c = bot.admin;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * The switches. The number fields carry the schema's own ceilings as their
 * `min`/`max`, so the browser refuses what the API would refuse — and the
 * line under them says why the ceilings exist at all.
 */
export function BotSettingsForm({ initial, modelAvailable }: { initial: BotSettings; modelAvailable: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof BotSettings>(key: K, value: BotSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  function save() {
    startTransition(async () => {
      const result = await saveBotSettingsAction(settings);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSettings(result.data.settings);
      toast.success(c.saved, { id: 'wa-bot-settings' });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-[color:var(--ok)]" aria-hidden="true" />
          {c.settingsTitle}
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <Row
          title={c.enabled}
          hint={c.enabledHint}
          control={<Switch checked={settings.enabled} onCheckedChange={(v) => set('enabled', v)} aria-label={c.enabled} />}
          tone={settings.enabled ? 'ok' : 'err'}
        />

        <div className="rounded-lg border border-line-subtle p-3">
          <Row
            icon={<Moon className="size-4 text-[color:var(--info)]" aria-hidden="true" />}
            title={c.quietHours}
            hint={c.quietHoursHint}
            control={
              <Switch
                checked={settings.quietHoursEnabled}
                onCheckedChange={(v) => set('quietHoursEnabled', v)}
                aria-label={c.quietHours}
              />
            }
          />
          <div className={cn('mt-3 flex flex-wrap gap-3', !settings.quietHoursEnabled && 'opacity-50')}>
            <HourSelect label={c.quietFrom} value={settings.quietStartHour} onChange={(v) => set('quietStartHour', v)} />
            <HourSelect label={c.quietTo} value={settings.quietEndHour} onChange={(v) => set('quietEndHour', v)} />
          </div>
        </div>

        <NumberField
          label={c.silence}
          hint={c.silenceHint}
          unit={c.hours}
          min={1}
          max={168}
          value={settings.handoffSilenceHours}
          onChange={(v) => set('handoffSilenceHours', v)}
        />

        <Row
          icon={<Sparkles className="size-4 text-accent-text" aria-hidden="true" />}
          title={c.aiFallback}
          hint={modelAvailable ? c.aiFallbackHint : c.aiUnavailable}
          control={
            <Switch
              checked={settings.aiFallback && modelAvailable}
              disabled={!modelAvailable}
              onCheckedChange={(v) => set('aiFallback', v)}
              aria-label={c.aiFallback}
            />
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label={c.minGap}
            unit={c.seconds}
            min={30}
            max={3600}
            value={settings.minGapSeconds}
            onChange={(v) => set('minGapSeconds', v)}
          />
          <NumberField
            label={c.perChatCap}
            min={1}
            max={20}
            value={settings.perChatDailyCap}
            onChange={(v) => set('perChatDailyCap', v)}
          />
          <NumberField
            label={c.dailyCap}
            min={10}
            max={500}
            value={settings.dailyCap}
            onChange={(v) => set('dailyCap', v)}
          />
        </div>
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.capsHint}</p>

        <div>
          <Button onClick={save} disabled={pending}>
            {c.save}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Row({
  title,
  hint,
  control,
  icon,
  tone,
}: {
  title: string;
  hint?: string;
  control: ReactNode;
  icon?: ReactNode;
  tone?: 'ok' | 'err';
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium text-fg">
          {icon}
          {title}
          {tone ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                tone === 'ok'
                  ? 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]'
                  : 'bg-[color-mix(in_oklch,var(--err),transparent_86%)] text-[color:var(--err)]',
              )}
            >
              {tone === 'ok' ? c.enabledChip : c.disabledChip}
            </span>
          ) : null}
        </p>
        {hint ? <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</p> : null}
      </div>
      {control}
    </div>
  );
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mono h-9 rounded-lg border border-line bg-surface-2 px-2 text-fg"
        dir="ltr"
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, '0')}:00
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  hint,
  unit,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  unit?: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  // A draft while typing, clamped on blur: clamping every keystroke turns
  // «4» on the way to «45» into the minimum, and the field fights the hand.
  const [draft, setDraft] = useState(String(value));
  function commit() {
    const parsed = Math.round(Number(draft));
    const next = Number.isFinite(parsed) && draft.trim() !== '' ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    onChange(next);
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="mono h-9 w-24 rounded-lg border border-line bg-surface-2 px-2 text-fg focus:border-accent focus:outline-none"
        />
        {unit ? <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{unit}</span> : null}
      </span>
      {hint ? <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{hint}</span> : null}
    </label>
  );
}
