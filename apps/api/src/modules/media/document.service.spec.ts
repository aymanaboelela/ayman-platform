import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { MAX_DOCUMENT_BYTES } from '@ayman/contracts/admin/media';
import { LocalDiskStorage } from './storage/local-disk.storage';
import { DocumentService } from './document.service';

const PDF_BYTES = Buffer.from('%PDF-1.7\n', 'binary');

function makeService(detected: { mime: string; ext: string } | null) {
  const storage = { put: jest.fn(), getStream: jest.fn(), stat: jest.fn(), delete: jest.fn() };
  const audit = { record: jest.fn() };
  const signature = { detect: jest.fn().mockResolvedValue(detected) };
  const service = new DocumentService(audit as never, signature as never, storage as never);
  return { service, storage, audit, signature };
}

const pdf = { mime: 'application/pdf', ext: 'pdf' };

describe('DocumentService.upload', () => {
  it('rejects an oversized file before reading anything', async () => {
    const { service, signature } = makeService(pdf);
    await expect(
      service.upload({
        originalname: 'huge.pdf',
        buffer: PDF_BYTES,
        size: MAX_DOCUMENT_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('rejects a disallowed extension before reading the buffer', async () => {
    const { service, signature } = makeService(pdf);
    await expect(
      service.upload({ originalname: 'notes.exe', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('rejects macro-enabled Office formats by extension', async () => {
    const { service } = makeService(pdf);
    for (const name of ['deck.pptm', 'doc.docm', 'sheet.xlsm']) {
      await expect(
        service.upload({ originalname: name, buffer: PDF_BYTES, size: 10 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects when the magic bytes disagree with the extension', async () => {
    const { service, storage } = makeService({ mime: 'image/png', ext: 'png' });
    await expect(
      service.upload({ originalname: 'notes.pdf', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects a file with no detectable signature', async () => {
    const { service } = makeService(null);
    await expect(
      service.upload({ originalname: 'notes.pdf', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an OOXML package that only resolves to a generic zip', async () => {
    const { service } = makeService({ mime: 'application/zip', ext: 'zip' });
    await expect(
      service.upload({ originalname: 'deck.pptx', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores under a UUID key that does not contain the original filename', async () => {
    const { service, storage } = makeService(pdf);
    const result = await service.upload({
      originalname: 'الملخص النهائي.pdf',
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });

    expect(result.storageKey).toMatch(/^doc\/[0-9a-f]{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(result.storageKey).not.toContain('الملخص');
    expect(storage.put).toHaveBeenCalledWith(result.storageKey, PDF_BYTES, 'application/pdf');
  });

  it('takes the stored extension from the DETECTED mime, not the filename', async () => {
    const { service } = makeService({
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ext: 'pptx',
    });
    // Named .docx, sniffs as a presentation — stored as .pptx.
    const result = await service.upload({
      originalname: 'mislabelled.docx',
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });
    expect(result.storageKey).toMatch(/\.pptx$/);
  });

  it('keeps the original filename for DISPLAY only, truncated', async () => {
    const { service } = makeService(pdf);
    const result = await service.upload({
      originalname: `${'x'.repeat(300)}.pdf`,
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });
    expect(result.filename).toHaveLength(200);
    expect(result.mime).toBe('application/pdf');
    expect(result.sizeBytes).toBe(PDF_BYTES.byteLength);
  });

  it('audits the upload with the storage key so the trail reaches the row', async () => {
    const { service, audit } = makeService(pdf);
    const result = await service.upload({
      originalname: 'lecture.pdf',
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'media:upload',
        resourceType: 'lesson_resources',
        outcome: 'success',
        metadata: expect.objectContaining({
          pipeline: 'document',
          storageKey: result.storageKey,
          detectedMime: 'application/pdf',
        }),
      }),
    );
  });
});

/**
 * Against the REAL storage class, not a mock.
 *
 * The suite above mocks `MediaStorage`, which is right for testing the gates —
 * and is exactly why it could not catch that `DocumentService` minted
 * `doc/<hex>/<uuid>.pdf` while `LocalDiskStorage` only accepted the IMAGE key
 * shape. Every gate test passed and every real upload would have thrown
 * "invalid storage key". This closes that seam: the key this service produces
 * must be a key that storage actually accepts.
 */
describe('DocumentService against real disk storage', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'doc-service-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function realService(mime: string) {
    const storage = new LocalDiskStorage(root);
    const audit = { record: jest.fn() };
    const signature = { detect: jest.fn().mockResolvedValue({ mime, ext: 'x' }) };
    return { service: new DocumentService(audit as never, signature as never, storage), storage };
  }

  it.each([
    ['application/pdf', 'notes.pdf'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck.pptx'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet.xlsx'],
  ])('writes %s to disk and can read it back', async (mime, filename) => {
    const { service, storage } = realService(mime);

    const result = await service.upload({
      originalname: filename,
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });

    // The whole point: the key it minted is one storage accepts.
    await expect(storage.stat(result.storageKey)).resolves.toEqual({
      size: PDF_BYTES.byteLength,
    });
  });
});
