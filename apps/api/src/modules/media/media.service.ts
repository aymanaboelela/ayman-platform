import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import sharp from 'sharp';
import {
  ALLOWED_UPLOAD_EXT,
  ALLOWED_UPLOAD_MIME,
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
   * Four gates, in order. Each one is bypassable alone:
   *   1. extension allowlist    — cheap, catches typos, bypassed by renaming
   *   2. magic-byte sniff       — reads the buffer, bypassed by a polyglot
   *   3. sharp RE-ENCODE        — destroys polyglots, strips EXIF/GPS entirely
   *   4. UUID key               — the original filename never touches the disk
   *
   * The uploaded Content-Type header is read NOWHERE in this method.
   */
  async upload(file: UploadFile): Promise<MediaAsset> {
    if (file.size > MAX_UPLOAD_BYTES) {
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
    // and drops every EXIF/GPS block in the process.
    const pipeline = sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: detected.mime === 'image/gif' || detected.mime === 'image/webp',
      failOn: 'error',
    })
      .rotate() // applies the EXIF orientation, then discards the metadata
      .webp({ quality: 82 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    const id = randomUUID();
    const key = `${id.slice(0, 2)}/${id}.${OUTPUT_EXT}`;
    await this.storage.put(key, data, OUTPUT_MIME);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id,
        storageKey: key,
        // Stored for display only; it is never used to build a path.
        filename: file.originalname.slice(0, 200),
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
        detectedMime: detected.mime,
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
