import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { ACCENT_SLOTS } from '@ayman/contracts/admin/settings';
import { SUBJECTS, type SubjectSlug } from '@ayman/contracts/subjects';
import { GRADES, type GradeSlug } from '@ayman/contracts/grades';

/**
 * What «اعمل المنصة» sends.
 *
 * Local to the screen for the reason `../schema.ts` gives: the action never
 * leaves the Next server (it talks to Dokploy and Cloudflare, not to Nest), so
 * no second validator exists to share a schema with. It is still re-parsed
 * inside the action — a `'use server'` export is a POST endpoint any signed-in
 * browser can call, and the form's resolver is a convenience, not the gate.
 *
 * The patterns repeat `scripts/check-tenant-env.mjs` on purpose rather than
 * importing it: that file judges a finished env and answers in English for an
 * operator; this one judges a half-typed form and answers in Arabic beside the
 * field. The checker still runs over the generated file before anything is
 * created, so a rule only one of them knows cannot ship a broken stack.
 */

const c = copy.admin.tenants;

const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

/** A bare hostname: lower-case labels, a dot, no scheme, port or path. */
const HOST_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Keys that would make a stack look like somebody it is not. `ayman` is the
 * one the whole codebase reads as "this IS the owner's stack" (CLAUDE.md §2);
 * the others are names no instructor should be handed by accident.
 */
const RESERVED_KEYS = new Set(['ayman', 'admin', 'api', 'www', 'media', 'video', 'panel', 'dokploy']);

/** E.164 — `site_settings.contact.whatsapp`'s own rule — minus Egypt's kept
 *  trunk zero (`+200…`), which passes every generic E.164 regex and dials
 *  nobody. The preflight refuses it too. */
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

const optionalHttps = z
  .string()
  .trim()
  .refine((value) => value === '' || /^https:\/\/[^\s]+$/.test(value), c.errUrl);

/** Lower-cased and stripped of a pasted scheme or trailing slash BEFORE the
 *  pattern runs: «https://MohamedHassan.com/» is what people paste. */
const host = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  .pipe(z.string().regex(HOST_PATTERN, c.errHost));

const subjectSlugs = SUBJECTS.map((subject) => subject.slug) as [SubjectSlug, ...SubjectSlug[]];
const gradeSlugs = GRADES.map((grade) => grade.slug) as [GradeSlug, ...GradeSlug[]];

export const ProvisionRequestSchema = z
  .object({
    displayName: z.string().trim().min(2, c.errDisplayName).max(60, c.errDisplayName),
    subject: z.enum(subjectSlugs, { error: c.errSubject }),
    /** `TENANT_GRADES` — empty for a secondary teacher asked the old way. */
    grades: z.array(z.enum(gradeSlugs)),
    adminName: z.string().trim().min(2, c.errAdminName).max(60, c.errAdminName),
    adminEmail: z.string().trim().toLowerCase().pipe(z.email(c.errEmail)),
    whatsapp: z
      .string()
      .trim()
      .refine((value) => value === '' || (PHONE_PATTERN.test(value) && !value.startsWith('+200')), c.errPhone),
    appHost: host,
    mediaHost: host,
    key: z
      .string()
      .trim()
      .regex(TENANT_KEY_PATTERN, c.errKey)
      .refine((value) => !RESERVED_KEYS.has(value), c.errKeyReserved),
    /** The landing look on day one — `contracts/admin/tenant-branding.ts`. */
    landingPreset: z.enum(['classic', 'board', 'studio', 'neon', 'ruqaa', 'kurrasa', 'taif', 'sabboora', 'rihla', 'nujoom']),
    accent: z.enum(ACCENT_SLOTS),
    /** Same shape as the signing form's, for the reason written there. */
    features: z.record(z.string(), z.boolean()),
    shareKeys: z.boolean(),
    youtube: optionalHttps,
    instagram: optionalHttps,
    tiktok: optionalHttps,
    facebook: optionalHttps,
    whatsappChannel: optionalHttps,
  })
  .superRefine((value, context) => {
    // «الترمينال» is a programming page — code chrome everywhere — and a
    // non-programming stack refuses to render it (it falls back to classic),
    // so offering it there would be a choice that silently does nothing.
    if (value.landingPreset === 'neon' && value.subject !== 'programming_cs') {
      context.addIssue({ code: 'custom', path: ['landingPreset'], message: c.errPresetNeon });
    }
    // The preflight's rule: a programming stack has one fixed section.
    if (value.grades.length > 0 && value.subject === 'programming_cs') {
      context.addIssue({ code: 'custom', path: ['grades'], message: c.grades });
    }
    if (value.appHost === value.mediaHost) {
      context.addIssue({ code: 'custom', path: ['mediaHost'], message: c.errSameHost });
    }
  });

export type ProvisionRequest = z.input<typeof ProvisionRequestSchema>;
export type ProvisionInput = z.output<typeof ProvisionRequestSchema>;

/** `media.` under the site's own domain — one level deep, so Cloudflare's
 *  free certificate covers it (a second level, `media.x.y.com`, has none). */
export function defaultMediaHost(appHost: string): string {
  const clean = appHost.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return clean === '' ? '' : `media.${clean}`;
}
