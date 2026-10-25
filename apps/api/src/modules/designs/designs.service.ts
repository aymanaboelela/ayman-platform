import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { OUTPUT_EXT, OUTPUT_MIME, type MediaAsset } from '@ayman/contracts/admin/media';
import {
  DESIGN_NAME_MAX,
  DESIGN_QUOTA_BYTES,
  DESIGN_UPLOAD_EXT,
  DESIGN_UPLOAD_MIME,
  MAX_DESIGN_BYTES,
  cleanDesignName,
  type DesignAsset,
  type DesignFolder,
  type DesignFolderColor,
  type DesignFolderDetail,
  type DesignFormat,
  type DesignPublishShape,
  type DesignStudio,
} from '@ayman/contracts/designs';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { FileSignatureService } from '../media/file-signature.service';
import { decodeOriginalName } from '../media/original-name';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { encodeDesign, encodePublished, withEncodeSlot, type EncodedDesign } from './design-encode';

const ALLOWED_EXT = new Set<string>(DESIGN_UPLOAD_EXT);
const ALLOWED_MIME = new Set<string>(DESIGN_UPLOAD_MIME);

/** Our own ids are uuids; anything else is a 404, never a Postgres cast error. */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_FOR_FORMAT: Record<DesignFormat, string> = { png: 'image/png', jpg: 'image/jpeg' };

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

interface FolderRow {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetRow {
  id: string;
  folderId: string;
  name: string;
  storageKey: string;
  previewKey: string;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  version: number;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DesignFile {
  key: string;
  mime: string;
  /** For `Content-Disposition` — the display name plus the real extension. */
  filename: string;
}

function assertId(id: string): void {
  if (!ID.test(id)) throw new NotFoundException();
}

function mintKey(extension: 'png' | 'jpg' | 'webp'): string {
  const id = randomUUID();
  return `design/${id.slice(0, 2)}/${id}.${extension}`;
}

/** «thumbnail-final (2).png» → «thumbnail-final (2)». The name is display text only. */
function nameFromUpload(originalname: string): string {
  const decoded = decodeOriginalName(originalname);
  const stem = decoded.includes('.') ? decoded.slice(0, decoded.lastIndexOf('.')) : decoded;
  return cleanDesignName(stem).slice(0, DESIGN_NAME_MAX) || 'تصميم';
}

function toAsset(row: AssetRow, names: ReadonlyMap<string, string>): DesignAsset {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    format: row.format === 'jpg' ? 'jpg' : 'png',
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    version: row.version,
    uploadedByName: row.uploadedBy ? (names.get(row.uploadedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * «ستوديو التصميم». See `@ayman/contracts/designs` for the shape of the
 * feature and `design-encode.ts` for the pipeline every byte goes through.
 *
 * Every write is audited with the acting account, the designer's own
 * included. Bytes are written BEFORE the row that points at them and removed
 * AFTER the row is gone, so a crash between the two leaves an orphan file on
 * disk at worst — never a row whose picture is missing.
 */
@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signature: FileSignatureService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  // ── Reading ───────────────────────────────────────────────────────────

  async studio(): Promise<DesignStudio> {
    const [folders, totals, newest] = await Promise.all([
      this.prisma.designFolder.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.designAsset.groupBy({
        by: ['folderId'],
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      // One newest picture per folder, for the folder tile. `distinct` on the
      // folder with the order by newest is Postgres's DISTINCT ON.
      this.prisma.designAsset.findMany({
        distinct: ['folderId'],
        orderBy: [{ folderId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: { folderId: true, id: true, version: true },
      }),
    ]);

    const byFolder = new Map(totals.map((row) => [row.folderId, row]));
    const coverOf = new Map(newest.map((row) => [row.folderId, { id: row.id, version: row.version }]));
    const usedBytes = totals.reduce((sum, row) => sum + (row._sum.sizeBytes ?? 0), 0);

    return {
      folders: folders.map((folder) =>
        this.toFolder(folder, byFolder.get(folder.id), coverOf.get(folder.id) ?? null),
      ),
      usedBytes,
      quotaBytes: DESIGN_QUOTA_BYTES,
    };
  }

  async folder(id: string): Promise<DesignFolderDetail> {
    assertId(id);
    const folder = await this.prisma.designFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    const assets = await this.prisma.designAsset.findMany({
      where: { folderId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const names = await this.uploaderNames(assets);
    const sizeBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    return {
      folder: this.toFolder(
        folder,
        { _count: { _all: assets.length }, _sum: { sizeBytes } },
        assets[0] ? { id: assets[0].id, version: assets[0].version } : null,
      ),
      assets: assets.map((asset) => toAsset(asset, names)),
    };
  }

  /** Where one picture's bytes are — the master or its grid preview. */
  async file(id: string, which: 'master' | 'preview'): Promise<DesignFile> {
    assertId(id);
    const asset = await this.prisma.designAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException();
    if (which === 'preview') {
      return { key: asset.previewKey, mime: OUTPUT_MIME, filename: `${asset.name}.webp` };
    }
    const format: DesignFormat = asset.format === 'jpg' ? 'jpg' : 'png';
    return { key: asset.storageKey, mime: MIME_FOR_FORMAT[format], filename: `${asset.name}.${format}` };
  }

  // ── Folders ───────────────────────────────────────────────────────────

  async createFolder(input: { name: string; color: DesignFolderColor }, actorUserId: string): Promise<DesignFolder> {
    const folder = await this.prisma.designFolder.create({
      data: { name: input.name, color: input.color, createdBy: actorUserId },
    });
    await this.audit.record({
      action: 'design:folder-create',
      resourceType: AUDIT_RESOURCES.designFolder,
      resourceId: folder.id,
      outcome: 'success',
      metadata: { name: folder.name },
    });
    return this.toFolder(folder, undefined, null);
  }

  async patchFolder(
    id: string,
    input: { name?: string; color?: DesignFolderColor },
  ): Promise<DesignFolder> {
    assertId(id);
    const existing = await this.prisma.designFolder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.designFolder.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });
    await this.audit.record({
      action: 'design:folder-update',
      resourceType: AUDIT_RESOURCES.designFolder,
      resourceId: id,
      outcome: 'success',
      metadata: { from: existing.name, to: input.name ?? existing.name, color: input.color ?? null },
    });
    return (await this.folder(id)).folder;
  }

  /**
   * The folder AND everything in it. The confirm dialog says how many
   * pictures that is; this does not ask again. Bytes go last, after the rows,
   * for the reason in the class note.
   */
  async deleteFolder(id: string): Promise<void> {
    assertId(id);
    const folder = await this.prisma.designFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException();
    const assets = await this.prisma.designAsset.findMany({
      where: { folderId: id },
      select: { storageKey: true, previewKey: true },
    });
    await this.prisma.$transaction([
      this.prisma.designAsset.deleteMany({ where: { folderId: id } }),
      this.prisma.designFolder.delete({ where: { id } }),
    ]);
    await this.audit.record({
      action: 'design:folder-delete',
      resourceType: AUDIT_RESOURCES.designFolder,
      resourceId: id,
      outcome: 'success',
      metadata: { name: folder.name, assets: assets.length },
    });
    await this.removeBytes(assets.flatMap((asset) => [asset.storageKey, asset.previewKey]));
  }

  // ── Pictures ──────────────────────────────────────────────────────────

  async upload(folderId: string, file: UploadFile, actorUserId: string): Promise<DesignAsset> {
    assertId(folderId);
    const folder = await this.prisma.designFolder.findUnique({ where: { id: folderId }, select: { id: true } });
    if (!folder) throw new NotFoundException();

    const encoded = await this.gateAndEncode(file, 0);
    const keys = await this.store(encoded);

    let asset: AssetRow;
    try {
      asset = await this.prisma.designAsset.create({
        data: {
          folderId,
          name: nameFromUpload(file.originalname),
          storageKey: keys.storageKey,
          previewKey: keys.previewKey,
          format: encoded.format,
          width: encoded.width,
          height: encoded.height,
          sizeBytes: encoded.master.byteLength,
          uploadedBy: actorUserId,
        },
      });
    } catch (error) {
      // The folder was deleted mid-upload: the row cannot exist, so neither
      // may its bytes.
      await this.removeBytes([keys.storageKey, keys.previewKey]);
      throw error;
    }
    await this.prisma.designFolder.update({ where: { id: folderId }, data: { updatedAt: new Date() } });

    await this.audit.record({
      action: 'design:upload',
      resourceType: AUDIT_RESOURCES.designAsset,
      resourceId: asset.id,
      outcome: 'success',
      metadata: {
        folderId,
        format: encoded.format,
        width: encoded.width,
        height: encoded.height,
        outputBytes: encoded.master.byteLength,
      },
    });

    return toAsset(asset, await this.uploaderNames([asset]));
  }

  /**
   * «استبدال» — new bytes, same picture: the name, the folder and the id
   * survive, the version goes up (so every cached preview URL changes), and
   * the old bytes are deleted once the row points at the new ones.
   *
   * A cover that was already PUBLISHED from this picture does not change — it
   * is its own copy. Re-publishing is the instructor's decision.
   */
  async replace(id: string, file: UploadFile, actorUserId: string): Promise<DesignAsset> {
    assertId(id);
    const existing = await this.prisma.designAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const encoded = await this.gateAndEncode(file, existing.sizeBytes);
    const keys = await this.store(encoded);

    let asset: AssetRow;
    try {
      asset = await this.prisma.designAsset.update({
        where: { id, version: existing.version },
        data: {
          storageKey: keys.storageKey,
          previewKey: keys.previewKey,
          format: encoded.format,
          width: encoded.width,
          height: encoded.height,
          sizeBytes: encoded.master.byteLength,
          version: { increment: 1 },
          uploadedBy: actorUserId,
        },
      });
    } catch {
      // Deleted, or replaced by someone else in between — keep theirs.
      await this.removeBytes([keys.storageKey, keys.previewKey]);
      throw new ConflictException('this picture changed while uploading');
    }

    await this.audit.record({
      action: 'design:replace',
      resourceType: AUDIT_RESOURCES.designAsset,
      resourceId: id,
      outcome: 'success',
      metadata: { version: asset.version, format: encoded.format, outputBytes: encoded.master.byteLength },
    });
    await this.removeBytes([existing.storageKey, existing.previewKey]);

    return toAsset(asset, await this.uploaderNames([asset]));
  }

  async patchAsset(id: string, input: { name?: string; folderId?: string }): Promise<DesignAsset> {
    assertId(id);
    const existing = await this.prisma.designAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (input.folderId !== undefined) {
      assertId(input.folderId);
      const target = await this.prisma.designFolder.findUnique({
        where: { id: input.folderId },
        select: { id: true },
      });
      if (!target) throw new BadRequestException('folder not found');
    }

    const asset = await this.prisma.designAsset.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      },
    });
    await this.audit.record({
      action: 'design:update',
      resourceType: AUDIT_RESOURCES.designAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        name: input.name !== undefined ? { from: existing.name, to: input.name } : null,
        folder: input.folderId !== undefined ? { from: existing.folderId, to: input.folderId } : null,
      },
    });
    return toAsset(asset, await this.uploaderNames([asset]));
  }

  async deleteAsset(id: string): Promise<void> {
    assertId(id);
    const existing = await this.prisma.designAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.designAsset.delete({ where: { id } });
    await this.audit.record({
      action: 'design:delete',
      resourceType: AUDIT_RESOURCES.designAsset,
      resourceId: id,
      outcome: 'success',
      // The row is gone after this; the name is what the audit screen can show.
      metadata: { name: existing.name, folderId: existing.folderId },
    });
    await this.removeBytes([existing.storageKey, existing.previewKey]);
  }

  /**
   * «حطها غلاف» — a design becomes a library image the site serves.
   *
   * A NEW `media_assets` row with its own public key, cut to the shape it will
   * be shown at and capped at 2560px (see `encodePublished`). The caller stores
   * its `storageKey` wherever a cover goes — `lesson_videos.poster_key`,
   * `courses.cover_key` — exactly as if it had been uploaded, so every reader
   * downstream works unchanged.
   *
   * A copy, not a reference, on purpose: the designer may rename, replace or
   * delete the original tomorrow, and none of that may change what students
   * see on a lecture that is already live.
   */
  async publish(id: string, shape: DesignPublishShape, actorUserId: string): Promise<MediaAsset> {
    assertId(id);
    const design = await this.prisma.designAsset.findUnique({ where: { id } });
    if (!design) throw new NotFoundException();

    const master = await readAll(await this.storage.getStream(design.storageKey));
    const published = await withEncodeSlot(() => encodePublished(master, shape));

    const mediaId = randomUUID();
    const key = `${mediaId.slice(0, 2)}/${mediaId}.${OUTPUT_EXT}`;
    await this.storage.put(key, published.data, OUTPUT_MIME);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: mediaId,
        storageKey: key,
        filename: `${design.name}.${OUTPUT_EXT}`.slice(0, 200),
        mime: OUTPUT_MIME,
        sizeBytes: published.data.byteLength,
        width: published.width,
        height: published.height,
        uploadedBy: actorUserId,
      },
    });

    await this.audit.record({
      action: 'design:publish',
      resourceType: AUDIT_RESOURCES.designAsset,
      resourceId: id,
      outcome: 'success',
      metadata: { mediaAssetId: asset.id, shape, width: published.width, height: published.height },
    });

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

  // ── Internals ─────────────────────────────────────────────────────────

  /**
   * The gates, in order — each bypassable alone, which is why there are four:
   *   1. size cap and quota  — before any decoding work is spent
   *   2. extension allowlist — cheap, catches a wrong file early
   *   3. magic-byte sniff    — what the bytes ARE, not what they are called
   *   4. full re-encode      — `encodeDesign`; the real control
   * and the storage key is a fresh uuid, so the uploaded name never reaches
   * the disk. The Content-Type header is read nowhere.
   *
   * `freedBytes` is what a replace gives back, so replacing a picture when the
   * studio is full is still allowed.
   */
  private async gateAndEncode(file: UploadFile, freedBytes: number): Promise<EncodedDesign> {
    if (file.size > MAX_DESIGN_BYTES) throw new PayloadTooLargeException();

    const used = await this.prisma.designAsset.aggregate({ _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0) - freedBytes + file.size > DESIGN_QUOTA_BYTES) {
      throw new PayloadTooLargeException('design studio storage is full');
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(extension)) throw new BadRequestException('file extension is not allowed');

    const detected = await this.signature.detect(file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed image type');
    }

    return withEncodeSlot(() => encodeDesign(file.buffer, detected.mime));
  }

  private async store(encoded: EncodedDesign): Promise<{ storageKey: string; previewKey: string }> {
    const storageKey = mintKey(encoded.format);
    const previewKey = mintKey('webp');
    await this.storage.put(storageKey, encoded.master, MIME_FOR_FORMAT[encoded.format]);
    try {
      await this.storage.put(previewKey, encoded.preview, OUTPUT_MIME);
    } catch (error) {
      await this.removeBytes([storageKey]);
      throw error;
    }
    return { storageKey, previewKey };
  }

  /** Best effort: a file that will not delete is an orphan, not a failed request. */
  private async removeBytes(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storage.delete(key).catch(() => undefined)));
  }

  private async uploaderNames(rows: ReadonlyArray<{ uploadedBy: string | null }>): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.uploadedBy).filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  private toFolder(
    folder: FolderRow,
    totals: { _count: { _all: number }; _sum: { sizeBytes: number | null } } | undefined,
    cover: { id: string; version: number } | null,
  ): DesignFolder {
    return {
      id: folder.id,
      name: folder.name,
      color: (folder.color as DesignFolderColor) ?? 'amber',
      assetCount: totals?._count._all ?? 0,
      sizeBytes: totals?._sum.sizeBytes ?? 0,
      cover,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }
}
