'use client';

import { useState, type FormEvent } from 'react';
import { CornerUpRight, Send } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import {
  ConversationThreadSchema,
  MESSAGE_MAX,
  type ConversationThread,
} from '@ayman/contracts/assistant/conversation';
import { Button } from '@ayman/ui/components/button';
import { Field, FieldLabel } from '@ayman/ui/components/field';
import { Input } from '@ayman/ui/components/input';
import { Textarea } from '@ayman/ui/components/textarea';
import { ApiRequestError, apiPost } from '@/lib/api';
import { assistantPathLabels } from '@/lib/assistant-path';

const c = copy.assistant.escalate;

/**
 * The handoff: the moment the script runs out and a person takes over.
 *
 * ## The path comes along
 *
 * `entryPath` is submitted unchanged from the trail the student walked, so the
 * instructor opens the thread already knowing they were on «الاشتراك والحساب ←
 * الكورس بكام؟» before they typed a word. That is the difference between an
 * inbox of context-free questions and one he can answer in a sentence.
 *
 * ## A guest is asked for a name and a number; a student never is
 *
 * `isSignedIn` comes back with the thread lookup rather than from a second
 * request. Asking a signed-in student to re-type what their profile already
 * holds is the kind of small disrespect that makes a product feel unfinished.
 */
export function AssistantEscalate({
  entryPath,
  isSignedIn,
  onOpened,
  onBack,
}: {
  entryPath: string[];
  isSignedIn: boolean;
  onOpened: (thread: ConversationThread) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crumbs = assistantPathLabels(entryPath);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const thread = await apiPost('/api/assistant/conversations', ConversationThreadSchema, {
        entryPath,
        message,
        // Omitted entirely for a signed-in student — the server ignores them
        // anyway, and empty strings would fail the contract's own minimum
        // lengths for no reason.
        ...(isSignedIn ? {} : { name, phone }),
      });
      onOpened(thread);
    } catch (caught) {
      /*
       * 429 gets its own message. "Try again" is useless advice when the
       * server is telling you to wait — and a visitor who hits the limit is
       * far more often an impatient student double-tapping than an attacker.
       */
      setError(caught instanceof ApiRequestError && caught.status === 429 ? c.tooMany : c.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      // `method="post"` — see `auth/login-form.tsx`. A form with no method
      // submits as GET before React attaches `onSubmit`, which would put the
      // student's typed message into the URL and their browser history.
      method="post"
      onSubmit={submit}
      className="flex flex-col gap-3.5 p-4"
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
      >
        <CornerUpRight className="size-3.5" aria-hidden="true" />
        {copy.assistant.choices.back}
      </button>

      {crumbs.length > 0 ? (
        <div className="rounded-lg border border-line-subtle bg-surface-2 px-3 py-2">
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.pathLabel}</p>
          <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg">{crumbs.join(' ← ')}</p>
        </div>
      ) : null}

      <p className="text-[length:var(--fs-text-sm)] leading-[1.7] text-fg">
        {isSignedIn ? c.lead : c.leadGuest}
      </p>

      {isSignedIn ? null : (
        <>
          <Field name="name">
            <FieldLabel htmlFor="assistant-name">{c.name}</FieldLabel>
            <Input
              id="assistant-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={c.namePlaceholder}
              autoComplete="name"
              required
              maxLength={120}
            />
          </Field>
          <Field name="phone">
            <FieldLabel htmlFor="assistant-phone">{c.phone}</FieldLabel>
            <Input
              id="assistant-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={c.phonePlaceholder}
              // `tel`, so a phone shows a keypad rather than a full keyboard.
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
            />
          </Field>
        </>
      )}

      <Field name="message">
        <FieldLabel htmlFor="assistant-message">{c.message}</FieldLabel>
        <Textarea
          id="assistant-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={c.messagePlaceholder}
          required
          rows={4}
          // The same ceiling the contract enforces. Stopping the typing is
          // kinder than accepting 3000 characters and rejecting them on submit.
          maxLength={MESSAGE_MAX}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-[length:var(--fs-text-sm)] text-[color:var(--err)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        <Send className="size-4" aria-hidden="true" />
        {pending ? c.sending : c.send}
      </Button>
    </form>
  );
}
