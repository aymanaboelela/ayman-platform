'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, Trash2 } from 'lucide-react';
import { MAX_VOICE_SECONDS } from '@ayman/contracts/admin/media';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.assistant.inbox;

/**
 * The container this browser can actually record, with the extension that
 * matches it.
 *
 * Chrome and Firefox do WebM/Opus; Safari does MP4/AAC and refuses WebM
 * outright. Asking `MediaRecorder` rather than sniffing the user agent is the
 * only way that stays right when a browser gains a codec — and the server
 * sniffs the bytes anyway, so a wrong answer here is a 400 rather than a
 * mislabelled file.
 */
function pickMimeType(): { mimeType: string; extension: 'webm' | 'm4a' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm', extension: 'webm' };
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  }
  return null;
}

/** Seconds → `m:ss`, Western digits like every other number on the platform. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * «سجّل فويس» — the instructor's, and only his.
 *
 * There is no counterpart in the student's panel and there is not going to be:
 * «هم لأ، أنا أقدر أسجل فويس بس». That asymmetry is also what makes the
 * server's narrow audio pipeline proportionate — see `VoiceService`.
 *
 * ## Three states, and cancelling is one of them
 *
 * Idle → recording → recorded. The middle state has TWO exits, and the
 * destructive one is the point: «أقدر إني ألغيها». A recorder that can only be
 * sent is one nobody uses twice, because the first time a sentence comes out
 * wrong there is no way back.
 *
 * ## The stream is stopped on every path
 *
 * `getUserMedia` lights the browser's recording indicator and holds the
 * microphone until every track is stopped — including on unmount, which is
 * where a component like this usually leaks it. Leaving that light on after an
 * admin navigates away is not a resource bug, it is a trust one.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  /** The finished clip and the length the recorder COUNTED — the header of a
   *  live-written WebM carries no duration, so this number is the only honest
   *  one. See `ConversationMessage.attachmentDurationSeconds`. */
  onRecorded: (file: File, seconds: number) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Set by «إلغاء» so `onstop` knows to throw the bytes away rather than
   *  hand them up. A ref and not state: `onstop` fires outside React's render,
   *  and a stale closure over a state value would send a cancelled clip. */
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // The microphone is released on unmount too — see the class doc.
  useEffect(() => teardown, [teardown]);

  async function start() {
    const picked = pickMimeType();
    if (!picked) {
      setError(c.voiceUnsupported);
      return;
    }

    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Denied, or no microphone. One sentence for both: the admin's next step
      // is the same either way, and the browser has already said which.
      setError(c.voiceDenied);
      return;
    }

    cancelledRef.current = false;
    chunksRef.current = [];
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: picked.mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const cancelled = cancelledRef.current;
      // Read BEFORE teardown clears them, and the elapsed count is read off the
      // DOM-free ref chain rather than `seconds`, which this closure captured
      // at zero.
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      teardown();
      setRecording(false);
      setSeconds(0);

      if (cancelled || chunks.length === 0) return;
      const blob = new Blob(chunks, { type: picked.mimeType });
      onRecorded(new File([blob], `voice.${picked.extension}`, { type: picked.mimeType }), elapsed);
    };

    const startedAt = Date.now();
    recorder.start();
    setRecording(true);
    setSeconds(0);

    timerRef.current = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      // Stops ITSELF at the ceiling rather than letting the send fail: the
      // database refuses anything past this, and finding that out after
      // eleven minutes of talking is the worst possible moment to be told.
      if (elapsed >= MAX_VOICE_SECONDS) recorderRef.current?.stop();
    }, 250);
  }

  function stop() {
    cancelledRef.current = false;
    recorderRef.current?.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    recorderRef.current?.stop();
  }

  if (!recording) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          aria-label={c.voiceRecord}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full border border-line',
            'text-fg-muted transition-colors hover:border-accent/40 hover:text-fg',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <Mic className="size-4" aria-hidden="true" />
        </button>
        {error ? (
          <p role="alert" className="text-[length:var(--fs-text-xs)] text-[var(--err)]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-accent/50 bg-surface-2 px-3 py-1.5">
      {/* The dot is the only thing on the row that moves, which is what makes
          "this is live" readable without a label. `aria-hidden` because the
          timer beside it already says so in words a reader can hear. */}
      <span
        aria-hidden="true"
        className="size-2 animate-pulse rounded-full bg-[oklch(0.62_0.2_25)]"
      />
      <span className="text-[length:var(--fs-text-sm)] tabular-nums text-fg" aria-live="off">
        {clock(seconds)}
      </span>

      <button
        type="button"
        onClick={cancel}
        aria-label={c.voiceCancel}
        className="flex size-8 items-center justify-center rounded-full text-fg-muted hover:text-[var(--err)]"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={stop}
        aria-label={c.voiceStop}
        className="flex size-8 items-center justify-center rounded-full bg-accent text-[#1A1206]"
      >
        <Send className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
