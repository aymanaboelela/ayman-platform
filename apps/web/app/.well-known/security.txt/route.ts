import { connection } from 'next/server';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { SITE_URL } from '@/lib/seo/jsonld';
import { TENANT_CONTACT_FALLBACK } from '@/lib/tenant-contact';

/**
 * RFC 9116 — where to report a vulnerability.
 *
 * The contact is read from THIS stack's `site_settings.contact`, never
 * written here: one codebase serves every teacher (CLAUDE.md §2), and a
 * literal address would send a second teacher's reports to somebody else.
 * Email first because a report is long and has attachments; WhatsApp second
 * because it is the door every stack is guaranteed to have filled in.
 *
 * No contact at all → 404. `Contact` is the one REQUIRED field, and a file
 * without it is a scanner finding of its own.
 */
export async function GET(): Promise<Response> {
  // Same reason as `/llms.txt`: a prerendered entry over a `'use cache'`
  // loader 500s once it goes stale. See the comment there.
  await connection();

  const { contact } = await getPublicSettingsOrDefaults();
  const whatsapp = waMeHref(contact.whatsapp ?? TENANT_CONTACT_FALLBACK.whatsapp);
  const contacts = [contact.email ? `mailto:${contact.email}` : null, whatsapp].filter(Boolean);
  if (contacts.length === 0) return new Response('Not found', { status: 404 });

  /*
   * `Expires` is required and must not be more than a year out. Computed per
   * request rather than written down, so the file can never go stale — a
   * hand-dated one silently expires a year after whoever wrote it forgot.
   */
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const body = [
    ...contacts.map((c) => `Contact: ${c}`),
    `Expires: ${expires}`,
    'Preferred-Languages: ar, en',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
