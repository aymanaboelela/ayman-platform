import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import {
  ALLOWED_VOICE_EXT,
  MAX_VOICE_BYTES,
  MIME_FOR_EXT,
  VOICE_MAGIC,
} from '@ayman/contracts/admin/media';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import type { UploadFile } from './media.service';

const ALLOWED_EXT = new Set<string>(ALLOWED_VOICE_EXT);

export interface UploadedVoice {
  storageKey: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Which container the BYTES are, or `null`.
 *
 * Read off the buffer and never from the filename: the extension the browser
 * puts on a `Blob` is whatever the recorder was configured with, and the whole
 * point of this check is that the two can disagree.
 */
function sniff(buffer: Buffer): (typeof ALLOWED_VOICE_EXT)[number] | null {
  for (const candidate of VOICE_MAGIC) {
    const slice = buffer.subarray(candidate.offset, candidate.offset + candidate.bytes.length);
    if (slice.length !== candidate.bytes.length) continue;
    if (candidate.bytes.every((byte, index) => slice[index] === byte)) return candidate.ext;
  }
  return null;
}

/**
 * A recorded reply, stored.
 *
 * ## The third pipeline, and why it is not one of the other two
 *
 * `MediaService` re-encodes through sharp, which is what destroys polyglots in
 * an image — there is no equivalent for audio, and re-encoding with ffmpeg
 * would mean carrying ffmpeg in the runtime image for a feature one person
 * uses. `DocumentService` gates Office containers and PDFs and would have to be
 * taught two more formats it otherwise has no business knowing.
 *
 * So: its own service, deliberately narrow.
 *
 * ## What stands in for the re-encode
 *
 *  1. **Only the instructor can reach it.** The route is `conversation:reply`;
 *     a student's side of the thread has no recorder and no upload. This is the
 *     control that makes the rest proportionate — the untrusted-uploader threat
 *     model the image pipeline is built for does not apply.
 *  2. **The container is sniffed from the bytes**, and only WebM and MP4 pass.
 *  3. **The stored extension is OURS**, chosen from what was detected, so the
 *     key is the only record of what the bytes are — `mimeForStorageKey` reads
 *     it back and nothing echoes a client-supplied mime.
 *  4. **It is served from a three-segment `msg/` prefix**, which the public
 *     `GET /media/:prefix/:name` cannot address at all, through a route that
 *     re-checks the asker against the thread.
 *  5. **`Content-Disposition: attachment`** on the way out, like every other
 *     conversation attachment — the browser plays it from an `<audio>` element
 *     it constructs, never by navigating to it.
 */
@Injectable()
export class VoiceService {
  constructor(
    private readonly audit: AuditService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  async upload(file: UploadFile, prefix = 'msg'): Promise<UploadedVoice> {
    // Size first, so an oversized upload is refused without any further work —
    // matching the order the other two pipelines use.
    if (file.size > MAX_VOICE_BYTES) {
      throw new PayloadTooLargeException();
    }

    const declared = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(declared)) {
      throw new BadRequestException('file extension is not allowed');
    }

    const detected = sniff(file.buffer);
    if (!detected) {
      throw new BadRequestException('file contents are not an allowed audio type');
    }

    const id = randomUUID();
    const key = `${prefix}/${id.slice(0, 2)}/${id}.${detected}`;
    await this.storage.put(key, file.buffer, MIME_FOR_EXT[detected] ?? 'application/octet-stream');

    await this.audit.record({
      action: 'media:upload',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        pipeline: 'voice',
        prefix,
        declaredExtension: declared,
        // Both, because a disagreement between them is the interesting case and
        // the audit row is where it would be noticed.
        detectedContainer: detected,
        storageKey: key,
        outputBytes: file.buffer.byteLength,
      },
    });

    return {
      storageKey: key,
      // Display only, never used to build a path.
      filename: `voice.${detected}`,
      sizeBytes: file.buffer.byteLength,
    };
  }
}
