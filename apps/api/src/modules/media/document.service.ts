import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  ALLOWED_DOCUMENT_EXT,
  ALLOWED_DOCUMENT_MIME,
  MAX_DOCUMENT_BYTES,
} from '@ayman/contracts/admin/media';
import { AuditService } from '../../audit/audit.service';
import { FileSignatureService } from './file-signature.service';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import type { UploadFile } from './media.service';
import { decodeOriginalName } from './original-name';

const ALLOWED_EXT = new Set<string>(ALLOWED_DOCUMENT_EXT);
const ALLOWED_MIME = new Set<string>(ALLOWED_DOCUMENT_MIME);

/**
 * The stored extension is chosen by US from the DETECTED mime, never echoed
 * from the upload — so a file named `.pdf` that sniffs as `.docx` is stored as
 * `.docx`, and the name a caller supplied never influences a path.
 */
const EXT_FOR_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export interface UploadedDocument {
  storageKey: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

/**
 * `MediaService.upload`'s four gates are: extension allowlist, magic-byte
 * sniff, **sharp re-encode**, UUID key. Gate 3 is the one doing the real work
 * — and it cannot exist here, because re-encoding is not a thing you can do to
 * a PDF or an OOXML package. Rather than route documents through a quietly
 * weakened copy of that method, this service states the gap and compensates:
 *
 *   · upload is `media:write` — admin-only, and every call is audit-logged;
 *   · the served Content-Type is derived from OUR detection, never the upload;
 *   · the serve route sets `default-src 'none'; sandbox` + `nosniff`, so the
 *     document renders in a unique opaque origin with no script execution;
 *   · nothing on either origin ever executes a stored document.
 *
 * The uploaded Content-Type header is read NOWHERE in this method.
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly audit: AuditService,
    private readonly signature: FileSignatureService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * `prefix` picks WHICH private area the bytes land in — `doc/` for a lesson
   * material, `msg/` for a conversation attachment.
   *
   * It is a parameter rather than two near-identical methods because the four
   * compensating controls above are the whole value of this service, and a
   * second copy of them is a second place for one to be quietly dropped. Both
   * prefixes are three-segment keys, so neither is reachable through the
   * public `GET /media/:prefix/:name` route — the destination changes, the
   * guarantee does not.
   */
  async upload(file: UploadFile, prefix = 'doc'): Promise<UploadedDocument> {
    // Checked before the extension so an oversized upload is rejected without
    // any further work, matching MediaService's order.
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new PayloadTooLargeException();
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(extension)) {
      throw new BadRequestException('file extension is not allowed');
    }

    // Reads the BUFFER. A `.pptx` whose container cannot be resolved to a
    // specific OOXML type sniffs as `application/zip` and is rejected here —
    // this fails closed, which is the intended behaviour.
    const detected = await this.signature.detect(file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed document type');
    }

    const id = randomUUID();
    const key = `${prefix}/${id.slice(0, 2)}/${id}.${EXT_FOR_MIME[detected.mime]}`;
    await this.storage.put(key, file.buffer, detected.mime);

    await this.audit.record({
      action: 'media:upload',
      resourceType: AUDIT_RESOURCES.lessonResource,
      resourceId: id,
      outcome: 'success',
      metadata: {
        pipeline: 'document',
        prefix,
        declaredExtension: extension,
        detectedMime: detected.mime,
        storageKey: key,
        outputBytes: file.buffer.byteLength,
      },
    });

    return {
      storageKey: key,
      // Stored for display only; it is never used to build a path.
      filename: decodeOriginalName(file.originalname).slice(0, 200),
      mime: detected.mime,
      sizeBytes: file.buffer.byteLength,
    };
  }
}
