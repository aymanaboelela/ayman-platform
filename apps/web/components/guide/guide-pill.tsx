'use client';

import { createPortal } from 'react-dom';
import { guideCopy } from '@ayman/contracts/copy/guide';
import { formatCopy } from '@ayman/contracts/format';
import type { GuideFace } from './guide-launcher';
import { GUIDE_SCOPE, GuideFaceImage, TEACHER_NAME } from './guide-parts';

/**
 * The guide, minimised: one pill in the bottom-left corner that brings the
 * dialog back where it was left. It stays for the session and no longer —
 * the state it reopens lives in `sessionStorage`.
 *
 * Portalled to `<body>` for the reason `guide-root.tsx` gives.
 */
export function GuidePill({ face, onOpen }: { face: GuideFace | null; onOpen: () => void }) {
  return createPortal(
    <div className="guide-dock guide-scope" {...GUIDE_SCOPE}>
      <button type="button" className="guide-pill" onClick={onOpen}>
        <GuideFaceImage face={face} size={34} className="guide-pill__face" />
        <span>{formatCopy(guideCopy.pill, { name: TEACHER_NAME })}</span>
        <i className="guide-pill__dot" aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
