import { MAX_SOCIAL_IMAGE_BYTES, SocialPostSchema, type SocialPost, type SocialPostFormat } from '@ayman/contracts/social/posts';
import { classify, post, type UploadOutcome } from '@/lib/upload-client';

/**
 * The picture the studio drew, from the browser straight to the API — never
 * through a Server Action, whose 1 MB body cap refuses a 1080×1920 story in
 * silence (`server-action-1mb-upload-ceiling`).
 *
 * A module of its own rather than one more export on `upload-client.ts`: a
 * new export on a client module that every upload screen imports would
 * shift Turbopack's module ids under tabs left open across a deploy.
 */
export async function uploadSocialImage(
  postId: string,
  format: SocialPostFormat,
  blob: Blob,
): Promise<UploadOutcome<SocialPost>> {
  if (blob.size > MAX_SOCIAL_IMAGE_BYTES) return { ok: false, reason: 'tooLarge' };
  const file = new File([blob], `post-${postId}.jpg`, { type: 'image/jpeg' });
  const path = `/api/admin/social/posts/${encodeURIComponent(postId)}/image?format=${format}`;
  const response = await post(path, file);
  if (!response) return { ok: false, reason: 'network' };
  if (response.status < 200 || response.status >= 300) return { ok: false, reason: classify(response.status, response.body) };
  try {
    return { ok: true, value: SocialPostSchema.parse(JSON.parse(response.body)) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
