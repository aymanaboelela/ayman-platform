'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { HTML_PREVIEW_PATH, HTML_PREVIEW_SANDBOX } from '@/lib/html-preview';
import { composePreviewDocument } from '@/lib/playground/preview-document';

export type PreviewLevel = 'log' | 'info' | 'warn' | 'error' | 'alert' | 'link' | 'blocked';

export interface PreviewLine {
  level: PreviewLevel;
  text: string;
}

/** One press of «تشغيل» (or one pause in live typing). A new object = a new run. */
export interface PreviewRequest {
  html: string;
  css: string;
}

const LEVELS: ReadonlySet<string> = new Set(['log', 'info', 'warn', 'error', 'alert', 'link', 'blocked']);

/**
 * How long a frame gets to finish parsing the student's page before it is
 * thrown away. A page that has not finished in four seconds is almost always
 * `while (true)` in a `<script>`; on a browser that runs sandboxed frames in
 * their own process (desktop Chrome does) the tab stays alive and this is what
 * clears the stuck frame. On one that does not, the tab is frozen either way —
 * which is why the playground never auto-refreshes a page that has a script.
 */
const RENDER_TIMEOUT_MS = 4000;

/**
 * The HTML playground's preview: the student's page in a sandboxed frame.
 *
 * ## Isolation, in one paragraph
 *
 * The frame loads `HTML_PREVIEW_PATH` with `sandbox="allow-scripts
 * allow-forms"` and NO `allow-same-origin`, and that response carries its own
 * enforced policy (`lib/html-preview.ts`): an opaque origin, `default-src
 * 'none'`, `frame-ancestors 'self'`. So the student's `<script>` runs, but
 * `document.cookie`, `localStorage` and `parent.document` all throw, and any
 * request — to our API or to anywhere — is refused before it leaves.
 *
 * ## A fresh frame per run, swapped in when ready
 *
 * Every run gets a NEW `<iframe>`. Reusing one would leave the previous run's
 * `setInterval`s and listeners alive inside it (`document.open()` clears
 * listeners, not timers), so a student fixing a clock would end up with two
 * clocks fighting. The new frame renders hidden behind the current one and
 * replaces it only once its document is written, so a live refresh does not
 * blink white on every pause in typing.
 *
 * ## Messages are data, never instructions
 *
 * Everything posted back comes from code the student (or a snippet they
 * pasted) wrote. It is accepted only from a frame this component created,
 * only from an opaque origin, only for the run currently on screen, and it is
 * only ever rendered as TEXT by the caller.
 */
export function HtmlPreview({
  request,
  title,
  empty,
  onLine,
  onRendered,
  onHung,
}: {
  request: PreviewRequest | null;
  title: string;
  empty: React.ReactNode;
  onLine: (line: PreviewLine) => void;
  onRendered: (ms: number) => void;
  onHung: () => void;
}) {
  const [frames, setFrames] = useState<readonly number[]>([]);
  const [shown, setShown] = useState<number | null>(null);

  const seq = useRef(0);
  const latest = useRef(0);
  const shownRef = useRef<number | null>(null);
  const docs = useRef(new Map<number, string>());
  const startedAt = useRef(new Map<number, number>());
  const elements = useRef(new Map<number, HTMLIFrameElement>());

  const emitLine = useEffectEvent(onLine);
  const emitRendered = useEffectEvent(onRendered);
  const emitHung = useEffectEvent(onHung);

  /*
   * A new request spawns a frame. This effect also re-runs when the route is
   * shown again after a soft navigation — the router keeps this DOM and only
   * re-runs effects (see the teardown below) — and that re-spawn is exactly
   * what brings the page back after the teardown blanked it.
   */
  useEffect(() => {
    if (!request) return;
    const id = ++seq.current;
    latest.current = id;
    // Anything still pending is superseded by this run and will never render.
    for (const key of docs.current.keys()) docs.current.delete(key);
    for (const key of startedAt.current.keys()) startedAt.current.delete(key);
    docs.current.set(id, composePreviewDocument({ html: request.html, css: request.css, token: String(id) }));
    startedAt.current.set(id, performance.now());
    // Keep what is on screen until the new one is ready; drop any other run
    // still pending — it has been superseded before it ever showed.
    setFrames((prev) => [...prev.filter((f) => f === shownRef.current), id]);

    const watchdog = setTimeout(() => {
      if (shownRef.current !== null && shownRef.current >= id) return;
      docs.current.delete(id);
      setFrames((prev) => prev.filter((f) => f !== id));
      if (latest.current === id) emitHung();
    }, RENDER_TIMEOUT_MS);
    return () => clearTimeout(watchdog);
  }, [request]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // A sandboxed document without `allow-same-origin` always reports its
      // origin as the string "null". Anything else did not come from a frame
      // of ours.
      if (event.origin !== 'null') return;
      let id: number | null = null;
      for (const [key, element] of elements.current) {
        if (element.contentWindow === event.source) id = key;
      }
      if (id === null) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const message = data as { type?: unknown; token?: unknown; level?: unknown; text?: unknown };

      if (message.type === 'pg:ready') {
        const doc = docs.current.get(id);
        // `*` because an opaque origin cannot be named. What is sent is the
        // student's own code, to a frame this component just created.
        if (doc !== undefined) elements.current.get(id)?.contentWindow?.postMessage({ type: 'pg:render', token: String(id), doc }, '*');
        return;
      }
      if (message.token !== String(id) || id !== latest.current) return;

      if (message.type === 'pg:rendered') {
        shownRef.current = id;
        setShown(id);
        setFrames((prev) => prev.filter((f) => f >= id));
        docs.current.delete(id);
        const started = startedAt.current.get(id);
        emitRendered(started === undefined ? 0 : Math.round(performance.now() - started));
        return;
      }
      if (message.type === 'pg:console' && typeof message.level === 'string' && LEVELS.has(message.level)) {
        emitLine({ level: message.level as PreviewLevel, text: String(message.text ?? '').slice(0, 2000) });
      }
    }

    window.addEventListener('message', onMessage);
    const live = elements.current;
    return () => {
      window.removeEventListener('message', onMessage);
      // Leaving the route does not unmount it — the router hides this tree and
      // keeps the DOM. Without this a student's clock (`setInterval`) or CSS
      // animation keeps running inside a page nobody can see. Blanking the
      // frames stops it; the request effect above re-spawns on return.
      for (const element of live.values()) element.src = 'about:blank';
    };
  }, []);

  return (
    <div className="pg-stage">
      {shown === null ? <div className="pg-stage__empty">{empty}</div> : null}
      {frames.map((id) => (
        <iframe
          key={id}
          ref={(element) => {
            if (element) elements.current.set(id, element);
            else elements.current.delete(id);
          }}
          src={HTML_PREVIEW_PATH}
          sandbox={HTML_PREVIEW_SANDBOX}
          title={title}
          referrerPolicy="no-referrer"
          className="pg-stage__frame"
          data-state={id === shown ? 'live' : 'pending'}
        />
      ))}
    </div>
  );
}
