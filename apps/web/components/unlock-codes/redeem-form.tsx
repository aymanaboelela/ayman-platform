'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ClipboardPaste,
  GraduationCap,
  KeyRound,
  Loader2,
  PlayCircle,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import {
  RedeemUnlockCodeResponseSchema,
  UNLOCK_CODE_LENGTH,
  isUnlockCodeShape,
  normaliseUnlockCode,
  type RedeemUnlockCodeResponse,
} from '@ayman/contracts/unlock-codes';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiPost } from '@/lib/api';
import { KIND_ICON } from './kind-icons';

const c = copy.unlockCodes;

/** The API's refusal → the sentence the student reads. Anything unrecognised
 *  is «مقدرناش نوصل», never a raw status. */
function messageFor(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return c.errors.network;
  const payload = (error.payload ?? {}) as { code?: unknown; details?: { retryAfterSeconds?: unknown } };
  switch (payload.code) {
    case 'unlock_invalid':
      return c.errors.invalid;
    case 'unlock_used':
      return c.errors.used;
    case 'unlock_revoked':
      return c.errors.revoked;
    case 'unlock_course_unavailable':
      return c.errors.course_unavailable;
    case 'unlock_locked': {
      const seconds = Number(payload.details?.retryAfterSeconds ?? 60);
      return formatCopy(c.errors.locked, { minutes: Math.max(1, Math.ceil(seconds / 60)) });
    }
  }
  if (error.status === 400) return c.errors.shape;
  // The route's own `@Throttle` answers 429 with no body of ours.
  if (error.status === 429) return formatCopy(c.errors.locked, { minutes: 1 });
  return c.errors.network;
}

/** Clipboard support never changes during a page's life. */
const noSubscription = () => () => {};

/** Six coloured scraps per hue, scattered — set once per success. */
function confettiPieces(): CSSProperties[] {
  const hues = ['var(--p-400)', 'var(--viz-1)', 'var(--viz-2)', 'var(--viz-4)', 'var(--ok)', 'var(--a-9)'];
  return Array.from({ length: 24 }, (_, index) => ({
    insetInlineStart: `${4 + ((index * 37) % 92)}%`,
    background: hues[index % hues.length],
    animationDelay: `${(index % 8) * 0.06}s`,
    ['--dx' as string]: `${((index * 53) % 120) - 60}px`,
    ['--rot' as string]: `${360 + ((index * 97) % 540)}deg`,
  }));
}

/**
 * «تفعيل الكود» — six boxes, one real input.
 *
 * The browser owns the text field (paste, autofill, the phone keyboard, the
 * screen reader); the boxes are a picture of its value. Nothing is sent until
 * the student presses the button: every wrong code costs a strike on the
 * server's attempt ladder, so auto-submitting on the sixth character would
 * spend strikes on half-corrected typos.
 */
export function RedeemForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemUnlockCodeResponse | null>(null);
  // «لصق» only where the clipboard can actually be read (a secure context);
  // `false` on the server so the first paint and hydration agree.
  const canPaste = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.clipboard?.readText === 'function',
    () => false,
  );

  function update(raw: string) {
    setError(null);
    setValue(normaliseUnlockCode(raw).replace(/[^A-Z0-9]/g, '').slice(0, UNLOCK_CODE_LENGTH));
  }

  async function paste() {
    try {
      update(await navigator.clipboard.readText());
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (pending) return;
    if (!isUnlockCodeShape(value)) {
      setError(c.errors.shape);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await apiPost('/api/me/unlock-codes/redeem', RedeemUnlockCodeResponseSchema, {
        code: value,
      });
      setResult(response);
      // The history list and the library read server-side; the new lecture
      // must be on them when the student goes back.
      router.refresh();
    } catch (caught) {
      setError(messageFor(caught));
      // Back into the field: on a phone the keyboard stays up for the fix.
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setResult(null);
    setValue('');
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (result) return <RedeemSuccess result={result} onAnother={reset} compact={compact} />;

  const complete = value.length === UNLOCK_CODE_LENGTH;
  const active = Math.min(value.length, UNLOCK_CODE_LENGTH - 1);

  return (
    <form onSubmit={submit} noValidate>
      <div className={cn('uc-code', error && 'is-error')}>
        <input
          ref={inputRef}
          className="uc-code__input"
          value={value}
          onChange={(event) => update(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={c.inputLabel}
          aria-describedby="uc-hint"
          aria-invalid={error ? true : undefined}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          dir="ltr"
          maxLength={UNLOCK_CODE_LENGTH + 6}
          disabled={pending}
        />
        <div className="uc-code__boxes" aria-hidden="true">
          {Array.from({ length: UNLOCK_CODE_LENGTH }, (_, index) => (
            <span
              key={index}
              className={cn(
                'uc-code__box',
                value[index] && 'is-filled',
                focused && index === active && 'is-active',
              )}
            >
              {value[index] ?? ''}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <p className="uc-error" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : (
        <p id="uc-hint" className="uc-hint">
          {c.inputHint}
        </p>
      )}

      <div className="uc-actions">
        <button type="submit" className="uc-btn uc-btn--primary" disabled={pending || !complete}>
          {pending ? (
            <Loader2 className="uc-spin size-5" aria-hidden="true" />
          ) : (
            <KeyRound className="size-5" aria-hidden="true" />
          )}
          {pending ? c.submitting : c.submit}
        </button>
        {canPaste && !compact ? (
          <button type="button" className="uc-btn uc-btn--ghost" onClick={paste} disabled={pending}>
            <ClipboardPaste className="size-5" aria-hidden="true" />
            {c.paste}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function RedeemSuccess({
  result,
  onAnother,
  compact,
}: {
  result: RedeemUnlockCodeResponse;
  onAnother: () => void;
  compact: boolean;
}) {
  const [pieces] = useState(confettiPieces);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lessonHref = (lessonId: string) =>
    `/courses/${encodeURIComponent(result.course.slug)}/lessons/${lessonId}`;

  // Focus moves to the news, so a screen reader announces it and a keyboard
  // user is not left on a button that no longer exists.
  useEffect(() => titleRef.current?.focus(), []);

  return (
    <div className="uc-success" role="status">
      <div className="uc-confetti" aria-hidden="true">
        {pieces.map((style, index) => (
          <span key={index} style={style} />
        ))}
      </div>

      <div className="uc-success__badge">
        <Check className="size-9" strokeWidth={3} aria-hidden="true" />
      </div>
      <h2 ref={titleRef} tabIndex={-1} className="uc-success__title outline-none">
        {c.successTitle}
      </h2>
      <p className="uc-success__lead">{formatCopy(c.successLead, { course: result.course.title })}</p>

      <ul className="uc-opened">
        {result.opened.map((item, index) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={`${item.kind}-${index}`} className={`uc-item uc-item--${item.kind}`}>
              <span className="uc-item__icon" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="uc-item__body">
                <span className="uc-item__kind">{c.kind[item.kind]}</span>
                <span className="uc-item__title">{item.title}</span>
                <span className="uc-item__meta">
                  {item.kind === 'lesson'
                    ? c.withExtras
                    : formatCopy(c.lessonCount, { count: item.lessonCount })}
                </span>
              </span>
              {item.lessonId ? (
                <Link href={lessonHref(item.lessonId)} className="chip chip--solid">
                  {c.open}
                </Link>
              ) : (
                <span className="chip chip--quiet">{c.comingSoon}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="uc-actions">
        {result.startLessonId ? (
          <Link href={lessonHref(result.startLessonId)} className="uc-btn uc-btn--primary">
            <PlayCircle className="size-5" aria-hidden="true" />
            {c.successStart}
          </Link>
        ) : null}
        {compact ? null : (
          <Link
            href={`/library/${encodeURIComponent(result.course.slug)}`}
            className="uc-btn uc-btn--ghost"
          >
            <GraduationCap className="size-5" aria-hidden="true" />
            {c.successCourse}
          </Link>
        )}
        <button type="button" className="uc-btn uc-btn--ghost" onClick={onAnother}>
          <RotateCcw className="size-5" aria-hidden="true" />
          {c.successAnother}
        </button>
      </div>
    </div>
  );
}
