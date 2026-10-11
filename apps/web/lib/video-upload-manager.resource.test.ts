import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * «رفع فيديو» in a lesson's materials, through the SAME transfer as the
 * lecture — and into the material's row, never the lecture's.
 */
const startResourceVideoUploadAction = vi.fn();
const completeResourceVideoUploadAction = vi.fn();
const completeVideoUploadAction = vi.fn();
vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  startResourceVideoUploadAction: (...args: unknown[]) => startResourceVideoUploadAction(...args),
  completeResourceVideoUploadAction: (...args: unknown[]) => completeResourceVideoUploadAction(...args),
  completeVideoUploadAction: (...args: unknown[]) => completeVideoUploadAction(...args),
}));

/** A bucket that takes every part on the first try. */
class FakeXhr {
  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  status = 200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(): void {}
  abort(): void {}
  getResponseHeader(name: string): string | null {
    return name === 'ETag' ? '"etag-1"' : null;
  }
  send(body: Blob): void {
    queueMicrotask(() => {
      this.upload.onprogress?.({ loaded: body.size });
      this.onload?.();
    });
  }
}
vi.stubGlobal('XMLHttpRequest', FakeXhr);

const { startResourceUpload } = await import('./video-upload-manager');

afterEach(() => {
  vi.clearAllMocks();
});

describe('startResourceUpload', () => {
  it('resolves once the material row exists, then finishes the upload into THAT row', async () => {
    startResourceVideoUploadAction.mockResolvedValue({
      ok: true,
      session: {
        resourceId: 'r-new',
        videoId: 'a'.repeat(32),
        uploadId: 'mp-1',
        partSizeBytes: 5 * 1024 * 1024,
        parts: [{ partNumber: 1, url: 'https://bucket.test/1' }],
        expiresAt: new Date().toISOString(),
      },
    });
    completeResourceVideoUploadAction.mockResolvedValue({ ok: true });

    const file = new File(['video bytes'], 'حل الواجب.mp4', { type: 'video/mp4' });
    const started = await startResourceUpload('c1', 'l1', file, 'video/mp4', { title: 'حل الواجب', description: null });

    expect(started).toEqual({ ok: true, resourceId: 'r-new' });
    expect(startResourceVideoUploadAction).toHaveBeenCalledWith('c1', 'l1', {
      title: 'حل الواجب',
      description: null,
      fileName: 'حل الواجب.mp4',
      sizeBytes: file.size,
      contentType: 'video/mp4',
    });

    await vi.waitFor(() => expect(completeResourceVideoUploadAction).toHaveBeenCalled());
    expect(completeResourceVideoUploadAction).toHaveBeenCalledWith('c1', 'r-new', {
      videoId: 'a'.repeat(32),
      uploadId: 'mp-1',
      parts: [{ partNumber: 1, etag: '"etag-1"' }],
    });
    // The lecture's own completion is never the one called.
    expect(completeVideoUploadAction).not.toHaveBeenCalled();
  });

  it('answers with the refusal and leaves nothing behind when the row could not be made', async () => {
    startResourceVideoUploadAction.mockResolvedValue({ ok: false, message: 'الدرس مش موجود' });
    const file = new File(['x'], 'x.mp4', { type: 'video/mp4' });
    const started = await startResourceUpload('c1', 'l1', file, 'video/mp4', { title: 'x', description: null });
    expect(started).toEqual({ ok: false, message: 'الدرس مش موجود' });
    expect(completeResourceVideoUploadAction).not.toHaveBeenCalled();
  });
});
