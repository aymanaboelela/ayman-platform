import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import sharp, { type OutputInfo } from 'sharp';
import {
  ALLOWED_UPLOAD_EXT,
  ALLOWED_UPLOAD_MIME,
  AVATAR_SIZE_PX,
  MAX_AVATAR_BYTES,
  MAX_INPUT_PIXELS,
  MAX_UPLOAD_BYTES,
  OUTPUT_EXT,
  OUTPUT_MIME,
  type MediaAsset,
  type MediaPatch,
} from '@ayman/contracts/admin/media';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../audit/audit-context';
import { PrismaService } from '../../prisma/prisma.service';
import { FileSignatureService } from './file-signature.service';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { decodeOriginalName } from './original-name';

const ALLOWED_MIME = new Set<string>(ALLOWED_UPLOAD_MIME);
const ALLOWED_EXT = new Set<string>(ALLOWED_UPLOAD_EXT);

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface MediaListQuery {
  page: number;
  perPage: number;
  includeArchived: boolean;
}

interface MediaAssetRecord {
  id: string;
  storageKey: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altAr: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

function toDto(asset: MediaAssetRecord): MediaAsset {
  return {
    id: asset.id,
    storageKey: asset.storageKey,
    filename: asset.filename,
    mime: OUTPUT_MIME,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    altAr: asset.altAr,
    archivedAt: asset.archivedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signature: FileSignatureService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * The four gates every upload passes, in order. Each one is bypassable
   * alone:
   *   1. extension allowlist    — cheap, catches typos, bypassed by renaming
   *   2. magic-byte sniff       — reads the buffer, bypassed by a polyglot
   *   3. sharp RE-ENCODE        — destroys polyglots, strips EXIF/GPS entirely
   *   4. UUID key               — the original filename never touches the disk
   *
   * Extracted from `upload` when `uploadAvatar` arrived. The two differ only
   * in their size cap, HOW they resize (a square `cover` crop for avatars, a
   * plain width bound for everything else — both paths resize now), and what
   * they audit — and a second copy of gates 1 to 3 is a second place for one
   * of them to be quietly dropped. Gate 4 stays with each caller, since it is
   * the storage key.
   *
   * The uploaded Content-Type header is read NOWHERE in this method.
   */
  private async gateAndEncode(
    file: UploadFile,
    options: { maxBytes: number; square?: number },
  ): Promise<{ data: Buffer; info: OutputInfo; extension: string; detectedMime: string }> {
    if (file.size > options.maxBytes) {
      throw new PayloadTooLargeException();
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(extension)) {
      throw new BadRequestException('file extension is not allowed');
    }

    const detected = await this.signature.detect(file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed image type');
    }

    // The re-encode is the real control. A GIF/HTML polyglot sniffs as GIF and
    // passes gate 2; re-encoding it produces a clean WebP with no HTML in it,
    // and drops every EXIF/GPS block in the process. For a photo taken on a
    // student's phone, that GPS block is not a theoretical concern.
    let pipeline = sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: detected.mime === 'image/gif' || detected.mime === 'image/webp',
      failOn: 'error',
    }).rotate(); // applies the EXIF orientation, then discards the metadata

    if (options.square) {
      // `withoutEnlargement: false` on purpose — a 64px avatar is upscaled to
      // the canonical size rather than served smaller than every layout
      // assumes. `cover` crops to the centre, which is where faces are.
      pipeline = pipeline.resize(options.square, options.square, { fit: 'cover' });
    } else {
      // Everything that is not an avatar — course covers, home blocks, lesson
      // attachments — used to be stored at whatever size it arrived at.
      // `MAX_UPLOAD_BYTES` (8 MB) and `MAX_INPUT_PIXELS` (50 MP) cap what may
      // be DECODED, not what lands on disk, and that ceiling is already in
      // use: four of the assets already in `.media` are 1,899,938-byte WebPs
      // at 2400×1350. Nothing on the site paints a box that big. `--site-shell`
      // is 1440 CSS px (theme.css) and `.courses__grid` is
      // `minmax(min(100%, 19rem), 1fr)`, so a `.course-card__thumb` is a 16/9
      // box between roughly 304 and 460 CSS px wide — about 340 on a phone,
      // and the catalog paints one per card. A 1.9 MB download per card on a
      // data-saver 3G connection is tens of seconds before anything is legible.
      //
      // 1600 sits above the largest 1× box the layout can produce and is still
      // ~4× the linear pixels a phone card consumes, so it costs no visible
      // sharpness anywhere, including on a 2× display.
      //
      // `withoutEnlargement: true` is the OPPOSITE of the avatar rule above,
      // deliberately: a 300px logo must stay 300px. Upscaling it would only
      // produce a larger file with no more detail in it. `fit: 'inside'`
      // preserves the aspect ratio — the uploader chose the framing, and this
      // is a size bound, not a crop.
      pipeline = pipeline.resize(1600, null, { withoutEnlargement: true, fit: 'inside' });
    }

    // A magic-byte sniff only reads the header — it cannot tell a genuine
    // image from a truncated or otherwise corrupt one wearing a valid
    // signature. Without this catch, that shape of input reaches sharp's
    // decoder uncaught and surfaces as an unhandled 500, not the 400 every
    // other rejection here produces.
    const { data, info } = await pipeline
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        throw new BadRequestException('file could not be processed as an image');
      });

    return { data, info, extension, detectedMime: detected.mime };
  }

  async upload(file: UploadFile): Promise<MediaAsset> {
    const { data, info, extension, detectedMime } = await this.gateAndEncode(file, {
      maxBytes: MAX_UPLOAD_BYTES,
    });

    const id = randomUUID();
    const key = `${id.slice(0, 2)}/${id}.${OUTPUT_EXT}`;
    await this.storage.put(key, data, OUTPUT_MIME);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        storageKey: key,
        // Stored for display only; it is never used to build a path.
        filename: decodeOriginalName(file.originalname).slice(0, 200),
        mime: OUTPUT_MIME,
        sizeBytes: data.byteLength,
        width: info.width,
        height: info.height,
        uploadedBy: currentActor().actorUserId,
      },
    });

    await this.audit.record({
      action: 'media:upload',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: asset.id,
      outcome: 'success',
      metadata: {
        declaredExtension: extension,
        detectedMime,
        outputBytes: data.byteLength,
      },
    });

    return toDto(asset);
  }

  /**
   * A student's own profile photo.
   *
   * Same four gates as `upload`, two extra rules: a much smaller cap
   * (`MAX_AVATAR_BYTES`), because this is the only upload path open to every
   * account rather than to the handful holding `media:write`; and a square
   * `cover` resize, so what is stored is what is served and every consumer
   * gets the same framing.
   *
   * The caller (`ProfileService`) is what points `User.image` at the result.
   * This method deliberately does not touch the user row: it is the media
   * layer, and giving it a reason to write to `users` would make an image
   * pipeline a thing that can change identity.
   */
  async uploadAvatar(file: UploadFile): Promise<MediaAsset> {
    const { data, info, extension, detectedMime } = await this.gateAndEncode(file, {
      maxBytes: MAX_AVATAR_BYTES,
      square: AVATAR_SIZE_PX,
    });

    const id = randomUUID();
    const key = `${id.slice(0, 2)}/${id}.${OUTPUT_EXT}`;
    await this.storage.put(key, data, OUTPUT_MIME);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        storageKey: key,
        filename: decodeOriginalName(file.originalname).slice(0, 200),
        mime: OUTPUT_MIME,
        sizeBytes: data.byteLength,
        width: info.width,
        height: info.height,
        uploadedBy: currentActor().actorUserId,
      },
    });

    // A distinct action from `media:upload`. The audit log is what answers
    // "who uploaded what" months later, and student avatars and staff media
    // are different questions with different retention interests.
    await this.audit.record({
      action: 'profile:avatar-upload',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: asset.id,
      outcome: 'success',
      metadata: {
        declaredExtension: extension,
        detectedMime,
        outputBytes: data.byteLength,
      },
    });

    return toDto(asset);
  }

  async list(query: MediaListQuery): Promise<{ rows: MediaAsset[]; rowCount: number }> {
    const where = query.includeArchived ? {} : { archivedAt: null };

    const [rowCount, rows] = await this.prisma.$transaction([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return { rowCount, rows: rows.map(toDto) };
  }

  async patch(id: string, input: MediaPatch): Promise<MediaAsset> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.mediaAsset.update({ where: { id }, data: input });
    return toDto(updated);
  }

  /**
   * Archive is a SOFT delete. The bytes are never removed — an asset
   * referenced by a published home block or a lesson attachment must not
   * 404 the moment someone tidies the library. Restore is the inverse of the
   * exact same field, so "undo" is a real server-side operation, not a
   * client-side timer racing a hard delete.
   */
  async archive(id: string): Promise<MediaAsset> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await this.audit.record({
      action: 'media:archive',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
    });

    return toDto(updated);
  }

  async restore(id: string): Promise<MediaAsset> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.mediaAsset.update({ where: { id }, data: { archivedAt: null } });

    await this.audit.record({
      action: 'media:restore',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
    });

    return toDto(updated);
  }

  /**
   * The public read path's existence check. Delegates key validation to
   * `MediaStorage` (A11) — an invalid key shape never reaches the database
   * lookup, let alone the filesystem.
   */
  async statByKey(key: string): Promise<{ size: number } | null> {
    return this.storage.stat(key);
  }

  async streamByKey(key: string): Promise<Readable> {
    return this.storage.getStream(key);
  }
}
