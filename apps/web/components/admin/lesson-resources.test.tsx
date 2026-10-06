import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const addResourceAction = vi.fn();
const resourceVideoStatusAction = vi.fn();
vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  addResourceAction: (...args: unknown[]) => addResourceAction(...args),
  removeResourceAction: vi.fn(),
  reorderResourcesAction: vi.fn(),
  updateResourceAction: vi.fn(),
  resourceVideoStatusAction: (...args: unknown[]) => resourceVideoStatusAction(...args),
  refreshCourseAction: vi.fn(),
}));

const uploadDocument = vi.fn();
vi.mock('@/lib/upload-client', () => ({
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
}));

const startResourceUpload = vi.fn();
vi.mock('@/lib/video-upload-manager', () => ({
  startResourceUpload: (...args: unknown[]) => startResourceUpload(...args),
  useResourceUploads: () => [],
  cancelResourceUpload: vi.fn(),
  dismissUpload: vi.fn(),
  isSameFile: () => true,
  resumeResourceUpload: vi.fn(),
  savedResourceUpload: () => null,
}));

let uploadFeature = true;
vi.mock('./entitlements-context', () => ({ useFeature: () => uploadFeature }));

const { LessonResources } = await import('./lesson-resources');

const c = copy.admin.resource;

afterEach(() => {
  cleanup();
  addResourceAction.mockReset();
  uploadDocument.mockReset();
  startResourceUpload.mockReset();
  resourceVideoStatusAction.mockReset();
  uploadFeature = true;
});

/**
 * «رفع فيديو» in the materials — it goes through the LECTURE's pipeline now
 * (parts to the bucket, the encoder, encrypted HLS), never through
 * `addResourceAction` as a file. #580 sent it that way and every one of them
 * failed at the database.
 */
describe('LessonResources — video source toggle (youtube vs upload)', () => {
  function openVideoForm() {
    render(<LessonResources courseId="c1" lessonId="l1" resources={[]} />);
    fireEvent.click(screen.getByText(c.addOpen));
    fireEvent.change(screen.getByLabelText(c.kind), { target: { value: 'video' } });
  }

  it('defaults to youtube: shows the URL field, no file input', () => {
    openVideoForm();
    expect(screen.getByLabelText(c.videoUrl)).toBeInTheDocument();
    expect(screen.queryByLabelText(c.file)).not.toBeInTheDocument();
  });

  it('switching to upload swaps the URL field for a file input', () => {
    openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));

    expect(screen.queryByLabelText(c.videoUrl)).not.toBeInTheDocument();
    expect(screen.getByLabelText(c.file)).toBeInTheDocument();
  });

  it('offers no upload on a stack with `video.upload` off — YouTube only, as before', () => {
    uploadFeature = false;
    openVideoForm();
    expect(screen.queryByText(c.videoSourceUpload)).not.toBeInTheDocument();
    expect(screen.getByLabelText(c.videoUrl)).toBeInTheDocument();
  });

  it('picking a video sends nothing; «أضف مادة» opens the upload session with the title', async () => {
    startResourceUpload.mockResolvedValue({ ok: true, resourceId: 'r-new' });
    openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));

    // Hundreds of MB, far past the 95 MB a single request could carry.
    const file = new File(['x'], 'solution.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 600 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(c.file), { target: { files: [file] } });
    expect(startResourceUpload).not.toHaveBeenCalled();
    expect(uploadDocument).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(c.resourceTitle), { target: { value: 'حل الواجب' } });
    await act(async () => {
      fireEvent.click(screen.getByText(c.add));
      await Promise.resolve();
    });

    expect(startResourceUpload).toHaveBeenCalledWith('c1', 'l1', file, 'video/mp4', {
      title: 'حل الواجب',
      description: null,
    });
    expect(addResourceAction).not.toHaveBeenCalled();
  });

  it('refuses a non-video file before anything is sent', () => {
    openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));
    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(c.file), { target: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent(copy.admin.lesson.videoUploadWrongType);
    expect(screen.getByText(c.add).closest('button')).toBeDisabled();
  });

  it('submits a youtube video exactly as before, unaffected by the new toggle', async () => {
    addResourceAction.mockResolvedValue({ ok: true });
    openVideoForm();

    fireEvent.change(screen.getByLabelText(c.resourceTitle), { target: { value: 'شرح الدرس' } });
    fireEvent.change(screen.getByLabelText(c.videoUrl), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(c.add));
      await Promise.resolve();
    });

    expect(addResourceAction).toHaveBeenCalledWith('c1', 'l1', {
      kind: 'video',
      title: 'شرح الدرس',
      description: null,
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(startResourceUpload).not.toHaveBeenCalled();
  });
});

describe('LessonResources — an uploaded material on its row', () => {
  const row = (status: 'pending' | 'ready' | 'failed') => ({
    id: 'r1',
    kind: 'video' as const,
    title: 'حل الواجب',
    description: null,
    filename: null,
    linkUrl: null,
    videoExternalId: 'a'.repeat(32),
    videoProvider: 'upload',
    mirrorStatus: status,
    mirrorProgress: status === 'pending' ? 0 : 100,
    mirrorError: status === 'failed' ? 'ffprobe: not a video' : null,
    sourceName: 'حل الواجب.mp4',
    durationSeconds: status === 'ready' ? 754 : null,
  });

  it('names the file, not the 32-character id, and says «بيتجهّز» while encoding', async () => {
    resourceVideoStatusAction.mockResolvedValue({ status: 'mirroring', progress: 40, durationSeconds: null, maxHeight: null, sizeBytes: null, error: null });
    await act(async () => {
      render(<LessonResources courseId="c1" lessonId="l1" resources={[row('pending')]} />);
      await Promise.resolve();
    });
    expect(screen.getByText('حل الواجب.mp4')).toBeInTheDocument();
    expect(screen.queryByText('a'.repeat(32))).not.toBeInTheDocument();
    expect(screen.getByText(c.videoStatusProcessing, { exact: false })).toHaveAttribute('role', 'status');
    expect(resourceVideoStatusAction).toHaveBeenCalledWith('r1');
  });

  it('says «جاهز للطلبة» once encoded, and why when it failed', () => {
    render(<LessonResources courseId="c1" lessonId="l1" resources={[row('ready')]} />);
    expect(screen.getByText(c.videoStatusReady)).toBeInTheDocument();
    cleanup();
    render(<LessonResources courseId="c1" lessonId="l1" resources={[row('failed')]} />);
    expect(screen.getByRole('alert')).toHaveTextContent(c.videoStatusFailed);
  });
});
