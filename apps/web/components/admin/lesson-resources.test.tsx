import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const addResourceAction = vi.fn();
vi.mock('@/app/(admin)/admin/courses/actions', () => ({
  addResourceAction: (...args: unknown[]) => addResourceAction(...args),
  removeResourceAction: vi.fn(),
  reorderResourcesAction: vi.fn(),
  updateResourceAction: vi.fn(),
}));

const uploadDocument = vi.fn();
const uploadResourceVideo = vi.fn();
vi.mock('@/lib/upload-client', () => ({
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  uploadResourceVideo: (...args: unknown[]) => uploadResourceVideo(...args),
}));

const { LessonResources } = await import('./lesson-resources');

const c = copy.admin.resource;

afterEach(() => {
  cleanup();
  addResourceAction.mockReset();
  uploadDocument.mockReset();
  uploadResourceVideo.mockReset();
});

const uploaded = { storageKey: 'resvideo/ab/x.mp4', filename: 'solution.mp4', mime: 'video/mp4', sizeBytes: 1024 };

/**
 * «عاوز أرفع فيديو حل على السيرفر، مش بس يوتيوب» — التبويب الجديد فوق
 * `kind === 'video'`، ولازم يبعت الحمولة الصح لكل حالة.
 */
describe('LessonResources — video source toggle (youtube vs upload)', () => {
  async function openVideoForm() {
    render(<LessonResources courseId="c1" lessonId="l1" resources={[]} />);
    fireEvent.click(screen.getByText(c.addOpen));
    fireEvent.change(screen.getByLabelText(c.kind), { target: { value: 'video' } });
  }

  it('defaults to youtube: shows the URL field, no file input', async () => {
    await openVideoForm();
    expect(screen.getByLabelText(c.videoUrl)).toBeInTheDocument();
    expect(screen.queryByLabelText(c.file)).not.toBeInTheDocument();
  });

  it('switching to upload swaps the URL field for a file input', async () => {
    await openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));

    expect(screen.queryByLabelText(c.videoUrl)).not.toBeInTheDocument();
    expect(screen.getByLabelText(c.file)).toBeInTheDocument();
  });

  it('a file picked under "upload" goes through uploadResourceVideo, not uploadDocument', async () => {
    uploadResourceVideo.mockResolvedValue({ ok: true, value: uploaded });
    await openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));

    const file = new File(['x'], 'solution.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(c.file), { target: { files: [file] } });
      await Promise.resolve();
    });

    expect(uploadResourceVideo).toHaveBeenCalledWith(file, expect.any(Function));
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it('submits the uploaded video as storageKey fields, with no provider/url', async () => {
    uploadResourceVideo.mockResolvedValue({ ok: true, value: uploaded });
    addResourceAction.mockResolvedValue({ ok: true });
    await openVideoForm();
    fireEvent.click(screen.getByText(c.videoSourceUpload));

    const file = new File(['x'], 'solution.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(c.file), { target: { files: [file] } });
      await Promise.resolve();
    });

    fireEvent.change(screen.getByLabelText(c.resourceTitle), { target: { value: 'حل الواجب' } });
    await act(async () => {
      fireEvent.click(screen.getByText(c.add));
      await Promise.resolve();
    });

    expect(addResourceAction).toHaveBeenCalledWith('c1', 'l1', {
      kind: 'video',
      title: 'حل الواجب',
      description: null,
      ...uploaded,
    });
  });

  it('submits a youtube video exactly as before, unaffected by the new toggle', async () => {
    addResourceAction.mockResolvedValue({ ok: true });
    await openVideoForm();

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
    expect(uploadResourceVideo).not.toHaveBeenCalled();
  });
});
