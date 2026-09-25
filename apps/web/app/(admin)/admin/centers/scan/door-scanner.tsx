'use client';

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  Camera,
  CameraOff,
  CircleCheck,
  CircleX,
  Flashlight,
  FlashlightOff,
  History,
  Keyboard,
  ScanLine,
  TriangleAlert,
  Undo2,
  UserCheck,
} from 'lucide-react';
import type QrScanner from 'qr-scanner';
import {
  AttendanceScanResultSchema,
  type AttendanceScanResult,
} from '@ayman/contracts/admin/centers';
import { studentNumberFromCode } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Select } from '@ayman/ui/components/select';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiDelete, apiPost } from '@/lib/api';
import { UserAvatar } from '@/components/app/user-avatar';
import { Chip, Ltr, ROW_BUTTON, ROW_BUTTON_TONE, TINT_CARD, TINT_WELL, TONE_TEXT, tone, yearLabel } from '../centers-ui';

const c = copy.admin.centers;
const s = c.scan;

export interface ScanSlotOption {
  id: string;
  centerName: string;
  label: string | null;
  /** «السبت · 2:00 م – 4:00 م», formatted on the server. */
  time: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
}

/** The same card held in front of the lens is read on every frame. One read
 *  per card: a code is ignored until it has been OUT of view this long. */
const SAME_CODE_MS = 3000;
/** The most rows the «آخر التسجيلات» list keeps — a class, with room. */
const HISTORY_LIMIT = 80;

type CameraError = 'denied' | 'missing' | 'busy' | 'insecure' | 'failed';
type Feedback = 'ok' | 'warn' | 'error';

interface HistoryEntry {
  key: number;
  recordId: string;
  slotId: string;
  outcome: AttendanceScanResult['outcome'];
  notBookedHere: boolean;
  student: AttendanceScanResult['student'];
  scannedAt: string;
  undone: boolean;
}

type LastRead =
  | { kind: 'result'; result: AttendanceScanResult; slotId: string }
  | { kind: 'error'; message: string; code: string };

/** The native detector, for the Code 128 barcode on the student's card. Not
 *  in TypeScript's DOM lib yet, and absent on iPhone — where the QR on the
 *  same card is what the camera reads. */
interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
interface NativeBarcodeDetectorClass {
  new (options: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const clock = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

const noSubscribe = () => () => {};
const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
const cameraSupported = () =>
  window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function';

/**
 * Why a camera would not start. `qr-scanner` swallows the real error and
 * throws «Camera not found.» for all of them, so this asks the browser once
 * more — only on the failure path — to tell «refused» from «no camera» from
 * «another app has it», which are three different things to say at the door.
 */
async function diagnose(): Promise<CameraError> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) track.stop();
    return 'failed';
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
    if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
    return 'failed';
  }
}

/**
 * Code 128 alongside the QR, where the browser can: `qr-scanner` asks the
 * native detector for `qr_code` only. Four reads a second, skipped while the
 * previous one is still running. Resolves to the interval id, or `null` when
 * there is no detector for the format.
 */
async function startBarcodeLoop(
  video: HTMLVideoElement,
  onValue: (value: string) => void,
): Promise<number | null> {
  const Detector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorClass })
    .BarcodeDetector;
  if (!Detector) return null;
  const formats = await Detector.getSupportedFormats().catch(() => [] as string[]);
  if (!formats.includes('code_128')) return null;
  const detector = new Detector({ formats: ['code_128'] });
  let busy = false;
  return window.setInterval(() => {
    if (busy || video.paused || video.readyState < 2) return;
    busy = true;
    detector
      .detect(video)
      .then((codes) => {
        const value = codes[0]?.rawValue;
        if (value) onValue(value);
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, 250);
}

function describe(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code =
      typeof error.payload === 'object' && error.payload !== null
        ? (error.payload as { code?: unknown }).code
        : undefined;
    if (code === 'attendance_unknown_student') return s.unknownStudent;
    if (code === 'attendance_bad_code') return s.badCode;
    if (error.status === 429) return copy.admin.common.rateLimited;
    if (error.status === 403) return s.forbidden;
    if (error.status === 404) return s.slotGone;
    return s.failed;
  }
  // A `TypeError` from `fetch` itself — the request never left the phone.
  return typeof navigator !== 'undefined' && !navigator.onLine ? s.offline : s.failed;
}

/**
 * The door. One slot at a time, a camera that keeps reading, and the result of
 * every read said three ways — a sound, a buzz, and a card big enough to read
 * from arm's length — because the person holding the phone is looking at the
 * student in front of them, not at the screen.
 *
 * The typed field below the camera is not a fallback bolted on: a USB barcode
 * scanner is a keyboard that types the code and presses Enter, so on a laptop
 * at the door it IS the scanner, and it is focused on arrival for that reason.
 */
export function DoorScanner({
  slots,
  defaultSlotId,
  nowSlotId,
}: {
  slots: readonly ScanSlotOption[];
  defaultSlotId: string | null;
  nowSlotId: string | null;
}) {
  const pickerId = useId();
  const inputId = useId();
  const [slotId, setSlotId] = useState(defaultSlotId ?? slots[0]?.id ?? '');
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<LastRead | null>(null);
  const [flash, setFlash] = useState<{ kind: Feedback; id: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [presentBySlot, setPresentBySlot] = useState<Record<string, number>>({});
  const [undoing, setUndoing] = useState<string | null>(null);

  // The camera. On a phone it starts by itself — that is the device the door
  // uses it on — and on a laptop it waits to be asked, where the USB scanner
  // into the field below is the likelier setup. `choice` is the person's own
  // on/off, which overrides either default.
  const coarse = useSyncExternalStore(noSubscribe, coarsePointer, () => false);
  const supported = useSyncExternalStore(noSubscribe, cameraSupported, () => true);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const wantCamera = (choice ?? coarse) && supported;

  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const nextKeyRef = useRef(0);
  const flashTimerRef = useRef<number | undefined>(undefined);

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const current = slotById.get(slotId) ?? null;
  const present = presentBySlot[slotId];
  const recordedHere = history.filter((entry) => !entry.undone).length;

  /* ── sound and touch ──────────────────────────────────────────────────── */

  /** An `AudioContext` may only start inside a user gesture on iOS — so it is
   *  made on the first tap anywhere, and every beep after that just plays. */
  function unlockAudio() {
    if (audioRef.current) {
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
      return;
    }
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context) audioRef.current = new Context();
  }

  /** A short beep from an oscillator — no audio file to fetch, cache or
   *  fail. One high note for «حاضر», two for a warning, one low buzz for
   *  a refusal: distinguishable without looking. */
  function beep(kind: Feedback) {
    const context = audioRef.current;
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const notes: Array<[frequency: number, delay: number, length: number]> =
      kind === 'ok'
        ? [[1046, 0, 0.13]]
        : kind === 'warn'
          ? [
              [740, 0, 0.09],
              [740, 0.15, 0.09],
            ]
          : [[196, 0, 0.32]];
    for (const [frequency, delay, length] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'error' ? 'square' : 'sine';
      oscillator.frequency.value = frequency;
      const start = context.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
    }
  }

  function signal(kind: Feedback) {
    navigator.vibrate?.(kind === 'ok' ? 80 : kind === 'warn' ? [60, 40, 60] : [150, 60, 150]);
    beep(kind);
    window.clearTimeout(flashTimerRef.current);
    setFlash({ kind, id: Date.now() });
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 900);
  }

  /* ── one read ─────────────────────────────────────────────────────────── */

  function refuse(message: string, code: string) {
    signal('error');
    setLast({ kind: 'error', message, code });
    toast.error(message);
  }

  async function scan(raw: string) {
    const code = raw.trim();
    const forSlot = slotId;
    if (code === '' || forSlot === '') return;
    // Checked here before any request: a camera pointed at some OTHER QR —
    // a WhatsApp group, a menu — would otherwise cost a round trip per frame.
    if (studentNumberFromCode(code) === null) {
      refuse(s.badCode, code);
      return;
    }
    if (inFlightRef.current.has(code)) return;
    inFlightRef.current.add(code);
    try {
      const result = await apiPost(
        '/api/admin/centers/attendance/scan',
        AttendanceScanResultSchema,
        { slotId: forSlot, code },
      );
      const warn = result.outcome === 'already' || result.notBookedHere;
      signal(warn ? 'warn' : 'ok');
      setLast({ kind: 'result', result, slotId: forSlot });
      setPresentBySlot((counts) => ({ ...counts, [forSlot]: result.presentCount }));
      const key = nextKeyRef.current;
      nextKeyRef.current += 1;
      setHistory((rows) =>
        [
          {
            key,
            recordId: result.recordId,
            slotId: forSlot,
            outcome: result.outcome,
            notBookedHere: result.notBookedHere,
            student: result.student,
            scannedAt: result.scannedAt,
            undone: false,
          },
          ...rows,
        ].slice(0, HISTORY_LIMIT),
      );
      const name = result.student.fullName;
      if (result.outcome === 'already') toast.warning(formatCopy(s.toastAlready, { name }));
      else if (result.notBookedHere) toast.warning(formatCopy(s.toastNotBooked, { name }));
      else toast.success(formatCopy(s.toastRecorded, { name }));
    } catch (error) {
      refuse(describe(error), code);
    } finally {
      inFlightRef.current.delete(code);
    }
  }

  /** A read from the lens. Sliding window: every sighting of the same code
   *  pushes its window on, so a card held up for ten seconds is one read,
   *  and the same card shown again after a pause is a second one. */
  const onCameraRead = useEffectEvent((raw: string) => {
    const code = raw.trim();
    const now = Date.now();
    const previous = lastCodeRef.current;
    lastCodeRef.current = { code, at: now };
    if (previous && previous.code === code && now - previous.at < SAME_CODE_MS) return;
    void scan(code);
  });

  const onCameraFailed = useEffectEvent((reason: CameraError) => {
    setCameraError(reason);
    setRunning(false);
  });

  const onCameraStarted = useEffectEvent((flashAvailable: boolean) => {
    setCameraError(null);
    setRunning(true);
    setHasFlash(flashAvailable);
    setFlashOn(false);
  });

  /* ── the camera's lifetime ────────────────────────────────────────────── */

  useEffect(() => {
    if (!wantCamera) return;
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    let scanner: QrScanner | null = null;
    let barcodeTimer: number | null = null;

    async function start(target: HTMLVideoElement) {
      // Loaded here, not at the top: the decoder and its worker are the
      // heaviest thing on the page, and a laptop with a USB scanner never
      // needs them.
      const { default: Scanner } = await import('qr-scanner');
      if (disposed) return;
      scanner = new Scanner(target, (result) => onCameraRead(result.data), {
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
        // «No QR code found» fires on every empty frame; it is not an error.
        onDecodeError: () => undefined,
      });
      scannerRef.current = scanner;
      try {
        await scanner.start();
      } catch {
        if (disposed) return;
        scanner.destroy();
        scanner = null;
        scannerRef.current = null;
        onCameraFailed(await diagnose());
        return;
      }
      if (disposed) return;
      onCameraStarted(await scanner.hasFlash().catch(() => false));
      barcodeTimer = await startBarcodeLoop(target, (value) => onCameraRead(value));
      if (disposed && barcodeTimer !== null) window.clearInterval(barcodeTimer);
    }

    void start(video);
    // Leaving the page does not unmount it — the router hides the tree and
    // tears the effects down — so THIS is what turns the camera light off.
    return () => {
      disposed = true;
      if (barcodeTimer !== null) window.clearInterval(barcodeTimer);
      scanner?.destroy();
      scannerRef.current = null;
      setRunning(false);
    };
  }, [wantCamera, attempt]);

  // The typed field takes the focus on a desktop, where a USB scanner types
  // into whatever is focused and a click elsewhere would swallow a read.
  useEffect(() => {
    if (!coarse) inputRef.current?.focus();
  }, [coarse]);

  // The first tap anywhere unlocks the beeps for the rest of the visit.
  const onFirstGesture = useEffectEvent(() => unlockAudio());
  useEffect(() => {
    const unlock = () => onFirstGesture();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  function startCamera() {
    unlockAudio();
    setCameraError(null);
    setChoice(true);
    setAttempt((value) => value + 1);
  }

  function stopCamera() {
    setChoice(false);
    setRunning(false);
    setHasFlash(false);
    setFlashOn(false);
  }

  async function toggleFlash() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    await scanner.toggleFlash().catch(() => undefined);
    setFlashOn(scanner.isFlashOn());
  }

  function changeSlot(next: string) {
    setSlotId(next);
    // A card read a second ago for the OLD slot must still count for the new
    // one — the window belongs to a slot, not to the card.
    lastCodeRef.current = null;
  }

  async function undo(entry: HistoryEntry) {
    setUndoing(entry.recordId);
    try {
      await apiDelete(`/api/admin/centers/attendance/${encodeURIComponent(entry.recordId)}`);
      setHistory((rows) =>
        rows.map((row) => (row.recordId === entry.recordId ? { ...row, undone: true } : row)),
      );
      setPresentBySlot((counts) =>
        entry.slotId in counts
          ? { ...counts, [entry.slotId]: Math.max(0, (counts[entry.slotId] ?? 1) - 1) }
          : counts,
      );
      setLast((shown) =>
        shown?.kind === 'result' && shown.result.recordId === entry.recordId ? null : shown,
      );
      toast.success(s.undoDone);
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError && error.status === 429
          ? copy.admin.common.rateLimited
          : s.undoFailed,
      );
    } finally {
      setUndoing(null);
    }
  }

  const status: CameraError | 'running' | 'starting' | 'idle' = !supported
    ? 'insecure'
    : cameraError
      ? cameraError
      : running
        ? 'running'
        : wantCamera
          ? 'starting'
          : 'idle';

  const statusText: Record<Exclude<typeof status, 'running'>, string> = {
    idle: s.cameraIdle,
    starting: s.cameraStarting,
    denied: s.cameraDenied,
    missing: s.cameraMissing,
    busy: s.cameraBusy,
    insecure: s.cameraInsecure,
    failed: s.cameraFailed,
  };

  const frameColor =
    flash?.kind === 'ok' ? 'var(--ok)' : flash?.kind === 'warn' ? 'var(--warn)' : flash?.kind === 'error' ? 'var(--err)' : 'var(--n-1)';

  return (
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        {/* ── The slot, and the count for it ─────────────────────────────── */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <div className="min-w-0">
            <label
              htmlFor={pickerId}
              className="mb-1 block text-[length:var(--fs-text-xs)] font-medium text-fg-muted"
            >
              {s.slot}
            </label>
            <Select
              id={pickerId}
              value={slotId}
              onChange={(event) => changeSlot(event.target.value)}
              className="h-12 font-semibold"
            >
              {groupByCenter(slots).map(([centerName, options]) => (
                <optgroup key={centerName} label={centerName}>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {optionText(option, option.id === nowSlotId)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div
            style={tone('var(--ok)')}
            aria-live="polite"
            className={cn('flex h-12 min-w-[6.5rem] items-center gap-2 rounded-lg px-3', TINT_CARD)}
          >
            <UserCheck className="size-5 shrink-0 text-[color:var(--ct-tone)]" aria-hidden="true" />
            <span className="leading-none">
              <span className="block text-[length:var(--fs-mono-label)] font-medium text-fg-muted">
                {s.present}
              </span>
              <span
                className={cn(
                  'block text-[length:var(--fs-title-3)] font-bold tabular-nums',
                  TONE_TEXT,
                )}
              >
                {present ?? s.presentUnknown}
              </span>
            </span>
          </div>
          {current ? (
            <p className="col-span-2 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              <Chip color="var(--viz-2)">{current.centerName}</Chip>
              {current.id === nowSlotId ? <Chip color="var(--ok)">{s.slotNow}</Chip> : null}
              {!current.active ? <Chip color="var(--err)">{s.slotInactive}</Chip> : null}
              {recordedHere > 0 ? (
                <span className="ms-auto">{formatCopy(s.sessionCount, { count: recordedHere })}</span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* ── The lens ───────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
          {/* Square on a phone, 16:9 from `sm`: `qr-scanner` reads a centred
              square two thirds of the video's SHORT side, and in these two
              shapes that square is two thirds of the box's height whichever
              way the camera streams — so the frame drawn below is the region
              actually read, not a decoration near it. */}
          <div className="relative aspect-square w-full bg-surface-3 sm:aspect-video">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-hidden="true"
              className={cn('size-full object-cover', status === 'running' ? 'opacity-100' : 'opacity-0')}
            />
            {status === 'running' ? (
              <>
                {/* The aiming square, flashing the read's colour for a beat. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    style={tone(frameColor)}
                    className={cn(
                      'aspect-square h-2/3 rounded-2xl border-4 border-[color:var(--ct-tone)]',
                      'transition-[border-color,background-color] duration-150',
                      flash ? 'bg-[color-mix(in_oklab,var(--ct-tone)_22%,transparent)]' : 'bg-transparent',
                    )}
                  />
                </div>
                {/* The last read, ON the picture: on a phone the big card
                    below is under the fold while the lens is being aimed. */}
                {last ? <LensBand last={last} /> : null}
                <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-[color-mix(in_oklab,var(--n-12)_55%,transparent)] px-3 py-2 text-[length:var(--fs-text-sm)] font-medium text-[color:var(--n-1)]">
                  <ScanLine className="size-4" aria-hidden="true" />
                  {s.aim}
                </p>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
                <span
                  style={tone(status === 'idle' || status === 'starting' ? 'var(--info)' : 'var(--err)')}
                  className={cn('grid size-14 place-items-center rounded-full', TINT_WELL)}
                >
                  {status === 'idle' || status === 'starting' ? (
                    <Camera className={cn('size-7', status === 'starting' && 'animate-pulse')} aria-hidden="true" />
                  ) : (
                    <CameraOff className="size-7" aria-hidden="true" />
                  )}
                </span>
                <p role={status === 'idle' || status === 'starting' ? undefined : 'alert'} className="max-w-[28rem] text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {statusText[status]}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 p-3">
            {status === 'running' || status === 'starting' ? (
              <button
                type="button"
                onClick={stopCamera}
                style={tone('var(--err)')}
                className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
              >
                <CameraOff className="size-4" aria-hidden="true" />
                {s.stopCamera}
              </button>
            ) : supported ? (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-[length:var(--fs-text-base)] font-semibold text-[#1A1206] transition-colors hover:bg-accent-hover"
              >
                <Camera className="size-5" aria-hidden="true" />
                {s.startCamera}
              </button>
            ) : null}
            {status === 'running' && hasFlash ? (
              <button
                type="button"
                onClick={() => void toggleFlash()}
                aria-pressed={flashOn}
                style={tone('var(--warn)')}
                className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
              >
                {flashOn ? (
                  <FlashlightOff className="size-4" aria-hidden="true" />
                ) : (
                  <Flashlight className="size-4" aria-hidden="true" />
                )}
                {flashOn ? s.flashOff : s.flashOn}
              </button>
            ) : null}
          </div>
        </div>

        <ResultCard last={last} slotById={slotById} />
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {/* ── The keyboard way in ────────────────────────────────────────── */}
        {/* `method="post"`: before hydration a bare form submits as GET and
            puts the typed code in the URL. */}
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            const value = typed.trim();
            if (value === '') return;
            setTyped('');
            unlockAudio();
            void scan(value);
            inputRef.current?.focus();
          }}
          className="rounded-xl border border-line bg-surface-2 p-3"
        >
          <label
            htmlFor={inputId}
            className="mb-1 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg"
          >
            <Keyboard className="size-4 text-info" aria-hidden="true" />
            {s.manualLabel}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              ref={inputRef}
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              dir="ltr"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="done"
              maxLength={64}
              placeholder={s.manualPlaceholder}
              className="h-12 min-w-0 flex-1 rounded-md border border-line bg-surface-1 px-3 font-mono text-[1.125rem] tracking-wider text-fg [unicode-bidi:isolate] placeholder:text-fg-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={typed.trim() === '' || slotId === ''}
              className="inline-flex h-12 items-center gap-1.5 rounded-md bg-accent px-4 text-[length:var(--fs-text-base)] font-semibold text-[#1A1206] transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              <UserCheck className="size-5" aria-hidden="true" />
              {s.manualSubmit}
            </button>
          </div>
          <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{s.manualHint}</p>
        </form>

        {/* ── This device's reads, newest first ──────────────────────────── */}
        <section className="rounded-xl border border-line bg-surface-2">
          <h2 className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-[length:var(--fs-text-base)] font-semibold text-fg">
            <History className="size-4 text-[color:var(--viz-3)]" aria-hidden="true" />
            {s.history}
            {history.length > 0 ? (
              <span className="ms-auto rounded-full bg-surface-3 px-2 text-[length:var(--fs-text-xs)] tabular-nums text-fg-muted">
                {history.length}
              </span>
            ) : null}
          </h2>
          {history.length === 0 ? (
            <p className="px-3 py-6 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {s.historyEmpty}
            </p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-line-subtle overflow-y-auto">
              {history.map((entry) => (
                <HistoryRow
                  key={entry.key}
                  entry={entry}
                  slot={entry.slotId === slotId ? null : (slotById.get(entry.slotId) ?? null)}
                  busy={undoing === entry.recordId}
                  onUndo={() => void undo(entry)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function groupByCenter(slots: readonly ScanSlotOption[]): Array<[string, ScanSlotOption[]]> {
  const groups = new Map<string, ScanSlotOption[]>();
  for (const slot of slots) {
    const list = groups.get(slot.centerName) ?? [];
    list.push(slot);
    groups.set(slot.centerName, list);
  }
  return [...groups];
}

function optionText(option: ScanSlotOption, now: boolean): string {
  const base = option.label ? `${option.time} — ${option.label}` : option.time;
  if (now) return `${base} (${s.slotNow})`;
  if (!option.active) return `${base} (${s.slotInactive})`;
  return base;
}

function StudentLine({ student, size }: { student: AttendanceScanResult['student']; size: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={student.fullName} image={student.avatarKey} size={size} />
      <div className="min-w-0">
        <p
          className={cn(
            'truncate font-semibold text-fg',
            size >= 56 ? 'text-[length:var(--fs-title-2)]' : 'text-[length:var(--fs-text-base)]',
          )}
        >
          {student.fullName}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <span>{s.number}</span>
          <Ltr className="font-mono font-semibold text-fg">{student.studentNumber}</Ltr>
          {student.year !== null ? <Chip color="var(--viz-3)">{yearLabel(student.year)}</Chip> : null}
        </p>
      </div>
    </div>
  );
}

/** A one-line version of the result card, laid over the top of the video. */
function LensBand({ last }: { last: LastRead }) {
  const kind: Feedback =
    last.kind === 'error'
      ? 'error'
      : last.result.outcome === 'already' || last.result.notBookedHere
        ? 'warn'
        : 'ok';
  const color = kind === 'ok' ? 'var(--ok)' : kind === 'warn' ? 'var(--warn)' : 'var(--err)';
  const Icon = kind === 'ok' ? CircleCheck : kind === 'warn' ? TriangleAlert : CircleX;
  return (
    <div
      style={tone(color)}
      className="absolute inset-x-2 top-2 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklab,var(--ct-tone)_88%,var(--n-12))] px-3 py-2 text-[color:var(--n-1)]"
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[length:var(--fs-text-base)] font-bold">
        {last.kind === 'error' ? last.message : last.result.student.fullName}
      </span>
      {last.kind === 'result' ? (
        <span className="shrink-0 text-[length:var(--fs-text-sm)] font-semibold">
          {last.result.outcome === 'already'
            ? s.already
            : last.result.notBookedHere
              ? s.notBookedHere
              : s.present}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The last read, big. Green «تم تسجيل الحضور ✓», amber «اتسجّل قبل كده», red
 * for a refusal — and the orange «مش محجوز في الميعاد ده» line under either
 * of the first two, because the read counted and the person at the door still
 * needs to say something to the student.
 */
function ResultCard({
  last,
  slotById,
}: {
  last: LastRead | null;
  slotById: ReadonlyMap<string, ScanSlotOption>;
}) {
  if (last === null) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 p-4 text-[length:var(--fs-text-sm)] text-fg-muted">
        <ScanLine className="size-6 shrink-0 text-info" aria-hidden="true" />
        {s.subtitle}
      </div>
    );
  }

  if (last.kind === 'error') {
    return (
      <Banner color="var(--err)" icon={<CircleX className="size-7" aria-hidden="true" />} live>
        <p className="text-[length:var(--fs-title-3)] font-bold text-err">{last.message}</p>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          <Ltr className="font-mono">{last.code}</Ltr>
        </p>
      </Banner>
    );
  }

  const { result } = last;
  const recorded = result.outcome === 'recorded';
  const slot = slotById.get(last.slotId);
  return (
    <Banner
      color={recorded ? 'var(--ok)' : 'var(--warn)'}
      icon={
        recorded ? (
          <CircleCheck className="size-7" aria-hidden="true" />
        ) : (
          <History className="size-7" aria-hidden="true" />
        )
      }
      live
    >
      <StudentLine student={result.student} size={64} />
      <p
        className={cn(
          'mt-3 flex items-center gap-2 text-[length:var(--fs-title-3)] font-bold',
          TONE_TEXT,
        )}
      >
        {recorded ? s.recorded : s.already}
        <span className="text-[length:var(--fs-text-sm)] font-medium text-fg-muted">
          {clock.format(new Date(result.scannedAt))}
        </span>
      </p>
      {result.notBookedHere ? (
        <p
          style={tone('var(--viz-1)')}
          className={cn(
            'mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-[length:var(--fs-text-base)] font-semibold',
            TINT_CARD,
            TONE_TEXT,
          )}
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
          {s.notBookedHere}
          {slot ? <span className="font-normal text-fg-muted">— {slot.time}</span> : null}
        </p>
      ) : null}
    </Banner>
  );
}

function Banner({
  color,
  icon,
  live,
  children,
}: {
  color: string;
  icon: ReactNode;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={tone(color)}
      role={live ? 'status' : undefined}
      className={cn('flex items-start gap-3 rounded-xl border-s-4 p-4 sm:p-5', TINT_CARD, 'border-s-[color:var(--ct-tone)]')}
    >
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', TINT_WELL)}>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function HistoryRow({
  entry,
  slot,
  busy,
  onUndo,
}: {
  entry: HistoryEntry;
  /** Set only when the read was for a different slot than the one picked
   *  now — the one case where the row has to say which class it went to. */
  slot: ScanSlotOption | null;
  busy: boolean;
  onUndo: () => void;
}) {
  return (
    <li className={cn('flex items-center gap-3 px-3 py-2.5', entry.undone && 'opacity-60')}>
      <UserAvatar name={entry.student.fullName} image={entry.student.avatarKey} size={36} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[length:var(--fs-text-sm)] font-semibold text-fg', entry.undone && 'line-through')}>
          {entry.student.fullName}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-mono-label)] text-fg-muted">
          <Ltr className="font-mono">{entry.student.studentNumber}</Ltr>
          <span>·</span>
          <span>{clock.format(new Date(entry.scannedAt))}</span>
          {entry.outcome === 'already' ? <Chip color="var(--warn)">{s.already}</Chip> : null}
          {entry.notBookedHere ? <Chip color="var(--viz-1)">{s.notBookedHere}</Chip> : null}
          {slot ? <span className="truncate">{slot.time}</span> : null}
        </p>
      </div>
      {entry.undone ? (
        <span className="shrink-0 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">{s.undone}</span>
      ) : (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          style={tone('var(--err)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'shrink-0 disabled:opacity-60')}
        >
          <Undo2 className="size-4" aria-hidden="true" />
          {s.undo}
        </button>
      )}
    </li>
  );
}
