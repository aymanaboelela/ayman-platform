'use client';

import { copy } from '@ayman/contracts/copy';

const c = copy.assistant.chat;

/**
 * «جارٍ الكتابة…» — three dots in a bubble on the other side's edge, where
 * their next message is about to appear. Drawn only while `usePeerTyping`
 * says so; the words are for screen readers, the dots for everyone else.
 */
export function TypingBubble({ show }: { show: boolean }) {
  return (
    <ol className="chat-list" aria-live="polite">
      {show ? (
        <li className="chat-row chat-row--other chat-row--start chat-row--end chat-row--typing">
          <div className="chat-row__stack">
            <div className="chat-row__line">
              <div className="chat-bubble chat-typing" title={c.typing}>
                <span className="sr-only">{c.typing}</span>
                <span className="chat-typing__dot" aria-hidden="true" />
                <span className="chat-typing__dot" aria-hidden="true" />
                <span className="chat-typing__dot" aria-hidden="true" />
              </div>
            </div>
          </div>
        </li>
      ) : null}
    </ol>
  );
}
