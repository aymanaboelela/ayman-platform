# Plan 8 — Lesson resources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`../specs/2026-08-02-learning-path-design.md`](../specs/2026-08-02-learning-path-design.md) §4.5, §5, §6, §7

**Goal:** Turn `lesson_attachments` — a bare file list — into `lesson_resources`, a
titled, described, typed material set (main presentation, tutorial video,
document, external link) that any lesson kind can carry, with an in-page PDF
viewer, a download route, and full admin CRUD.

**Architecture:** The table is *renamed and widened*, never dropped, so existing
rows and foreign keys survive. Legality per kind is a database CHECK, not a
service `if`. Documents get their own upload pipeline because the image
pipeline's strongest gate — a sharp re-encode — cannot exist for a PDF, and the
four compensating controls are written down rather than assumed. Both read
routes re-derive enrollment per request on our own origin, because
`GET /media/:prefix/:name` is `@Public()` and can never carry gated content.

**Tech Stack:** Prisma 7 / PostgreSQL 16, NestJS 11, Zod 4, Next.js 16, Vitest,
Jest + SWC.

## Global Constraints

Binding on every task. Copied from `docs/superpowers/plans/README.md`.

1. **Single origin.** `apps/web` serves `/`, `apps/api` serves `/api`. **Never configure CORS.**
2. **Ports:** web `3200`, api `3300`.
3. **RTL is native, not mirrored.** Logical Tailwind utilities only — `ayman/no-physical-direction` sees through `cn()`, template literals, ternaries and arrays.
4. **No user-facing string literals outside `packages/contracts`.** `app/(admin)/*` and `app/(site)/*` are not exempt.
5. **Extensionless relative imports.** Any `packages/contracts` leaf that `apps/api` imports **for its runtime value** needs an explicit subpath export.
6. **Every Prisma model gets `@@schema("app")`**, every enum gets `@@map` to a snake_case type name, and `prisma generate` does **not** run automatically after `migrate`.
7. **NestJS guards are the sole authorization authority.** Permissions are `resource:action` — two segments, one colon. Deny by default.
8. **Separate DTOs per role**, `whitelist: true` + `forbidNonWhitelisted: true`.
9. **Design:** no gradients, no glassmorphism, no emoji icons, radius ≤ 8px on cards, no shadows in dark mode, amber `--a-9` flat. **`--ok` green and `--err` red are reserved for quiz correctness** (the one sanctioned non-quiz `--err` is `FieldError`).

Plus: **never `$queryRawUnsafe` / `$executeRawUnsafe`**, and **commit after every task** with explicit `git add` paths.

**No new permission is introduced.** Resource writes are `lesson:write`, reorder is `lesson:reorder`, document upload is `media:write` — all three already exist in `apps/api/src/auth/permissions.ts`.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | `LessonResource` model, `LessonResourceKind` enum |
| `apps/api/prisma/migrations/20260802120000_lesson_resources/migration.sql` | Rename + widen + CHECKs + partial unique index |
| `packages/contracts/src/content.ts` | `LessonResourceInputSchema`, kind enum, per-kind coherence |
| `packages/contracts/src/admin/media.ts` | Document allowlists and size cap |
| `apps/api/src/modules/media/document.service.ts` | Document upload gates 1–4 |
| `apps/api/src/modules/media/media.controller.ts` | `POST /api/media/documents` |
| `apps/api/src/modules/content/lesson.service.ts` | Resource CRUD, replacing attachment CRUD |
| `apps/api/src/modules/content/lesson.controller.ts` | Admin resource routes |
| `apps/api/src/modules/content/dto/lesson.dto.ts` | `AddResourceDto`, `UpdateResourceDto` |
| `apps/api/src/modules/player/player.service.ts` | Resources on the lesson payload; `resourceFor()` |
| `apps/api/src/modules/player/player.controller.ts` | `/view` and `/download` |
| `packages/contracts/src/progress.ts` | `PlayerResourceSchema` replacing `PlayerAttachmentSchema` |
| `apps/web/proxy.ts` | `frame-src 'self'` |
| `apps/web/components/player/resource-list.tsx` | Student-facing resource list |
| `apps/web/components/player/document-viewer.tsx` | The iframe + download affordance |
| `apps/web/components/admin/lesson-resources.tsx` | Admin panel |
| `packages/contracts/src/copy/ar.ts` | `player.resources.*`, `admin.resource.*` |

---

## Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma:594-612` (the `LessonAttachment` model)
- Create: `apps/api/prisma/migrations/20260802120000_lesson_resources/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `LessonResource` with fields `id, lessonId, kind, title, description, storageKey, filename, mime, sizeBytes, videoProvider, videoExternalId, linkUrl, position, createdAt, updatedAt`; enum `LessonResourceKind = presentation | video | document | link` mapped to `lesson_resource_kind`. `Lesson.resources` back-relation replaces `Lesson.attachments`.

- [ ] **Step 1: Replace the `LessonAttachment` model in `schema.prisma`**

Delete the `LessonAttachment` model (lines 594–612) and put this in its place:

```prisma
/// The material set of a lesson: the deck it was taught from, tutorial videos,
/// documents, and links out. ANY lesson kind may carry these — a video lesson
/// with a presentation and three materials is the common case, which is why
/// there is no `assertKind` on the write path (Plan 8 Task 4).
///
/// Exactly one payload is legal per `kind`, enforced by four CHECK constraints
/// in the migration rather than by a service `if`: a resource that lies about
/// its own kind cannot exist even under a direct SQL write.
enum LessonResourceKind {
  /// The deck the lesson was taught from. At most ONE per lesson — a partial
  /// unique index, not application logic.
  presentation
  video
  document
  link

  @@map("lesson_resource_kind")
  @@schema("app")
}

model LessonResource {
  id          String             @id @default(uuid(7)) @db.Uuid
  lessonId    String             @map("lesson_id") @db.Uuid
  kind        LessonResourceKind
  title       String
  /// Plain text, never HTML — nothing here needs sanitizeRichText(), and not
  /// accepting HTML is cheaper than sanitising it.
  description String?
  position    Int                @default(0)

  // ── payload: file (presentation | document) ────────────────────────────
  /// The storage KEY, never a URL — same rule as media_assets (§6.7).
  storageKey String? @map("storage_key")
  filename   String?
  mime       String?
  sizeBytes  Int?    @map("size_bytes")

  // ── payload: video ─────────────────────────────────────────────────────
  /// The ELEVEN-CHARACTER provider id, never a URL. `extractYouTubeId`
  /// parses the URL and discards it, which is what eliminates the SSRF class.
  videoProvider   VideoProvider? @map("video_provider")
  videoExternalId String?        @map("video_external_id")

  // ── payload: link ──────────────────────────────────────────────────────
  /// `https:` only, enforced at the DTO and by a CHECK. Rendered as an anchor,
  /// never fetched server-side.
  linkUrl String? @map("link_url")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@index([lessonId, position])
  @@map("lesson_resources")
  @@schema("app")
}
```

- [ ] **Step 2: Repoint the `Lesson` back-relation**

In the `Lesson` model (`schema.prisma:545`), replace:

```prisma
  attachments  LessonAttachment[]
```

with:

```prisma
  resources    LessonResource[]
```

- [ ] **Step 3: Write the migration**

Create `apps/api/prisma/migrations/20260802120000_lesson_resources/migration.sql`:

```sql
-- Rename, never drop: the founder has already uploaded attachments, and the
-- foreign keys and indexes survive a rename for free.
ALTER TABLE "app"."lesson_attachments" RENAME TO "lesson_resources";
ALTER INDEX "app"."lesson_attachments_pkey" RENAME TO "lesson_resources_pkey";
ALTER INDEX "app"."lesson_attachments_lesson_id_position_idx"
  RENAME TO "lesson_resources_lesson_id_position_idx";

CREATE TYPE "app"."lesson_resource_kind" AS ENUM ('presentation', 'video', 'document', 'link');

-- Every existing row is an uploaded file with no title of its own, so the
-- filename becomes the title. That is a one-time backfill, not a fallback the
-- application keeps: `title` is NOT NULL from here on.
ALTER TABLE "app"."lesson_resources"
  ADD COLUMN "kind"              "app"."lesson_resource_kind",
  ADD COLUMN "title"             TEXT,
  ADD COLUMN "description"       TEXT,
  ADD COLUMN "video_provider"    "app"."VideoProvider",
  ADD COLUMN "video_external_id" TEXT,
  ADD COLUMN "link_url"          TEXT,
  ADD COLUMN "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "app"."lesson_resources" SET "kind" = 'document', "title" = "filename";

ALTER TABLE "app"."lesson_resources"
  ALTER COLUMN "kind"  SET NOT NULL,
  ALTER COLUMN "title" SET NOT NULL,
  ALTER COLUMN "storage_key" DROP NOT NULL,
  ALTER COLUMN "filename"    DROP NOT NULL,
  ALTER COLUMN "mime"        DROP NOT NULL,
  ALTER COLUMN "size_bytes"  DROP NOT NULL;

-- One CHECK per kind. Each names exactly which payload columns must be present
-- AND that the other two payloads are absent, so a row cannot carry a file and
-- a link at once by claiming to be a document.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_payload_matches_kind" CHECK (
    CASE "kind"
      WHEN 'presentation' THEN
        "storage_key" IS NOT NULL AND "filename" IS NOT NULL
        AND "mime" IS NOT NULL AND "size_bytes" IS NOT NULL
        AND "video_external_id" IS NULL AND "link_url" IS NULL
      WHEN 'document' THEN
        "storage_key" IS NOT NULL AND "filename" IS NOT NULL
        AND "mime" IS NOT NULL AND "size_bytes" IS NOT NULL
        AND "video_external_id" IS NULL AND "link_url" IS NULL
      WHEN 'video' THEN
        "video_provider" IS NOT NULL AND "video_external_id" IS NOT NULL
        AND "storage_key" IS NULL AND "link_url" IS NULL
      WHEN 'link' THEN
        "link_url" IS NOT NULL
        AND "storage_key" IS NULL AND "video_external_id" IS NULL
    END
  );

-- The 11-character rule, at the database, mirroring lesson_videos.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_video_id_is_11_chars" CHECK (
    "video_external_id" IS NULL OR "video_external_id" ~ '^[A-Za-z0-9_-]{11}$'
  );

-- https only, at the database. The DTO rejects it first; this is what holds
-- when someone writes SQL directly.
ALTER TABLE "app"."lesson_resources"
  ADD CONSTRAINT "lesson_resources_link_is_https" CHECK (
    "link_url" IS NULL OR "link_url" LIKE 'https://%'
  );

-- "The main presentation" is only meaningful if there is at most one.
CREATE UNIQUE INDEX "lesson_resources_one_presentation"
  ON "app"."lesson_resources" ("lesson_id") WHERE "kind" = 'presentation';
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `pnpm db:migrate` then `pnpm --filter @ayman/api exec prisma generate`
Expected: migration applies cleanly; `LessonResource` appears in `apps/api/src/generated/prisma`.

⚠️ Per Global Constraint 6, `generate` does **not** run automatically. Running
it is a separate command and skipping it leaves the client stale.

- [ ] **Step 5: Verify the CHECKs actually reject**

Run: `pnpm --filter @ayman/api exec prisma db execute --stdin` and paste:

```sql
INSERT INTO app.lesson_resources (id, lesson_id, kind, title, link_url, position)
SELECT gen_random_uuid(), id, 'link', 'bad', 'http://example.com', 0
FROM app.lessons LIMIT 1;
```

Expected: `ERROR: new row for relation "lesson_resources" violates check constraint "lesson_resources_link_is_https"`.
If it inserts, the CHECK is wrong — fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260802120000_lesson_resources apps/api/src/generated/prisma
git commit -m "feat(api): lesson attachments become typed, titled resources"
```

---

## Task 2: Contracts — resource input schema

**Files:**
- Modify: `packages/contracts/src/content.ts:128-135` (replace `LessonAttachmentInputSchema`)
- Modify: `packages/contracts/src/content.spec.ts`

**Interfaces:**
- Consumes: `VideoProviderSchema`, `extractYouTubeId` from `packages/contracts/src/video.ts`.
- Produces: `LessonResourceKindSchema`, `LessonResourceInputSchema` (input accepts `url` for videos, output carries `videoProvider`/`videoExternalId`), `LessonResourceUpdateSchema`, types `LessonResourceInput` and `LessonResourceUpdateInput`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/src/content.spec.ts`:

```ts
import { LessonResourceInputSchema } from './content';

describe('LessonResourceInputSchema', () => {
  const base = { title: 'المحاضرة الأولى', description: null, position: 0 };

  it('turns a video URL into an 11-character id and discards the URL', () => {
    const parsed = LessonResourceInputSchema.parse({
      ...base,
      kind: 'video',
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
    });
    expect(parsed).toMatchObject({
      kind: 'video',
      videoProvider: 'youtube',
      videoExternalId: 'dQw4w9WgXcQ',
    });
    expect(JSON.stringify(parsed)).not.toContain('youtube.com');
  });

  it('rejects a non-https link', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'link',
      linkUrl: 'http://example.com/notes',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a javascript: link', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'link',
      // eslint-disable-next-line no-script-url
      linkUrl: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a document with no file', () => {
    const result = LessonResourceInputSchema.safeParse({ ...base, kind: 'document' });
    expect(result.success).toBe(false);
  });

  it('rejects a document that also carries a link', () => {
    const result = LessonResourceInputSchema.safeParse({
      ...base,
      kind: 'document',
      storageKey: 'doc/ab/x.pdf',
      filename: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: 1024,
      linkUrl: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a presentation', () => {
    const parsed = LessonResourceInputSchema.parse({
      ...base,
      kind: 'presentation',
      storageKey: 'doc/ab/x.pdf',
      filename: 'lecture-1.pdf',
      mime: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(parsed).toMatchObject({ kind: 'presentation', storageKey: 'doc/ab/x.pdf' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @ayman/contracts test -- content.spec`
Expected: FAIL — `LessonResourceInputSchema` is not exported.

- [ ] **Step 3: Implement the schema**

In `packages/contracts/src/content.ts`, replace `LessonAttachmentInputSchema`
(lines 128–135) with:

```ts
export const LessonResourceKindSchema = z.enum([
  'presentation',
  'video',
  'document',
  'link',
]);
export type LessonResourceKind = z.infer<typeof LessonResourceKindSchema>;

/** 200 MiB — a lecture deck with embedded imagery, not a video file. */
export const MAX_RESOURCE_BYTES = 200 * 1024 * 1024;

/**
 * One flat object with a `kind`-driven transform, NOT a discriminated union:
 * the video branch has to run `extractYouTubeId`, and a branch carrying a
 * `.transform()` is no longer a plain object schema, which is what
 * `z.discriminatedUnion` requires. This mirrors `LessonVideoInputSchema`,
 * which solves the same problem the same way.
 *
 * The transform is also what enforces mutual exclusion: it returns only the
 * columns legal for the declared kind, so a payload smuggling a `linkUrl` onto
 * a document cannot reach the service even before the CHECK sees it.
 */
export const LessonResourceInputSchema = z
  .object({
    kind: LessonResourceKindSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().default(null),
    // file payload
    storageKey: z.string().min(1).max(255).optional(),
    filename: z.string().min(1).max(255).optional(),
    mime: z.string().min(3).max(127).optional(),
    sizeBytes: z.number().int().positive().max(MAX_RESOURCE_BYTES).optional(),
    // video payload — a URL on the way in, an id on the way out
    provider: VideoProviderSchema.optional(),
    url: z.string().min(1).max(2048).optional(),
    // link payload
    linkUrl: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .transform((value, ctx) => {
    const common = {
      kind: value.kind,
      title: value.title,
      description: value.description,
    };

    if (value.kind === 'presentation' || value.kind === 'document') {
      if (
        value.storageKey === undefined ||
        value.filename === undefined ||
        value.mime === undefined ||
        value.sizeBytes === undefined
      ) {
        ctx.addIssue({ code: 'custom', message: 'لازم ترفع الملف الأول', path: ['storageKey'] });
        return z.NEVER;
      }
      if (value.linkUrl !== undefined || value.url !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'الملف مايجيش معاه رابط', path: ['kind'] });
        return z.NEVER;
      }
      return {
        ...common,
        storageKey: value.storageKey,
        filename: value.filename,
        mime: value.mime,
        sizeBytes: value.sizeBytes,
        videoProvider: null,
        videoExternalId: null,
        linkUrl: null,
      };
    }

    if (value.kind === 'video') {
      if (value.provider !== 'youtube') {
        ctx.addIssue({
          code: 'custom',
          message: 'النسخة الحالية بتدعم فيديوهات يوتيوب بس',
          path: ['provider'],
        });
        return z.NEVER;
      }
      const videoExternalId = value.url === undefined ? null : extractYouTubeId(value.url);
      if (videoExternalId === null) {
        ctx.addIssue({ code: 'custom', message: 'رابط يوتيوب غير صالح', path: ['url'] });
        return z.NEVER;
      }
      return {
        ...common,
        storageKey: null,
        filename: null,
        mime: null,
        sizeBytes: null,
        videoProvider: 'youtube' as const,
        videoExternalId,
        linkUrl: null,
      };
    }

    // kind === 'link'
    if (value.linkUrl === undefined || !value.linkUrl.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', message: 'الرابط لازم يبدأ بـ https', path: ['linkUrl'] });
      return z.NEVER;
    }
    return {
      ...common,
      storageKey: null,
      filename: null,
      mime: null,
      sizeBytes: null,
      videoProvider: null,
      videoExternalId: null,
      linkUrl: value.linkUrl,
    };
  });

/** Title and description only. Changing a resource's KIND means deleting it and
 *  adding the right one — a PATCH that turned a link into a file would have to
 *  null three columns and populate four, which is a create wearing a costume. */
export const LessonResourceUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type LessonResourceInput = z.infer<typeof LessonResourceInputSchema>;
export type LessonResourceUpdateInput = z.infer<typeof LessonResourceUpdateSchema>;
```

- [ ] **Step 4: Add the `extractYouTubeId` import**

At the top of `packages/contracts/src/content.ts`, add:

```ts
import { extractYouTubeId, VideoProviderSchema } from './video';
```

- [ ] **Step 5: Delete the old type export**

Remove line 161 of `content.ts`:

```ts
export type LessonAttachmentInput = z.infer<typeof LessonAttachmentInputSchema>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @ayman/contracts test -- content.spec`
Expected: PASS — all six cases.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/content.ts packages/contracts/src/content.spec.ts
git commit -m "feat(contracts): typed lesson resource input, https-only links"
```

---

## Task 3: Document upload pipeline

**Files:**
- Modify: `packages/contracts/src/admin/media.ts`
- Create: `apps/api/src/modules/media/document.service.ts`
- Create: `apps/api/src/modules/media/document.service.spec.ts`
- Modify: `apps/api/src/modules/media/media.module.ts`
- Modify: `apps/api/src/modules/media/media.controller.ts`

**Interfaces:**
- Consumes: `FileSignatureService.detect(buffer)`, `MEDIA_STORAGE`/`MediaStorage`, `AuditService.record`, `currentActor()`.
- Produces: `DocumentService.upload(file: UploadFile): Promise<UploadedDocument>` where `UploadedDocument = { storageKey: string; filename: string; mime: string; sizeBytes: number }`. Route `POST /api/media/documents`.

- [ ] **Step 1: Add the document allowlists to contracts**

Append to `packages/contracts/src/admin/media.ts`:

```ts
/**
 * Documents are NOT images and do not share the image pipeline. Gate 3 of that
 * pipeline is a sharp re-encode to WebP — the step that destroys polyglots and
 * strips EXIF — and it cannot exist for a PDF. See the spec §4.5 for the four
 * controls that compensate.
 */
export const ALLOWED_DOCUMENT_EXT = ['pdf', 'pptx', 'docx', 'xlsx'] as const;

export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/** 200 MiB. A deck with embedded imagery, not a video file. */
export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/modules/media/document.service.spec.ts`:

```ts
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { DocumentService } from './document.service';

const PDF_BYTES = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');

function makeService(detected: { mime: string } | null) {
  const storage = { put: jest.fn(), getStream: jest.fn(), stat: jest.fn(), delete: jest.fn() };
  const audit = { record: jest.fn() };
  const signature = { detect: jest.fn().mockResolvedValue(detected) };
  const service = new DocumentService(
    audit as never,
    signature as never,
    storage as never,
  );
  return { service, storage, audit, signature };
}

describe('DocumentService.upload', () => {
  it('rejects a disallowed extension before reading the buffer', async () => {
    const { service, signature } = makeService({ mime: 'application/pdf' });
    await expect(
      service.upload({ originalname: 'notes.exe', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('rejects when the magic bytes disagree with the extension', async () => {
    const { service } = makeService({ mime: 'image/png' });
    await expect(
      service.upload({ originalname: 'notes.pdf', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a file with no detectable signature', async () => {
    const { service } = makeService(null);
    await expect(
      service.upload({ originalname: 'notes.pdf', buffer: PDF_BYTES, size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a file over the size cap before anything else', async () => {
    const { service, signature } = makeService({ mime: 'application/pdf' });
    await expect(
      service.upload({
        originalname: 'huge.pdf',
        buffer: PDF_BYTES,
        size: MAX_DOCUMENT_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(signature.detect).not.toHaveBeenCalled();
  });

  it('stores under a UUID key that does not contain the original filename', async () => {
    const { service, storage } = makeService({ mime: 'application/pdf' });
    const result = await service.upload({
      originalname: 'الملخص النهائي.pdf',
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });

    expect(result.storageKey).toMatch(/^doc\/[0-9a-f]{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(result.storageKey).not.toContain('الملخص');
    expect(result.mime).toBe('application/pdf');
    expect(storage.put).toHaveBeenCalledWith(result.storageKey, PDF_BYTES, 'application/pdf');
  });

  it('keeps the original filename for DISPLAY only', async () => {
    const { service } = makeService({ mime: 'application/pdf' });
    const result = await service.upload({
      originalname: 'lecture.pdf',
      buffer: PDF_BYTES,
      size: PDF_BYTES.byteLength,
    });
    expect(result.filename).toBe('lecture.pdf');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @ayman/api test -- document.service`
Expected: FAIL — cannot find module `./document.service`.

- [ ] **Step 4: Implement `DocumentService`**

Create `apps/api/src/modules/media/document.service.ts`:

```ts
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

const ALLOWED_EXT = new Set<string>(ALLOWED_DOCUMENT_EXT);
const ALLOWED_MIME = new Set<string>(ALLOWED_DOCUMENT_MIME);

/** Extension chosen by US from the DETECTED mime — never echoed from the upload. */
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
 * The image pipeline's four gates are: extension allowlist, magic-byte sniff,
 * **sharp re-encode**, UUID key. Gate 3 is the one that does the real work —
 * and it cannot exist here, because re-encoding is not a thing you can do to a
 * PDF. Rather than pretend, this service states the gap and compensates:
 *
 *   · upload is `media:write` — admin-only, and audit-logged;
 *   · the served Content-Type is derived from OUR detection, never the upload;
 *   · the serve route sets `default-src 'none'; sandbox` + `nosniff`;
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

  async upload(file: UploadFile): Promise<UploadedDocument> {
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new PayloadTooLargeException();
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXT.has(extension)) {
      throw new BadRequestException('file extension is not allowed');
    }

    const detected = await this.signature.detect(file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      throw new BadRequestException('file contents are not an allowed document type');
    }

    const id = randomUUID();
    const key = `doc/${id.slice(0, 2)}/${id}.${EXT_FOR_MIME[detected.mime]}`;
    await this.storage.put(key, file.buffer, detected.mime);

    await this.audit.record({
      action: 'media:upload',
      resourceType: AUDIT_RESOURCES.mediaAsset,
      resourceId: id,
      outcome: 'success',
      metadata: {
        declaredExtension: extension,
        detectedMime: detected.mime,
        outputBytes: file.buffer.byteLength,
        pipeline: 'document',
      },
    });

    return {
      storageKey: key,
      // Display only. It is never used to build a path.
      filename: file.originalname.slice(0, 200),
      mime: detected.mime,
      sizeBytes: file.buffer.byteLength,
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @ayman/api test -- document.service`
Expected: PASS — five cases.

- [ ] **Step 6: Register the provider and add the route**

In `apps/api/src/modules/media/media.module.ts`, add `DocumentService` to both
`providers` and `exports`.

In `apps/api/src/modules/media/media.controller.ts`, inject it and add:

```ts
  /**
   * Separate from `POST /media` because documents take a different pipeline —
   * see DocumentService. Same permission, same size discipline, no sharp.
   */
  @RequirePermission('media:write')
  @Post('media/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  async uploadDocument(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.documents.upload(file);
  }
```

with `MAX_DOCUMENT_BYTES` added to the existing `@ayman/contracts/admin/media`
import and `private readonly documents: DocumentService` added to the constructor.

- [ ] **Step 7: Verify the whole API suite still passes**

Run: `pnpm --filter @ayman/api test`
Expected: PASS, suite count up by one.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/admin/media.ts apps/api/src/modules/media
git commit -m "feat(api): document upload pipeline, stated gap where the re-encode was"
```

---

## Task 4: Admin resource CRUD

**Files:**
- Modify: `apps/api/src/modules/content/lesson.service.ts:158-192` (replace `addAttachment`/`removeAttachment`)
- Modify: `apps/api/src/modules/content/dto/lesson.dto.ts`
- Modify: `apps/api/src/modules/content/lesson.controller.ts:69-79`
- Modify: `apps/api/src/modules/content/lesson.service.spec.ts`

**Interfaces:**
- Consumes: `LessonResourceInput`, `LessonResourceUpdateInput` from Task 2; `buildReorderSql` from `./reorder.sql`.
- Produces: `LessonService.addResource(lessonId, input)`, `.updateResource(id, input)`, `.removeResource(id)`, `.reorderResources(lessonId, orderedIds)`. Routes `POST /api/admin/lessons/:id/resources`, `PATCH /api/admin/resources/:id`, `DELETE /api/admin/resources/:id`, `PATCH /api/admin/lessons/:id/resources/order`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/modules/content/lesson.service.spec.ts`:

```ts
describe('LessonService resources', () => {
  it('adds a resource to a VIDEO lesson — resources are not kind-gated', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ id: 'l1', kind: 'video' });
    prisma.lessonResource.findFirst.mockResolvedValue(null);
    prisma.lessonResource.create.mockResolvedValue({ id: 'r1' });

    await service.addResource('l1', {
      kind: 'presentation',
      title: 'المحاضرة',
      description: null,
      storageKey: 'doc/ab/x.pdf',
      filename: 'x.pdf',
      mime: 'application/pdf',
      sizeBytes: 1024,
      videoProvider: null,
      videoExternalId: null,
      linkUrl: null,
    });

    expect(prisma.lessonResource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lessonId: 'l1', position: 0 }) }),
    );
  });

  it('appends after the last existing position', async () => {
    prisma.lesson.findUnique.mockResolvedValue({ id: 'l1', kind: 'text' });
    prisma.lessonResource.findFirst.mockResolvedValue({ position: 4 });
    prisma.lessonResource.create.mockResolvedValue({ id: 'r2' });

    await service.addResource('l1', {
      kind: 'link',
      title: 'مرجع',
      description: null,
      storageKey: null,
      filename: null,
      mime: null,
      sizeBytes: null,
      videoProvider: null,
      videoExternalId: null,
      linkUrl: 'https://example.com',
    });

    expect(prisma.lessonResource.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 5 }) }),
    );
  });

  it('404s when the lesson does not exist', async () => {
    prisma.lesson.findUnique.mockResolvedValue(null);
    await expect(
      service.addResource('nope', {
        kind: 'link',
        title: 'x',
        description: null,
        storageKey: null,
        filename: null,
        mime: null,
        sizeBytes: null,
        videoProvider: null,
        videoExternalId: null,
        linkUrl: 'https://example.com',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
```

Extend the existing `prisma` mock object in that file with a `lessonResource`
delegate: `{ findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @ayman/api test -- lesson.service`
Expected: FAIL — `service.addResource is not a function`.

- [ ] **Step 3: Replace the attachment methods**

In `apps/api/src/modules/content/lesson.service.ts`, delete `addAttachment`
(158–175) and `removeAttachment` (177–192) and put this in their place:

```ts
  /**
   * ⚠️ Deliberately NOT `assertKind`-gated, unlike `setVideo` and `setText`.
   * Resources are not a lesson body — they are the material set that hangs off
   * any lesson, and the common case is precisely a VIDEO lesson carrying a
   * presentation and three materials. The old `addAttachment` required
   * `kind === 'attachment'`, which is why materials could not be attached to
   * the lessons that most needed them.
   */
  async addResource(lessonId: string, input: LessonResourceInput) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();

    const last = await this.prisma.lessonResource.findFirst({
      where: { lessonId },
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
    });

    const resource = await this.prisma.lessonResource.create({
      data: {
        lessonId,
        kind: input.kind,
        title: input.title,
        description: input.description,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        videoProvider: input.videoProvider,
        videoExternalId: input.videoExternalId,
        linkUrl: input.linkUrl,
        position: last === null ? 0 : last.position + 1,
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: { operation: 'addResource', resourceId: resource.id, kind: input.kind },
    });

    return resource;
  }

  /** Title and description only — see LessonResourceUpdateSchema for why. */
  async updateResource(id: string, input: LessonResourceUpdateInput) {
    const existing = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!existing) throw new NotFoundException();

    const updated = await this.prisma.lessonResource.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: existing.lessonId,
      outcome: 'success',
      metadata: { operation: 'updateResource', resourceId: id, changed: Object.keys(input) },
    });

    return updated;
  }

  async removeResource(id: string): Promise<{ id: string }> {
    const resource = await this.prisma.lessonResource.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!resource) throw new NotFoundException();

    await this.prisma.lessonResource.delete({ where: { id } });
    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: resource.lessonId,
      outcome: 'success',
      metadata: { operation: 'removeResource', resourceId: id },
    });
    return { id };
  }

  /**
   * Same contract as `reorder` above: the FULL ordered array, and the server
   * verifies the submitted set is exactly this lesson's current set before it
   * rewrites anything. The set check is what stops an array carrying one id
   * from another lesson from revealing, through the row count, that it exists.
   */
  async reorderResources(lessonId: string, orderedIds: string[]): Promise<{ updated: number }> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.lessonResource.findMany({
        where: { lessonId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((row) => row.id));

      if (orderedIds.length !== currentIds.size) {
        throw new BadRequestException('the ordered array must contain every resource of the lesson');
      }
      for (const id of orderedIds) {
        if (!currentIds.has(id)) {
          throw new BadRequestException('the ordered array contains an id from another lesson');
        }
      }

      const updated = await tx.$executeRaw(
        buildReorderSql('lesson_resources', 'lesson_id', lessonId, orderedIds),
      );
      if (updated !== orderedIds.length) {
        throw new BadRequestException('reorder touched an unexpected number of rows');
      }

      await this.audit.record({
        action: 'lesson:reorder',
        resourceType: AUDIT_RESOURCES.lesson,
        resourceId: lessonId,
        outcome: 'success',
        metadata: { operation: 'reorderResources', orderedIds },
      });

      return { updated };
    });
  }
```

Update the type import at the top of the file: replace `LessonAttachmentInput`
with `LessonResourceInput, LessonResourceUpdateInput`.

- [ ] **Step 4: Extend `buildReorderSql`'s whitelist**

Identifiers cannot be parameterised in Postgres, so `reorder.sql.ts` constrains
table and column names to a closed set — that whitelist *is* the SQL-injection
control (A3). Extending it means four edits in
`apps/api/src/modules/content/reorder.sql.ts`, and its own doc comment says
whoever extends it appends rather than interpolating:

```ts
type ReorderTable = 'lessons' | 'course_sections' | 'quiz_slots' | 'lesson_resources';
type ScopeColumn = 'section_id' | 'course_id' | 'quiz_id' | 'lesson_id';

const TABLE_SQL: Record<ReorderTable, Prisma.Sql> = {
  lessons: Prisma.sql`"app"."lessons"`,
  course_sections: Prisma.sql`"app"."course_sections"`,
  quiz_slots: Prisma.sql`"app"."quiz_slots"`,
  lesson_resources: Prisma.sql`"app"."lesson_resources"`,
};

const SCOPE_SQL: Record<ScopeColumn, Prisma.Sql> = {
  section_id: Prisma.sql`"section_id"`,
  course_id: Prisma.sql`"course_id"`,
  quiz_id: Prisma.sql`"quiz_id"`,
  lesson_id: Prisma.sql`"lesson_id"`,
};

const TABLES_WITH_UPDATED_AT: ReadonlySet<ReorderTable> = new Set([
  'lessons',
  'course_sections',
  'lesson_resources',
]);
```

`lesson_resources` belongs in `TABLES_WITH_UPDATED_AT` because Task 1 gives it
an `updated_at` column; omitting it would leave the column stale after a drag
while every other write path maintains it.

⚠️ Note what is **not** needed: `lesson_resources` has no unique constraint on
`(lesson_id, position)` — the original `lesson_attachments` deliberately omitted
one, tolerating duplicate positions with `(position, id)` as the order. That is
why this table needs no DEFERRABLE constraint the way `lessons` and
`course_sections` do: the intermediate duplicate positions inside the single
`UPDATE ... FROM (VALUES ...)` are legal because nothing forbids them at any
point. Do not "fix" this by adding a unique index.

- [ ] **Step 5: Replace the DTOs**

In `apps/api/src/modules/content/dto/lesson.dto.ts`, replace the
`AddAttachmentDto` line with:

```ts
export class AddResourceDto extends createZodDto(LessonResourceInputSchema) {}
export class UpdateResourceDto extends createZodDto(LessonResourceUpdateSchema) {}
```

and update the import from `@ayman/contracts/content` accordingly.

- [ ] **Step 6: Replace the routes**

In `apps/api/src/modules/content/lesson.controller.ts`, replace the two
attachment routes (69–79) with:

```ts
  /**
   * ⚠️ Declared BEFORE `lessons/:id/resources` — Nest matches in declaration
   * order, and `order` would otherwise be captured as a resource id.
   */
  @RequirePermission('lesson:reorder')
  @Patch('lessons/:id/resources/order')
  reorderResources(@Param('id') id: string, @Body() body: ReorderDto) {
    return this.lessons.reorderResources(id, body.orderedIds);
  }

  @RequirePermission('lesson:write')
  @Post('lessons/:id/resources')
  addResource(@Param('id') id: string, @Body() body: AddResourceDto) {
    return this.lessons.addResource(id, body);
  }

  @RequirePermission('lesson:write')
  @Patch('resources/:id')
  updateResource(@Param('id') id: string, @Body() body: UpdateResourceDto) {
    return this.lessons.updateResource(id, body);
  }

  @RequirePermission('lesson:write')
  @Delete('resources/:id')
  removeResource(@Param('id') id: string) {
    return this.lessons.removeResource(id);
  }
```

and update the DTO import list.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @ayman/api test -- lesson.service`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/content
git commit -m "feat(api): resource CRUD, no longer gated on lesson kind"
```

---

## Task 5: Player payload and the two read routes

**Files:**
- Modify: `packages/contracts/src/progress.ts:199-291`
- Modify: `apps/api/src/modules/player/player.service.ts:155-158,213-221,262-274`
- Modify: `apps/api/src/modules/player/player.controller.ts`

**Interfaces:**
- Consumes: `LessonAccessService.require(userId, lessonId)` → `LessonAccessContext`; `MediaStorage.getStream`, `.stat`.
- Produces: `PlayerResourceSchema` / `PlayerResource` with `{ id, kind, title, description, filename, mime, sizeBytes, youtubeId, linkUrl, viewPath, downloadPath }`; `LessonPlayer.resources` replacing `.attachments`; `PlayerService.resourceStream(userId, lessonId, resourceId)` → `{ stream, mime, filename, size }`. Routes `GET /api/lessons/:lessonId/resources/:id/view` and `.../download`.

- [ ] **Step 1: Replace the contract**

In `packages/contracts/src/progress.ts`, replace `PlayerAttachmentSchema`
(line 199) with:

```ts
export const PlayerResourceSchema = z.object({
  id: z.string(),
  kind: LessonResourceKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  /** File resources only — null for video and link. */
  filename: z.string().nullable(),
  mime: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  /** Video resources only. The 11-char id; the embed URL is rebuilt client-side. */
  youtubeId: z.string().nullable(),
  /** Link resources only. Always https. */
  linkUrl: z.string().nullable(),
  /**
   * Same-origin paths that re-check enrollment server-side before streaming a
   * byte — never the storage URL. Null for video and link resources, which
   * have no bytes of ours to serve.
   */
  viewPath: z.string().nullable(),
  downloadPath: z.string().nullable(),
});

export type PlayerResource = z.infer<typeof PlayerResourceSchema>;
```

Change line 236 from `attachments: z.array(PlayerAttachmentSchema),` to
`resources: z.array(PlayerResourceSchema),`, delete the old
`export type PlayerAttachment` on line 291, and import
`LessonResourceKindSchema` from `./content`.

- [ ] **Step 2: Write the failing test for the ownership re-check**

Create `apps/api/src/modules/player/resource-access.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

describe('PlayerService.resourceStream', () => {
  const access = { require: jest.fn() };
  const prisma = { lessonResource: { findFirst: jest.fn() } };
  const storage = { getStream: jest.fn(), stat: jest.fn() };
  const media = { resolve: jest.fn() };
  const service = new PlayerService(
    prisma as never,
    access as never,
    media as never,
    storage as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('goes through the access gate BEFORE touching storage', async () => {
    access.require.mockRejectedValue(new NotFoundException());
    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('404s a resource id belonging to another lesson', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue(null);
    await expect(service.resourceStream('u1', 'l1', 'r-other')).rejects.toThrow(NotFoundException);
    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('404s a video resource — it has no bytes of ours to stream', async () => {
    access.require.mockResolvedValue({ lessonId: 'l1' });
    prisma.lessonResource.findFirst.mockResolvedValue({
      kind: 'video',
      storageKey: null,
      mime: null,
      filename: null,
    });
    await expect(service.resourceStream('u1', 'l1', 'r1')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @ayman/api test -- resource-access`
Expected: FAIL — `service.resourceStream is not a function`.

- [ ] **Step 4: Update the player service**

In `apps/api/src/modules/player/player.service.ts`:

Change the `attachments` select (155–158) to:

```ts
          resources: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              kind: true,
              title: true,
              description: true,
              filename: true,
              mime: true,
              sizeBytes: true,
              videoExternalId: true,
              linkUrl: true,
            },
          },
```

Replace the `attachments` mapping (213–221) with:

```ts
      resources: lesson.resources.map((resource) => {
        const isFile = resource.kind === 'presentation' || resource.kind === 'document';
        return {
          id: resource.id,
          kind: resource.kind,
          title: resource.title,
          description: resource.description,
          filename: resource.filename,
          mime: resource.mime,
          sizeBytes: resource.sizeBytes,
          youtubeId: resource.videoExternalId,
          linkUrl: resource.linkUrl,
          // Never the storage URL. `/media/*` is @Public() — anything gated on
          // enrollment has to come back through a route that re-checks it.
          viewPath: isFile ? `/api/lessons/${lesson.id}/resources/${resource.id}/view` : null,
          downloadPath: isFile
            ? `/api/lessons/${lesson.id}/resources/${resource.id}/download`
            : null,
        };
      }),
```

Replace `attachmentUrl` (262–274) with:

```ts
  /**
   * Streams a file resource to a caller who is actually enrolled. The gate runs
   * FIRST and the storage read only happens after it returns — which is why the
   * test asserts `getStream` was never called on the rejecting path.
   *
   * Video and link resources have no bytes of ours and 404 here rather than
   * redirecting: a redirect to a third-party URL from an authenticated route is
   * an open redirect wearing a download button.
   */
  async resourceStream(
    userId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<{ stream: Readable; mime: string; filename: string; size: number }> {
    const context = await this.access.require(userId, lessonId);

    const resource = await this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId: context.lessonId },
      select: { kind: true, storageKey: true, mime: true, filename: true },
    });
    if (
      !resource ||
      resource.storageKey === null ||
      resource.mime === null ||
      resource.filename === null
    ) {
      throw new NotFoundException('resource not found');
    }

    const info = await this.storage.stat(resource.storageKey);
    if (!info) throw new NotFoundException('resource not found');

    return {
      stream: await this.storage.getStream(resource.storageKey),
      mime: resource.mime,
      filename: resource.filename,
      size: info.size,
    };
  }
```

Add to the constructor: `@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,`
and import `Inject` from `@nestjs/common`, `MEDIA_STORAGE`/`MediaStorage` from
`../media/storage/media-storage`, and `Readable` from `node:stream`.

Add `MediaModule` to the `imports` of `apps/api/src/modules/player/player.module.ts`.

- [ ] **Step 5: Add the two routes**

Replace the attachment route in `apps/api/src/modules/player/player.controller.ts`
with:

```ts
  /**
   * `inline` so the browser's own PDF viewer renders it in the iframe;
   * `attachment` so the same bytes download. Identical authorization, identical
   * headers, one differing word — which is why they share `serveResource`.
   *
   * The response's own `sandbox` CSP is what makes framing this on our origin
   * safe: the document lands in a unique opaque origin with no script
   * execution, regardless of what the file claims to be. Same header set
   * MediaController.serve already applies.
   */
  private async serveResource(
    userId: string,
    lessonId: string,
    resourceId: string,
    disposition: 'inline' | 'attachment',
    response: Response,
  ): Promise<void> {
    const file = await this.player.resourceStream(userId, lessonId, resourceId);

    response.set({
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      // RFC 5987 — the filename is Arabic more often than not, and a raw
      // non-ASCII byte in a header is a malformed response, not a filename.
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });

    file.stream.pipe(response);
  }

  @Get('lessons/:lessonId/resources/:resourceId/view')
  view(
    @CurrentUser() user: SessionUser,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.serveResource(user.id, lessonId, resourceId, 'inline', response);
  }

  @Get('lessons/:lessonId/resources/:resourceId/download')
  download(
    @CurrentUser() user: SessionUser,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
    @Res() response: Response,
  ): Promise<void> {
    return this.serveResource(user.id, lessonId, resourceId, 'attachment', response);
  }
```

Import `Get`, `Param`, `Res` from `@nestjs/common` and `Response` from `express`
as needed. **Do not** add `@Public()` — these are session-gated by the default-deny guard.

`Cache-Control: private, no-store` is deliberate: a shared-machine browser cache
holding an enrollment-gated deck outlives the session that was allowed to read it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @ayman/api test -- resource-access`
Expected: PASS — three cases.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/progress.ts apps/api/src/modules/player
git commit -m "feat(api): stream lesson resources through the enrollment gate"
```

---

## Task 6: CSP and copy

**Files:**
- Modify: `apps/web/proxy.ts:184`
- Modify: `apps/web/proxy.test.ts`
- Modify: `packages/contracts/src/copy/ar.ts:452-474`

**Interfaces:**
- Produces: `copy.player.resources`, `copy.player.mainPresentation`, `copy.player.openInNewTab`, `copy.player.viewerUnavailable`, `copy.admin.resource.*`.

- [ ] **Step 1: Write the failing CSP test**

Add to `apps/web/proxy.test.ts`:

```ts
it("allows framing our own origin so the document viewer works", () => {
  const csp = buildCsp(false);
  expect(csp).toContain("frame-src 'self' https://www.youtube-nocookie.com");
});

it('still refuses to be framed by anyone', () => {
  expect(buildCsp(false)).toContain("frame-ancestors 'none'");
});
```

(Use whatever the file already imports to build the policy string — match the
existing tests in that file rather than inventing a new helper name.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @ayman/web test -- proxy`
Expected: FAIL — `frame-src` is currently `https://www.youtube-nocookie.com` alone.

- [ ] **Step 3: Widen `frame-src` by exactly `'self'`**

In `apps/web/proxy.ts` line 184, change:

```ts
    'frame-src https://www.youtube-nocookie.com',
```

to:

```ts
    // `'self'` is the document viewer: /api/lessons/../resources/../view is on
    // our origin because the media origin is @Public() and cannot carry gated
    // content. Each such response ships its own `default-src 'none'; sandbox`,
    // so this widens WHO may be framed, not what a framed document may do.
    // `frame-ancestors 'none'` below is untouched — we still frame nobody's
    // pages and nobody frames ours.
    "frame-src 'self' https://www.youtube-nocookie.com",
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @ayman/web test -- proxy`
Expected: PASS.

- [ ] **Step 5: Add the copy**

In `packages/contracts/src/copy/ar.ts`, replace `attachments: 'الملفات المرفقة',`
inside `player` with:

```ts
    resources: 'مواد الدرس',
    mainPresentation: 'البريزنتيشن الأساسي',
    resourceVideo: 'فيديو شرح',
    resourceDocument: 'ملف',
    resourceLink: 'رابط',
    openInNewTab: 'افتح في تبويب جديد',
    viewerUnavailable: 'المتصفح مش قادر يعرض الملف — نزّله وشوفه.',
    noResources: 'مفيش مواد مرفوعة للدرس ده.',
```

and add a sibling `resource` namespace under `admin`:

```ts
    resource: {
      title: 'مواد الدرس',
      add: 'أضف مادة',
      kind: 'النوع',
      kindPresentation: 'بريزنتيشن أساسي',
      kindVideo: 'فيديو',
      kindDocument: 'ملف',
      kindLink: 'رابط',
      resourceTitle: 'الاسم',
      description: 'وصف مختصر',
      file: 'الملف',
      videoUrl: 'رابط يوتيوب',
      linkUrl: 'الرابط (https)',
      uploading: 'بنرفع…',
      remove: 'حذف',
      empty: 'لسه مفيش مواد. أضف البريزنتيشن الأساسي الأول.',
      onePresentationOnly: 'فيه بريزنتيشن أساسي واحد بس لكل درس.',
    },
```

- [ ] **Step 6: Typecheck to find every stale `copy.player.attachments` reference**

Run: `pnpm typecheck`
Expected: errors in `attachment-lesson.tsx` only — Task 7 replaces that file.

- [ ] **Step 7: Commit**

```bash
git add apps/web/proxy.ts apps/web/proxy.test.ts packages/contracts/src/copy/ar.ts
git commit -m "feat(web): frame our own viewer, and name the resource surface"
```

---

## Task 7: Student-facing resource UI

**Files:**
- Create: `apps/web/components/player/document-viewer.tsx`
- Create: `apps/web/components/player/resource-list.tsx`
- Create: `apps/web/components/player/resource-list.test.tsx`
- Modify: `apps/web/components/player/attachment-lesson.tsx`
- Modify: `apps/web/components/player/lesson-player.tsx`

**Interfaces:**
- Consumes: `PlayerResource` from `@ayman/contracts`; `copy.player.*` from Task 6.
- Produces: `<ResourceList resources={...} />`, `<DocumentViewer resource={...} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/player/resource-list.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlayerResource } from '@ayman/contracts';
import { ResourceList } from './resource-list';

const link: PlayerResource = {
  id: 'r1', kind: 'link', title: 'مرجع خارجي', description: null,
  filename: null, mime: null, sizeBytes: null, youtubeId: null,
  linkUrl: 'https://example.com/notes', viewPath: null, downloadPath: null,
};

const deck: PlayerResource = {
  id: 'r2', kind: 'presentation', title: 'المحاضرة الأولى', description: 'شرح الفصل الأول',
  filename: 'lecture-1.pdf', mime: 'application/pdf', sizeBytes: 2048, youtubeId: null,
  linkUrl: null,
  viewPath: '/api/lessons/l1/resources/r2/view',
  downloadPath: '/api/lessons/l1/resources/r2/download',
};

describe('ResourceList', () => {
  it('renders an external link with noopener and shows its hostname', () => {
    render(<ResourceList resources={[link]} />);
    const anchor = screen.getByRole('link', { name: /مرجع خارجي/ });
    expect(anchor).toHaveAttribute('href', 'https://example.com/notes');
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('gives a file resource both a viewer and a download', () => {
    render(<ResourceList resources={[deck]} />);
    expect(screen.getByTitle('المحاضرة الأولى')).toHaveAttribute(
      'src', '/api/lessons/l1/resources/r2/view',
    );
    expect(screen.getByRole('link', { name: /تحميل/ })).toHaveAttribute(
      'href', '/api/lessons/l1/resources/r2/download',
    );
  });

  it('marks the presentation as the main one', () => {
    render(<ResourceList resources={[deck]} />);
    expect(screen.getByText('البريزنتيشن الأساسي')).toBeInTheDocument();
  });

  it('renders the empty state when there is nothing', () => {
    render(<ResourceList resources={[]} />);
    expect(screen.getByText('مفيش مواد مرفوعة للدرس ده.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @ayman/web test -- resource-list`
Expected: FAIL — cannot resolve `./resource-list`.

- [ ] **Step 3: Implement `DocumentViewer`**

Create `apps/web/components/player/document-viewer.tsx`:

```tsx
import { copy, type PlayerResource } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { DownloadIcon } from './icons';

/**
 * The founder's requirement: a PDF opens like a page, and still has somewhere
 * to download from.
 *
 * The `src` is on OUR origin because `/media/*` is `@Public()`. Framing our own
 * origin is safe here because the response carries
 * `Content-Security-Policy: default-src 'none'; sandbox` — the document is in a
 * unique opaque origin with no script execution — so no `sandbox` attribute is
 * needed on the element, and adding one would break the built-in PDF viewer in
 * some browsers for no gain.
 *
 * `<iframe>` renders the browser's own viewer when it can and shows the
 * fallback when it cannot; the download link is always present either way.
 */
export function DocumentViewer({ resource }: { resource: PlayerResource }) {
  if (resource.viewPath === null || resource.downloadPath === null) return null;

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <iframe
        src={resource.viewPath}
        title={resource.title}
        className="block h-[36rem] w-full border-0 bg-surface-2"
        loading="lazy"
      >
        <p className="p-4 text-fg-muted">{copy.player.viewerUnavailable}</p>
      </iframe>
      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2">
        <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
          {resource.filename}
        </span>
        <a
          href={resource.downloadPath}
          className={cn(
            'mono inline-flex items-center gap-1.5',
            'text-[length:var(--fs-mono-label)] text-accent-text',
            'transition-colors duration-[160ms] ease-out hover:text-accent',
          )}
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          {copy.player.download}
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ResourceList`**

Create `apps/web/components/player/resource-list.tsx`:

```tsx
import { copy, type PlayerResource } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { DocumentViewer } from './document-viewer';
import { DocumentIcon } from './icons';

const c = copy.player;

/** Shown to the student so a link's destination is legible BEFORE they click.
 *  The URL is https-validated on write, so this never throws in practice —
 *  the try/catch is for a row written before that validation existed. */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function VideoResource({ resource }: { resource: PlayerResource }) {
  if (resource.youtubeId === null) return null;
  return (
    <div className="aspect-video overflow-hidden rounded-md border border-line">
      <iframe
        // Rebuilt from the 11-char id, never a stored URL.
        src={`https://www.youtube-nocookie.com/embed/${resource.youtubeId}`}
        title={resource.title}
        className="block h-full w-full border-0"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function LinkResource({ resource }: { resource: PlayerResource }) {
  if (resource.linkUrl === null) return null;
  const host = hostnameOf(resource.linkUrl);
  return (
    <a
      href={resource.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-md border border-line px-4 py-3',
        'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
      )}
    >
      <DocumentIcon className="text-fg-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg">{resource.title}</span>
        {host === null ? null : (
          <span className="mono block text-[length:var(--fs-mono-label)] text-fg-muted">
            {host}
          </span>
        )}
      </span>
      <span className="mono text-[length:var(--fs-mono-label)] text-accent-text">
        {c.openInNewTab}
      </span>
    </a>
  );
}

export function ResourceList({ resources }: { resources: PlayerResource[] }) {
  if (resources.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-fg-muted">{c.noResources}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <ul className="space-y-6">
      {resources.map((resource) => (
        <li key={resource.id}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">
              {resource.title}
            </h3>
            {resource.kind === 'presentation' ? (
              <span className="mono text-[length:var(--fs-mono-label)] text-accent-text">
                {c.mainPresentation}
              </span>
            ) : null}
          </div>
          {resource.description === null ? null : (
            <p className="mb-3 text-[length:var(--fs-text-sm)] text-fg-muted">
              {resource.description}
            </p>
          )}
          {resource.kind === 'video' ? <VideoResource resource={resource} /> : null}
          {resource.kind === 'link' ? <LinkResource resource={resource} /> : null}
          {resource.kind === 'presentation' || resource.kind === 'document' ? (
            <DocumentViewer resource={resource} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @ayman/web test -- resource-list`
Expected: PASS — four cases.

- [ ] **Step 6: Rewire `attachment-lesson.tsx`**

Replace the body of `apps/web/components/player/attachment-lesson.tsx` so it
takes `resources: PlayerResource[]` instead of `attachments`, keeps its
`useDwellComplete` call unchanged, and renders `<ResourceList>`:

```tsx
'use client';

import { type HeartbeatResponse, type PlayerResource } from '@ayman/contracts';
import { ResourceList } from './resource-list';
import { useDwellComplete } from './use-dwell-complete';

export interface AttachmentLessonProps {
  lessonId: string;
  resources: PlayerResource[];
  alreadyComplete: boolean;
  onProgress: (response: HeartbeatResponse) => void;
}

export function AttachmentLesson({
  lessonId,
  resources,
  alreadyComplete,
  onProgress,
}: AttachmentLessonProps) {
  useDwellComplete({ lessonId, enabled: !alreadyComplete, onResponse: onProgress });
  return <ResourceList resources={resources} />;
}
```

- [ ] **Step 7: Render resources under EVERY lesson kind**

In `apps/web/components/player/lesson-player.tsx`, find where the lesson body is
rendered per kind. Below that block — outside the kind switch, so it applies to
video, text and quiz lessons too — add:

```tsx
      {data.lesson.kind !== 'attachment' && data.resources.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">
            {copy.player.resources}
          </h2>
          <ResourceList resources={data.resources} />
        </section>
      ) : null}
```

The `attachment` kind is excluded because `AttachmentLesson` already *is* the
list — rendering both would show every resource twice.

Update the `AttachmentLesson` call site to pass `resources={data.resources}`.

- [ ] **Step 8: Verify the full web suite**

Run: `pnpm --filter @ayman/web test && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/player
git commit -m "feat(web): lesson materials render, with the deck in the page"
```

---

## Task 8: Admin resource editor

**Files:**
- Create: `apps/web/components/admin/lesson-resources.tsx`
- Modify: `apps/web/components/admin/course-editor.tsx`
- Modify: `apps/web/app/(admin)/admin/courses/actions.ts`

**Interfaces:**
- Consumes: `apiSend` from `apps/web/lib/api.ts`; `SortableList` from `apps/web/components/admin/sortable-list.tsx`; `copy.admin.resource.*` from Task 6; routes from Task 4 and `POST /api/media/documents` from Task 3.
- Produces: `<LessonResources lessonId={...} resources={...} />`.

- [ ] **Step 1: Add the server actions**

In `apps/web/app/(admin)/admin/courses/actions.ts`, add four actions following
the file's existing `apiSend` + `revalidateTag` pattern exactly:

```ts
export async function addResourceAction(lessonId: string, input: unknown) {
  return apiSend('POST', `/api/admin/lessons/${lessonId}/resources`, input);
}

export async function updateResourceAction(resourceId: string, input: unknown) {
  return apiSend('PATCH', `/api/admin/resources/${resourceId}`, input);
}

export async function removeResourceAction(resourceId: string) {
  return apiSend('DELETE', `/api/admin/resources/${resourceId}`);
}

export async function reorderResourcesAction(lessonId: string, orderedIds: string[]) {
  return apiSend('PATCH', `/api/admin/lessons/${lessonId}/resources/order`, { orderedIds });
}
```

Match the surrounding actions' `'use server'` placement, error shape and
`revalidateTag` calls — do not invent a different convention for these four.

- [ ] **Step 2: Build the panel**

Create `apps/web/components/admin/lesson-resources.tsx`, a client component
with:

- a kind `<Select>` (`presentation | video | document | link`) driving which
  field set shows — file input, YouTube URL, or link URL;
- `title` (required) and `description` (optional) on every kind;
- for file kinds, an upload that POSTs `multipart/form-data` to
  `/api/media/documents` and puts the returned
  `{storageKey, filename, mime, sizeBytes}` into the add payload — the browser
  never chooses the storage key;
- a `SortableList` over existing resources wired to `reorderResourcesAction`
  through the existing `useDebouncedReorder` hook;
- delete per row.

Disable the `presentation` option when one already exists and show
`copy.admin.resource.onePresentationOnly` — the partial unique index is the
real guarantee, this is only so the admin learns it before a 500 does.

Use `Field` + `issuesForPath` for errors, as every other admin form does.

- [ ] **Step 3: Mount it in the course editor**

In `apps/web/components/admin/course-editor.tsx`, render `<LessonResources>`
inside the expanded lesson panel for **every** lesson kind — not only
`attachment`. That is the point of Task 4 Step 3.

- [ ] **Step 4: Verify end-to-end by hand**

Run: `pnpm dev` and open `http://localhost:3200/admin/courses`.
Check, in order:
1. Upload a PDF as a **presentation** on a **video** lesson → it saves.
2. Adding a second presentation to that lesson → rejected with the Arabic message.
3. Add a YouTube URL as a video resource → the row stores an 11-char id
   (verify in `pnpm db:studio`, `lesson_resources.video_external_id`).
4. Paste `http://example.com` as a link → rejected.
5. Open that lesson as an enrolled student → the deck renders in the page and
   the download link works.
6. Sign out and hit the `/view` URL directly → 404, not the PDF.

Step 6 is the one that matters. If it returns bytes, stop and fix the guard.

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck clean, lint 0 errors, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/admin apps/web/app/\(admin\)/admin/courses/actions.ts
git commit -m "feat(web): admin composes lesson materials on any lesson kind"
```

---

## Self-review notes

**Spec coverage.** §4.5's model → Task 1; kind legality → Task 1 CHECKs + Task 2
transform; the "one main presentation" rule → Task 1 partial index + Task 8
Step 2; the document pipeline and its stated gap → Task 3; "any lesson kind may
carry resources" → Task 4 Step 3 and Task 7 Step 7 and Task 8 Step 3; the
in-page viewer and download → Task 5 + Task 7; `frame-src` → Task 6; §6's
https-only, 404-not-redirect, per-request authorization → Tasks 2, 5, 6.

**Deliberately deferred to Plan 10.** The `/view` and `/download` routes gate on
enrollment via `LessonAccessService.require`, which is the correct gate *today*.
When Plan 10 adds progression to that same method, both routes inherit it with
no change here — which is why the gate lives there and not in these controllers.

**Not covered by this plan.** `media_assets` rows are not created for documents;
`DocumentService` returns the key directly and the resource row is the record.
The library at `/admin/media` therefore lists images only, unchanged. Making
documents browsable there is worth doing and is not required by anything in the
spec, so it is not smuggled in here.
