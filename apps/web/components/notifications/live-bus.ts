/**
 * The seam between the ONE live stream a tab holds and the screens that care
 * what it says about an admin queue.
 *
 * `NotificationStreamProvider` owns the `EventSource`; the payments badge, the
 * review screen and the ledger each want to hear «the desk moved». They cannot
 * read it through React context: the badge's provider is mounted ABOVE the
 * stream's in the admin layout, and a context only flows down. A module is the
 * one thing every one of them can reach regardless of where it sits in the
 * tree — and it is per tab, which is exactly the scope an `EventSource` has.
 *
 * Deliberately free of Zod and of every contract VALUE: the stream provider is
 * mounted by both shells, and `lib/client-barrel.test.ts` holds anything a
 * layout reaches to that. The frame has already been validated by the time it
 * gets here.
 *
 * Nothing is buffered. A screen that was not listening when a frame went by
 * did not miss anything it cannot re-read — which is why every consumer also
 * resyncs on `onStreamOpen`: a dropped connection is the one gap a frame
 * cannot fill.
 */
import type { LiveQueue } from '@ayman/contracts/notifications';

type QueueListener = (waiting: number) => void;
/** `null` when the frame did not name a thread (a notification about one the
 *  screen should re-read anyway — see `emitChatFrame`). */
type ChatListener = (conversationId: string | null) => void;

const queueListeners = new Map<LiveQueue, Set<QueueListener>>();
const chatListeners = new Set<ChatListener>();
const openListeners = new Set<() => void>();
const connectionListeners = new Set<() => void>();
let connected = false;

function setConnected(next: boolean): void {
  if (connected === next) return;
  connected = next;
  for (const listener of [...connectionListeners]) listener();
}

/** Stream side: a validated queue frame arrived. */
export function emitQueueFrame(queue: LiveQueue, waiting: number): void {
  for (const listener of [...(queueListeners.get(queue) ?? [])]) listener(waiting);
}

/**
 * Stream side: a conversation moved — a `chat` frame, or a notification row
 * that is itself about a thread (a reply, «رسالة من مهندس», a homework
 * verdict written into the chat). Both mean the same thing to a screen
 * showing that thread: re-read it.
 */
export function emitChatFrame(conversationId: string | null): void {
  for (const listener of [...chatListeners]) listener(conversationId);
}

/** Stream side: the connection is (re)established. Every frame published
 *  while it was down is gone, so listeners re-read. */
export function emitStreamOpen(): void {
  setConnected(true);
  for (const listener of [...openListeners]) listener();
}

/** Stream side: the connection dropped, errored, or its provider unmounted. */
export function emitStreamDown(): void {
  setConnected(false);
}

/** Screen side. Returns the unsubscribe — call it from the effect's cleanup,
 *  or a page the router keeps mounted in the background goes on listening. */
export function subscribeQueue(queue: LiveQueue, listener: QueueListener): () => void {
  const set = queueListeners.get(queue) ?? new Set<QueueListener>();
  set.add(listener);
  queueListeners.set(queue, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) queueListeners.delete(queue);
  };
}

/** Screen side, for «الشات ريل تايم». Same contract as `subscribeQueue`:
 *  return the unsubscribe from the effect's cleanup. */
export function subscribeChat(listener: ChatListener): () => void {
  chatListeners.add(listener);
  return () => {
    chatListeners.delete(listener);
  };
}

export function onStreamOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

/**
 * The conversation the student's open panel is showing, or `null`. Set by the
 * widget, read by the stream: a «رد عليك» toast over the very chat that is
 * already showing the reply is noise.
 */
let chatOnScreen: string | null = null;

export function setChatOnScreen(conversationId: string | null): void {
  chatOnScreen = conversationId;
}

export function isChatOnScreen(conversationId: string): boolean {
  return chatOnScreen === conversationId && document.visibilityState === 'visible';
}

/** `useSyncExternalStore`'s subscribe/snapshot pair for «is the stream up». */
export function subscribeStreamConnection(listener: () => void): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

export function isStreamConnected(): boolean {
  return connected;
}
