'use client';

import { useState } from 'react';
import { Ban, Copy, Eye, KeyRound, RotateCcw, UserPlus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { montageCopy } from '@ayman/contracts/copy/montage';
import { formatCopy } from '@ayman/contracts/format';
import { MONTAGE_EDITOR_PASSWORD_MIN, type MontageEditor } from '@ayman/contracts/montage';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { cn } from '@ayman/ui/lib/cn';
import { montageApi, MontageRequestError } from '@/lib/montage-client';
import { formatBytes } from '@/lib/upload-format';

const c = montageCopy;
const e = montageCopy.editors;
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium' });

/** The API's Arabic sentence when it sent one (a taken number, a bad phone), else the generic one. */
function errorText(error: unknown): string {
  if (error instanceof MontageRequestError && error.detail !== null && /[؀-ۿ]/.test(error.detail)) {
    return error.detail;
  }
  return c.failed;
}

/** `+201500000777` → `01500000777`: the way the editor types it at sign-in. */
function localPhone(phone: string): string {
  return phone.startsWith('+20') ? `0${phone.slice(3)}` : phone;
}

/** The three lines the instructor sends the editor. */
function loginText(phone: string, password: string): string {
  return formatCopy(e.loginLine, { url: `${window.location.origin}/login`, phone: localPhone(phone), password });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(e.copied);
  } catch {
    toast.error(c.failed);
  }
}

/**
 * «المونتيرين» — one card per editor account, on the instructor's screen.
 *
 * Every editor signs in as themself, so their uploads carry their name and
 * «شوف شغله» filters the list to them. A password is set here, never read
 * back: the dialog that sets it is the only moment it is on screen, which is
 * why that dialog offers «انسخ بيانات الدخول».
 */
export function MontageEditors({
  initial,
  selected,
  onSelect,
}: {
  initial: MontageEditor[];
  /** The editor whose work the list below is showing, if any. */
  selected: string | null;
  onSelect: (editorId: string | null) => void;
}) {
  const [editors, setEditors] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<MontageEditor | null>(null);
  const [disabling, setDisabling] = useState<MontageEditor | null>(null);

  const replace = (editor: MontageEditor) =>
    setEditors((current) =>
      current.some((entry) => entry.id === editor.id)
        ? current.map((entry) => (entry.id === editor.id ? editor : entry))
        : [...current, editor],
    );

  const enable = async (editor: MontageEditor) => {
    try {
      replace(await montageApi.setEditorDisabled(editor.id, false));
      toast.success(e.enabledDone);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <section className="grid gap-3 rounded-2xl border border-line bg-surface-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--fs-title-3)] font-semibold text-fg">{e.title}</h2>
          <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{e.lead}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          {e.add}
        </Button>
      </div>

      {editors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-fg-muted">{e.empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {editors.map((editor) => (
            <li
              key={editor.id}
              className={cn(
                'grid gap-3 rounded-xl border bg-surface-1 p-3 transition-colors',
                selected === editor.id ? 'border-accent' : 'border-line',
                editor.disabled && 'opacity-75',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-xl',
                    editor.disabled
                      ? 'bg-surface-3 text-fg-muted'
                      : 'bg-[color-mix(in_oklab,var(--viz-3)_18%,var(--n-2))] text-[color:var(--viz-3)]',
                  )}
                >
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words font-semibold text-fg">{editor.name}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                        editor.disabled
                          ? 'bg-[color-mix(in_oklab,var(--err)_14%,var(--n-2))] text-err'
                          : 'bg-[color-mix(in_oklab,var(--ok)_16%,var(--n-2))] text-ok',
                      )}
                    >
                      {editor.disabled ? e.disabled : e.active}
                    </span>
                  </div>
                  {editor.phone !== null ? (
                    <p dir="ltr" className="mono text-start text-[length:var(--fs-text-xs)] text-fg-muted [unicode-bidi:isolate]">
                      {localPhone(editor.phone)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {formatCopy(e.videos, { count: String(editor.videoCount) })}
                    {editor.videoCount > 0 ? ` · ${formatBytes(editor.totalBytes)}` : ''}
                    {' · '}
                    {editor.lastUploadAt === null
                      ? e.never
                      : formatCopy(e.lastUpload, { date: dateFormatter.format(new Date(editor.lastUploadAt)) })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selected === editor.id ? 'primary' : 'secondary'}
                  onClick={() => onSelect(selected === editor.id ? null : editor.id)}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  {e.showWork}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPasswordFor(editor)}>
                  <KeyRound className="size-4" aria-hidden="true" />
                  {e.password}
                </Button>
                {editor.disabled ? (
                  <Button size="sm" variant="ghost" onClick={() => void enable(editor)}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {e.enable}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-err hover:text-err" onClick={() => setDisabling(editor)}>
                    <Ban className="size-4" aria-hidden="true" />
                    {e.disable}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} onCreated={replace} />
      <PasswordDialog editor={passwordFor} onClose={() => setPasswordFor(null)} onSaved={replace} />
      <DisableDialog
        editor={disabling}
        onClose={() => setDisabling(null)}
        onDone={(editor) => {
          replace(editor);
          setDisabling(null);
          toast.success(e.disabledDone);
        }}
      />
    </section>
  );
}

/** After a password is set, its one chance to be copied — it is never shown again. */
function CredentialsReady({ phone, password }: { phone: string; password: string }) {
  return (
    <div className="grid gap-2 rounded-lg bg-[color-mix(in_oklab,var(--ok)_12%,var(--n-2))] p-3">
      <pre dir="ltr" className="mono whitespace-pre-wrap text-start text-[length:var(--fs-text-sm)] text-fg [unicode-bidi:isolate]">
        {loginText(phone, password)}
      </pre>
      <Button size="sm" variant="secondary" onClick={() => void copyText(loginText(phone, password))}>
        <Copy className="size-4" aria-hidden="true" />
        {e.copy}
      </Button>
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (editor: MontageEditor) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ phone: string; password: string } | null>(null);

  const close = () => {
    setName('');
    setPhone('');
    setPassword('');
    setDone(null);
    onClose();
  };

  const create = async () => {
    setBusy(true);
    try {
      const editor = await montageApi.createEditor({ name: name.trim(), phone: phone.trim(), password });
      onCreated(editor);
      setDone({ phone: editor.phone ?? phone, password });
      toast.success(e.created);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent closeLabel={c.close} className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>{e.createTitle}</DialogTitle>
          <DialogDescription>{e.createLead}</DialogDescription>
        </DialogHeader>
        {done !== null ? (
          <CredentialsReady phone={done.phone} password={done.password} />
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="editor-name">{e.name}</Label>
              <Input id="editor-name" value={name} maxLength={80} placeholder={e.namePlaceholder} onChange={(ev) => setName(ev.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="editor-phone">{e.phone}</Label>
              <Input
                id="editor-phone"
                dir="ltr"
                inputMode="tel"
                value={phone}
                placeholder="01xxxxxxxxx"
                onChange={(ev) => setPhone(ev.target.value)}
              />
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{e.phoneHint}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="editor-password">{e.passwordLabel}</Label>
              <Input id="editor-password" dir="ltr" value={password} onChange={(ev) => setPassword(ev.target.value)} />
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{e.passwordHint}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            {c.close}
          </Button>
          {done === null ? (
            <Button
              onClick={() => void create()}
              disabled={busy || name.trim().length < 2 || phone.trim() === '' || password.length < MONTAGE_EDITOR_PASSWORD_MIN}
            >
              {busy ? e.creating : e.create}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  editor,
  onClose,
  onSaved,
}: {
  editor: MontageEditor | null;
  onClose: () => void;
  onSaved: (editor: MontageEditor) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setDone(null);
    onClose();
  };

  const save = async () => {
    if (editor === null) return;
    setBusy(true);
    try {
      onSaved(await montageApi.setEditorPassword(editor.id, password));
      setDone(password);
      toast.success(e.passwordSaved);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={editor !== null} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent closeLabel={c.close} className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>{formatCopy(e.passwordTitle, { name: editor?.name ?? '' })}</DialogTitle>
          <DialogDescription>{e.passwordLead}</DialogDescription>
        </DialogHeader>
        {done !== null && editor?.phone ? (
          <CredentialsReady phone={editor.phone} password={done} />
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="editor-new-password">{e.passwordLabel}</Label>
            <Input id="editor-new-password" dir="ltr" value={password} onChange={(ev) => setPassword(ev.target.value)} />
            <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{e.passwordHint}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            {c.close}
          </Button>
          {done === null ? (
            <Button onClick={() => void save()} disabled={busy || password.length < MONTAGE_EDITOR_PASSWORD_MIN}>
              {busy ? c.saving : e.passwordSave}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({
  editor,
  onClose,
  onDone,
}: {
  editor: MontageEditor | null;
  onClose: () => void;
  onDone: (editor: MontageEditor) => void;
}) {
  const [busy, setBusy] = useState(false);
  const disable = async () => {
    if (editor === null) return;
    setBusy(true);
    try {
      onDone(await montageApi.setEditorDisabled(editor.id, true));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={editor !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent closeLabel={c.close} className="max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>{formatCopy(e.disableTitle, { name: editor?.name ?? '' })}</DialogTitle>
          <DialogDescription>{e.disableLead}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {c.cancel}
          </Button>
          <Button variant="danger" onClick={() => void disable()} disabled={busy}>
            {e.disableConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
