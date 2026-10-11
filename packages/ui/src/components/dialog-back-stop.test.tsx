import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Sheet, SheetContent, SheetTitle } from './sheet';

/**
 * «لما بعمل باك من فوق مش بيعمل باك … لازم أضغط أكتر من مرة» (2026-10-06).
 *
 * `/admin/exams` renders a delete and a copy dialog for every exam, all
 * closed. The back stop was armed in `DialogContent`'s own body, which renders
 * whether the dialog is open or not — so the page loaded with ten phantom
 * history entries, and the browser's back button took eleven presses to
 * leave. These pin the rule for both overlays: a CLOSED overlay touches
 * history not at all; an open one adds exactly one entry.
 */
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('back stop only while open', () => {
  it('ten closed dialogs add nothing to history', () => {
    const before = window.history.length;
    render(
      <>
        {Array.from({ length: 10 }, (_, index) => (
          <Dialog key={index} open={false}>
            <DialogContent closeLabel="اقفل">
              <DialogTitle>عنوان</DialogTitle>
            </DialogContent>
          </Dialog>
        ))}
      </>,
    );
    expect(window.history.length).toBe(before);
  });

  it('an open dialog adds exactly one', async () => {
    const before = window.history.length;
    await act(async () => {
      render(
        <Dialog open>
          <DialogContent closeLabel="اقفل">
            <DialogTitle>عنوان</DialogTitle>
          </DialogContent>
        </Dialog>,
      );
    });
    expect(window.history.length).toBe(before + 1);
  });

  it('a closed drawer adds nothing either', () => {
    const before = window.history.length;
    render(
      <Sheet open={false}>
        <SheetContent closeLabel="اقفل">
          <SheetTitle>القائمة</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(window.history.length).toBe(before);
  });
});
