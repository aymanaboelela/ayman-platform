/**
 * The device model the browser reports — «SM-X205» — or `null`.
 *
 * Used for ONE thing: telling whether the student is on the ministry tablet
 * (a Samsung Galaxy Tab), which is when the homework card offers «اكتب الحل».
 *
 * ## Why not just read `navigator.userAgent`
 *
 * Chrome froze the model out of the UA string (UA reduction, Chrome 110+):
 * every Android Chrome now says `Linux; Android 10; K`, whatever the device.
 * The real model is a HIGH-entropy client hint, available only by asking
 * `navigator.userAgentData.getHighEntropyValues(['model'])`. Samsung Internet
 * — the tablet's own browser — still puts it in the UA string, so that is the
 * fallback, and anything else (Safari, Firefox) answers `null`.
 */
export async function detectDeviceModel(): Promise<string | null> {
  if (typeof navigator === 'undefined') return null;

  // Cast through `unknown`: the repo's own `userAgentData` declaration only
  // lists the hints other code asks for (architecture, platformVersion).
  const data = (navigator as unknown as {
    userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> };
  }).userAgentData;
  if (data?.getHighEntropyValues) {
    try {
      const { model } = await data.getHighEntropyValues(['model']);
      if (model && model.trim()) return model.trim();
    } catch {
      // A browser may refuse a high-entropy hint; fall through to the UA.
    }
  }

  // «… Android 13; SM-X205) …» — Samsung Internet, and older Chromes.
  const match = /;\s*(SM-[A-Z0-9]+)[\s;)]/i.exec(navigator.userAgent);
  return match?.[1] ?? null;
}
