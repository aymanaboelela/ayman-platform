import type { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALLOWED_DOCUMENT_EXT,
  ALLOWED_UPLOAD_EXT,
  ALLOWED_VOICE_EXT,
  mimeForStorageKey,
} from '@ayman/contracts/admin/media';
import type { MessageAttachmentInput } from '@ayman/contracts/assistant/conversation';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService, type UploadFile } from '../media/media.service';
import { DocumentService } from '../media/document.service';
import { VoiceService } from '../media/voice.service';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { hashGuestToken } from './guest-token';
import type { Prisma } from '../../generated/prisma/client';

/**
 * The prefix every conversation attachment is stored under.
 *
 * Three segments, so `GET /media/:prefix/:name` — which binds two — cannot
 * address it. That is the whole access-control story for the bytes: they come
 * back only through the two routes below, each of which re-checks who is
 * asking against the thread the file hangs off.
 */
const ATTACHMENT_PREFIX = 'msg';

const IMAGE_EXT = new Set<string>(ALLOWED_UPLOAD_EXT);
const DOCUMENT_EXT = new Set<string>(ALLOWED_DOCUMENT_EXT);
const VOICE_EXT = new Set<string>(ALLOWED_VOICE_EXT);

/** The bytes, and everything the response headers need. */
export interface AttachmentStream {
  stream: Readable;
  mime: string;
  filename: string;
  size: number;
}

/**
 * Files on messages: putting them in, and getting them back out to exactly the
 * two people entitled to them.
 *
 * ## Why this is not part of `AssistantService`
 *
 * That service is under a CI-enforced rule — `assistant.service.spec.ts`
 * records every Prisma delegate it reaches for and fails on anything outside
 * `{conversation, conversationMessage, $transaction}` — and its spec
 * constructs it as `new AssistantService(prisma, notifications)`. Injecting a
 * byte store into it would break the second and weaken the first: the point of
 * that rule is that the conversation service cannot reach anything, and
 * "cannot reach anything except the disk" is a materially different promise.
 *
 * So the file layer sits beside it with its own dependencies, and the two
 * share nothing but the tables.
 *
 * ## One upload endpoint, two pipelines
 *
 * A picture of a worked solution and a lecture PDF are the same gesture on the
 * screen — «يبعت PDF أو صورة عادي» — and asking the client to pick an endpoint
 * by sniffing an extension would put the routing decision on the least
 * trustworthy side of the wire. The kind is decided HERE, from the declared
 * extension, and then the file goes through whichever of the two existing,
 * already-audited pipelines applies. Neither is weakened: an image is still
 * re-encoded by sharp, a document is still magic-byte gated and never
 * re-encoded, and both land under a prefix nothing public can read.
 */
@Injectable()
export class ConversationAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly documents: DocumentService,
    private readonly voice: VoiceService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Store an uploaded file and hand back what a reply needs to reference it.
   *
   * The extension is only used to CHOOSE a pipeline; each one then re-derives
   * the truth from the bytes and rejects a file whose contents disagree with
   * its name. So a `.pdf` that is really a PNG is refused by
   * `DocumentService`'s sniff rather than quietly stored as an image.
   */
  async upload(file: UploadFile): Promise<MessageAttachmentInput> {
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';

    if (IMAGE_EXT.has(extension)) {
      return this.media.uploadPrivateImage(file, ATTACHMENT_PREFIX);
    }
    if (DOCUMENT_EXT.has(extension)) {
      const uploaded = await this.documents.upload(file, ATTACHMENT_PREFIX);
      // `mime` is dropped on purpose: the stored extension carries it, and a
      // reply that echoed a mime back would be a second copy of a fact only
      // the key can state honestly. See `mimeForStorageKey`.
      return {
        storageKey: uploaded.storageKey,
        filename: uploaded.filename,
        sizeBytes: uploaded.sizeBytes,
      };
    }

    if (VOICE_EXT.has(extension)) {
      /*
       * A recorded reply. Third pipeline, and the narrowest of the three — see
       * `VoiceService` for the five controls that stand in for the sharp
       * re-encode an audio file cannot have, and for why only the instructor
       * can reach this branch at all.
       *
       * ⚠️ `webm` is checked HERE and not in `IMAGE_EXT` above, and the two
       * cannot collide: WebM is a video/audio container and is absent from
       * `ALLOWED_UPLOAD_EXT`, which is `png|jpg|jpeg|webp|avif|gif`. `webp` and
       * `webm` differ by one letter and route to different pipelines; that is
       * worth reading twice.
       */
      return this.voice.upload(file, ATTACHMENT_PREFIX);
    }

    throw new BadRequestException('file extension is not allowed');
  }

  /**
   * Confirm a key the CLIENT sent actually exists before it is written onto a
   * message.
   *
   * The upload and the reply are two requests, so the key crosses the wire and
   * comes back — which means a caller can send one that was never stored, or
   * one belonging to a different upload that failed. The schema proves it is
   * *shaped* like a key; only the storage can say it is a key to something.
   * Without this, a fabricated value becomes a permanent bubble on a student's
   * screen that shows a filename and 404s when they tap it.
   */
  async assertStored(attachment: MessageAttachmentInput): Promise<void> {
    const stat = await this.storage.stat(attachment.storageKey);
    if (!stat) throw new BadRequestException('attachment was not uploaded');
  }

  /**
   * The bytes behind one message, for a caller who is entitled to them.
   *
   * ## Ownership is in the WHERE, never a fetch-then-compare
   *
   * `owner` is `undefined` for the instructor (who may read every thread) and
   * `{ userId }` / `{ guestTokenHash }` for the visitor side — the same shape
   * `AssistantService.ownerWhere` builds, applied to the message's own
   * `conversation` relation. A message id from someone else's thread therefore
   * matches ZERO rows rather than being fetched and then rejected: a
   * fetch-then-compare that 404s on mismatch still confirms the id exists.
   *
   * Both ids are in the filter, so a real message id from a different
   * conversation does not resolve either.
   */
  async stream(
    conversationId: string,
    messageId: string,
    owner?: Prisma.ConversationWhereInput,
  ): Promise<AttachmentStream> {
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        ...(owner ? { conversation: owner } : {}),
      },
      select: { attachmentKey: true, attachmentName: true, attachmentBytes: true },
    });

    if (!message?.attachmentKey || !message.attachmentName || !message.attachmentBytes) {
      throw new NotFoundException();
    }

    // From the key WE minted, never from anything an uploader declared — the
    // same rule the serve route for lesson documents follows.
    const mime = mimeForStorageKey(message.attachmentKey);
    if (!mime) throw new NotFoundException();

    return {
      // Throws if the object is gone, which is a 500 and correct: the row says
      // it is there, so a missing object is a broken installation rather than
      // a bad request.
      stream: await this.storage.getStream(message.attachmentKey),
      mime,
      filename: message.attachmentName,
      // The stored byte count, not a fresh `stat`: it was written in the same
      // transaction as the row, and one round trip to the disk is enough.
      size: message.attachmentBytes,
    };
  }

  /**
   * The visitor-side ownership filter, or `null` when the caller presented no
   * identity at all.
   *
   * A copy of `AssistantService.ownerWhere`'s rule rather than a call into it,
   * because that method is private and this service deliberately does not
   * depend on that one. Both are three lines and both are pinned by tests; the
   * alternative is a public method on the conversation service that exists
   * only for this file.
   */
  ownerWhere(userId: string | null, guestToken: string | null): Prisma.ConversationWhereInput | null {
    if (userId) return { userId };
    if (guestToken) return { guestTokenHash: hashGuestToken(guestToken) };
    return null;
  }
}
