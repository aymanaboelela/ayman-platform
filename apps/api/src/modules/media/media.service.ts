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
  type MediaUsage,
  type MediaUsageKind,
} from '@ayman/contracts/admin/media';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../audit/audit-context';
import { PrismaService } from '../../prisma/prisma.service';
import { FileSignatureService } from './file-signature.service';
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage';
import { AUDIT_RESOURCES, SITE_SETTINGS_ID } from '../admin/admin.constants';
import { decodeOriginalName } from './original-name';

const ALLOWED_MIME = new Set<string>(ALLOWED_UPLOAD_MIME);
const ALLOWED_EXT = new Set<string>(ALLOWED_UPLOAD_EXT);

/**
 * The accepted formats that can carry more than one frame, and therefore the
 * ones sharp must be told to open with `animated: true` — see the note at the
 * decode site.
 *
 * Typed against `ALLOWED_UPLOAD_MIME` so a member that is removed from the
 * contract stops compiling here instead of lingering as a dead string.
 */
const MULTI_FRAME_MIME = new Set<string>([
  'image/gif',
  'image/webp',
  'image/avif',
] satisfies readonly (typeof ALLOWED_UPLOAD_MIME)[number][]);

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * What `uploadPrivateImage` hands back — deliberately the same shape
 * `DocumentService.upload` returns minus `mime`, because a caller storing one
 * of these keeps the KEY and reads the mime back off its extension. Two
 * pipelines, one wire shape, so the endpoint that accepts either does not have
 * to branch on which ran.
 */
export interface UploadedPrivateImage {
  storageKey: string;
  filename: string;
  sizeBytes: number;
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
    /*
      `animated` names every container in ALLOWED_UPLOAD_MIME that can hold more
      than one frame, and AVIF is on that list.

      It was missing until 2026-08-13, and the failure was the silent kind: with
      `animated` false sharp opens page 0 and nothing else, so an animated AVIF
      was accepted, re-encoded and stored as a STILL. No error, no warning, no
      rejected upload — the instructor's animation simply arrived frozen, and
      the only way to notice was to look at it.

      Worth being precise about why this is the likelier cause of any real
      "my animation lost its animation" report than the `.rotate()` mechanism
      documented below: `.rotate()` turned out not to flatten anything (proved
      with a 4-frame fixture), whereas this genuinely did, for one of the five
      accepted formats.

      Derived from the constant rather than restated, so a sixth format cannot
      be added to the contract and silently miss this line. PNG can technically
      be animated (APNG); libvips does not decode APNG frames, so listing it
      would claim a capability that does not exist.
    */
    let pipeline = sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: MULTI_FRAME_MIME.has(detected.mime),
      failOn: 'error',
    });

    /*
     * `.rotate()` with no argument applies the EXIF orientation and then
     * discards the metadata. That is what a photo straight off a phone needs,
     * and it is why the call is here at all — but there is exactly one shape
     * of input it must NOT be applied to.
     *
     * libvips holds an animation as a single tall strip of frames. It can
     * mirror that strip and it can turn it through 180°, because both are the
     * same operation applied per frame; it cannot turn it through 90° or 270°,
     * because a quarter turn has nowhere to put the rows. sharp refuses rather
     * than guessing — `Rotate is not supported for multi-page images` — and
     * that throw lands in the catch below, so the uploader is told «file could
     * not be processed as an image» about a file that is a perfectly good
     * animation. Measured on sharp 0.35.3 / libvips 8.18.3 against a 4-frame
     * animated WebP: EXIF orientations 1–4 encode fine, 5–8 every one throws.
     * Those four are precisely the orientations that carry a quarter turn.
     *
     * The decision is therefore made on the FILE, not on its MIME. `animated`
     * above is a *request* to read every frame; whether there is more than one
     * is a property of the upload. Most WebP uploads are ordinary stills, they
     * do carry orientation tags, and keying this off `detected.mime` would
     * quietly stop correcting them. `metadata()` reads the header off the
     * instance the pipeline already holds, so the check costs a header parse
     * rather than a second decode.
     *
     * What is given up is the orientation correction on a multi-frame upload
     * — which no encoder that writes animated GIF emits in the first place,
     * GIF having no EXIF block to put it in.
     */
    const probe = await pipeline.metadata().catch(() => {
      throw new BadRequestException('file could not be processed as an image');
    });
    const isQuarterTurnOnAnimation = (probe.pages ?? 1) > 1 && (probe.orientation ?? 1) >= 5;
    if (!isQuarterTurnOnAnimation) {
      pipeline = pipeline.rotate();
    }

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
        /*
          `pageHeight`, not `height`, for anything animated.

          For a multi-frame encode sharp reports `height` as the whole FRAME
          STRIP — a 3-frame 40x30 animation comes back as 40x90 — while
          `pageHeight` is the height of one frame, which is what the image
          actually measures on screen. Persisting the strip height meant every
          consumer that builds an aspect-ratio box from these columns reserved
          three (or ten, or twenty) times too much vertical space for an
          animated asset and then collapsed it on decode. That is a layout
          shift generated by the database, and no amount of work in the web app
          could have corrected it without knowing the frame count.

          `pageHeight` is undefined for a single-page image, so the `??` keeps
          every still upload on exactly the value it stored before.

          ⚠️ Rows written before this fix still hold the strip height. Nothing
          here backfills them — that needs a decision about re-probing objects
          in storage — so an OLD animated asset is still wrong on screen.
        */
        height: info.pageHeight ?? info.height,
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
   * An image bound for a PRIVATE prefix — one the public serve route cannot
   * address — with no `media_assets` row behind it.
   *
   * ## The gates are identical; the destination is not
   *
   * `gateAndEncode` runs unchanged, so this is the same extension allowlist,
   * the same magic-byte sniff and the same sharp re-encode that strips EXIF
   * and destroys polyglots. What differs is where the bytes land and what is
   * remembered about them:
   *
   *   · `GET /media/:prefix/:name` binds exactly TWO path segments, so a
   *     three-segment key (`msg/ab/<uuid>.webp`) is structurally unreachable
   *     through it. That is the same trick `doc/` keys already use, and it is
   *     what lets a photograph sent into one student's conversation be gated
   *     rather than public-by-key the way a course cover deliberately is;
   *   · no row. `GET /admin/media` lists `media_assets`, and a term's worth of
   *     pictures sent to individual students buried in the screen he picks
   *     course covers from is a worse library for nobody's benefit. Documents
   *     already work this way.
   *
   * The caller owns what the bytes are FOR — this method knows only that they
   * are an image and where they went.
   */
  async uploadPrivateImage(file: UploadFile, prefix: string): Promise<UploadedPrivateImage> {
    const { data, extension, detectedMime } = await this.gateAndEncode(file, {
      maxBytes: MAX_UPLOAD_BYTES,
    });

    const id = randomUUID();
    const key = `${prefix}/${id.slice(0, 2)}/${id}.${OUTPUT_EXT}`;
    await this.storage.put(key, data, OUTPUT_MIME);

    await this.audit.record({
      action: 'media:upload',
      // No `media_assets` row exists to point at, so the id names the OBJECT.
      // `DocumentService` records its uploads the same way.
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        pipeline: 'private-image',
        prefix,
        declaredExtension: extension,
        detectedMime,
        storageKey: key,
        outputBytes: data.byteLength,
      },
    });

    return {
      storageKey: key,
      // Display only; it is never used to build a path.
      filename: decodeOriginalName(file.originalname).slice(0, 200),
      sizeBytes: data.byteLength,
    };
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
        // Frame height, not strip height — see the note on the same pair in
        // `upload()`. An animated avatar is stored square here only if this
        // reads `pageHeight`.
        height: info.pageHeight ?? info.height,
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
   * Where an asset is referenced from, computed rather than enforced.
   *
   * `media_assets` has no inbound foreign key in the whole schema: settings
   * hold asset ids inside `site_settings.data`, and home blocks hold them
   * inside `home_blocks.props`. Postgres cannot refuse a delete that would
   * break either, so the permanent-delete dialog asks this first and shows
   * the answer — «الصورة دي مستخدمة في أيقونة الموقع» is a different decision
   * from «مش مستخدمة في أي حاجة».
   *
   * Home blocks are scanned in the application rather than with a jsonb
   * containment query: the ids sit at three different depths (`imageAssetId`
   * on a hero, `avatarAssetId` inside a testimonials ARRAY), and one
   * stringified search finds all of them without a query per shape. The table
   * holds one row per section of one landing page — tens of rows, not
   * thousands.
   */
  async usage(id: string): Promise<MediaUsage> {
    const [settingsRow, blocks] = await Promise.all([
      this.prisma.siteSetting.findUnique({
        where: { id: SITE_SETTINGS_ID },
        select: { data: true },
      }),
      this.prisma.homeBlock.findMany({ where: { archivedAt: null }, select: { props: true } }),
    ]);

    const usedBy: MediaUsageKind[] = [];
    const settings = SiteSettingsSchema.parse(settingsRow?.data ?? {});

    if (settings.branding.logoLightAssetId === id) usedBy.push('brandingLogoLight');
    if (settings.branding.logoDarkAssetId === id) usedBy.push('brandingLogoDark');
    if (settings.branding.faviconAssetId === id) usedBy.push('brandingFavicon');
    if (settings.seo.ogImageAssetId === id) usedBy.push('seoOgImage');

    if (blocks.some((block) => JSON.stringify(block.props).includes(id))) {
      usedBy.push('homeBlock');
    }

    return { usedBy };
  }

  /**
   * PERMANENT delete: the row goes, and so do the bytes.
   *
   * Distinct from `archive` in the one way that matters — archive is
   * reversible and this is not. It exists because «مسح خالص» was a thing the
   * library could not do at all: an asset uploaded by mistake stayed in the
   * database forever, and «أرشفة» hid it from the grid while leaving both the
   * row and the file exactly where they were.
   *
   * ORDER: the row first, the bytes second, and deliberately not the reverse.
   * If the storage delete fails, the row is already gone and what is left
   * behind is an unreferenced file — invisible, harmless, reclaimable. The
   * reverse ordering fails the other way: bytes gone, row surviving, and every
   * surface that renders it showing a broken image with no way to tell why.
   *
   * The audit entry is written BEFORE either, because it is the only record
   * that will exist afterwards. Nothing about a hard delete is recoverable
   * from the table it deleted from.
   */
  async destroy(id: string): Promise<void> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    await this.audit.record({
      action: 'media:delete',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        storageKey: existing.storageKey,
        filename: existing.filename,
        sizeBytes: existing.sizeBytes,
        usedBy: (await this.usage(id)).usedBy,
      },
    });

    await this.prisma.mediaAsset.delete({ where: { id } });
    await this.storage.delete(existing.storageKey);
  }

  /**
   * Re-crop: new bytes for an asset that already exists, keeping its ID.
   *
   * Keeping the id is the entire point — every reference to this asset lives
   * in a jsonb blob as that id (branding slots, the OG image, home blocks), so
   * a re-crop lands on every surface at once with nothing to re-point.
   *
   * ## Why the storage KEY changes anyway
   *
   * `GET /media/:prefix/:name` serves `Cache-Control: public, max-age=31536000,
   * immutable`, and that promise is only honest if a URL's bytes never change.
   * Overwriting in place would leave Cloudflare's edge — and every browser
   * that has already fetched it — serving the OLD crop for up to a year, with
   * no way to purge from here. So the bytes go to a fresh key and the row is
   * re-pointed.
   *
   * ## The three columns that store a KEY rather than an id
   *
   * `courses.cover_key`, `news_posts.cover_key` and `lesson_videos.poster_key`
   * were written by `MediaKeyField`, which carries the storage key straight
   * into the form. Those are re-pointed in the SAME transaction as the asset
   * row: leaving them would mean a re-crop silently detaches every course
   * cover that happens to use this asset, and the instructor would find out by
   * seeing a broken cover, not an error.
   *
   * The old bytes are removed only after the transaction commits, for the same
   * reason `destroy` orders it that way.
   */
  async replaceBytes(id: string, file: UploadFile): Promise<MediaAsset> {
    const existing = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    const { data, info, extension, detectedMime } = await this.gateAndEncode(file, {
      maxBytes: MAX_UPLOAD_BYTES,
    });

    // A fresh uuid for the FILENAME half only; the prefix stays derived from
    // it, so the result still matches STORAGE_KEY_PATTERN exactly.
    const nextId = randomUUID();
    const nextKey = `${nextId.slice(0, 2)}/${nextId}.${OUTPUT_EXT}`;
    await this.storage.put(nextKey, data, OUTPUT_MIME);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mediaAsset.update({
        where: { id },
        data: {
          storageKey: nextKey,
          sizeBytes: data.byteLength,
          width: info.width,
          // Frame height, not strip height — see the note in `upload()`.
          height: info.pageHeight ?? info.height,
        },
      });

      const previous = existing.storageKey;
      await Promise.all([
        tx.course.updateMany({ where: { coverKey: previous }, data: { coverKey: nextKey } }),
        tx.newsPost.updateMany({ where: { coverKey: previous }, data: { coverKey: nextKey } }),
        tx.lessonVideo.updateMany({
          where: { posterKey: previous },
          data: { posterKey: nextKey },
        }),
      ]);

      return row;
    });

    await this.audit.record({
      action: 'media:replace',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        previousKey: existing.storageKey,
        storageKey: nextKey,
        declaredExtension: extension,
        detectedMime,
        outputBytes: data.byteLength,
      },
    });

    // Best-effort. A leftover object is invisible and reclaimable; a failure
    // here must not undo a commit that already landed.
    await this.storage.delete(existing.storageKey).catch(() => undefined);

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
